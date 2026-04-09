import {
  buildClassIdentityKey,
  buildPlayerKey,
  collapseWhitespace,
  normalizeIdentityPart,
  stockholmLocalToUtcIso,
  type RosterImportClass,
  type RosterImportDataset,
} from './planner'

const SCHEDULE_LINE_RE = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\(\d+\s+anm[aä]lda\)$/i
const TT_COORDINATOR_SOURCE_TYPE = 'ttcoordinator'

type ParsedSourceLine = {
  raw: string
  collapsed: string
  lineNumber: number
}

function isFixedNoiseLine(line: string): boolean {
  const normalized = normalizeIdentityPart(line)
  return normalized === 'deltagarlista'
    || normalized === 'alla klasser'
    || normalized.startsWith('tävlingen genomförs med hjälp av programmet tt coordinator')
    || normalized.startsWith('denna programlicens får endast användas vid tävlingar arrangerade av')
}

function isLikelyCompetitionTitle(lines: ParsedSourceLine[], index: number): boolean {
  const line = lines[index]
  if (!line || isFixedNoiseLine(line.collapsed) || SCHEDULE_LINE_RE.test(line.collapsed)) {
    return false
  }

  if (line.raw.includes(',')) {
    return false
  }

  const nextRelevant = lines.slice(index + 1).find(candidate => candidate.raw)
  if (nextRelevant && SCHEDULE_LINE_RE.test(nextRelevant.collapsed)) {
    return false
  }

  for (let offset = -2; offset <= 2; offset += 1) {
    if (offset === 0) continue
    const candidate = lines[index + offset]
    if (candidate && isFixedNoiseLine(candidate.collapsed)) {
      return true
    }
  }

  return false
}

function parseSourceLines(sourceText: string): {
  competitionTitleFromSource: string | null
  lines: ParsedSourceLine[]
} {
  const rawLines = sourceText
    .split(/\r?\n/)
    .map((line, index) => ({
      raw: line.trim(),
      collapsed: collapseWhitespace(line),
      lineNumber: index + 1,
    }))
    .filter(line => line.raw.length > 0)

  let competitionTitleFromSource: string | null = null
  const lines = rawLines.filter((line, index) => {
    if (isFixedNoiseLine(line.collapsed)) {
      return false
    }

    if (isLikelyCompetitionTitle(rawLines, index)) {
      competitionTitleFromSource ??= line.raw
      return false
    }

    return true
  })

  return { competitionTitleFromSource, lines }
}

function parseScheduleLine(line: string): { classDate: string; classTime: string; declaredCount: number } | null {
  const match = collapseWhitespace(line).match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+\((\d+)\s+anm[aä]lda\)$/i)
  if (!match) return null

  return {
    classDate: match[1],
    classTime: match[2],
    declaredCount: Number(match[3]),
  }
}

function parseRegistrationLine(line: string): { playerName: string; clubName: string } | null {
  const firstComma = line.indexOf(',')
  if (firstComma <= 0) {
    return null
  }

  const playerName = line.slice(0, firstComma).trim()
  const clubName = line.slice(firstComma + 1).trim()
  if (!playerName || !clubName) {
    return null
  }

  return { playerName, clubName }
}

export function parseCompetitionImportSource(sourceText: string): RosterImportDataset {
  const errors: string[] = []
  const { competitionTitleFromSource, lines } = parseSourceLines(sourceText)
  const classes: RosterImportClass[] = []
  let index = 0

  while (index < lines.length) {
    const classLine = lines[index]
    const scheduleLine = lines[index + 1]
    const parsedSchedule = scheduleLine ? parseScheduleLine(scheduleLine.collapsed) : null

    if (!parsedSchedule) {
      index += 1
      continue
    }

    const startAt = stockholmLocalToUtcIso(parsedSchedule.classDate, parsedSchedule.classTime)
    const identityKey = buildClassIdentityKey(classLine.raw, parsedSchedule.classDate, parsedSchedule.classTime)
    const registrations: RosterImportClass['registrations'] = []
    const seenRegistrationKeys = new Set<string>()

    index += 2

    while (index < lines.length) {
      const nextLine = lines[index]
      const nextSchedule = lines[index + 1]
      if (nextSchedule && parseScheduleLine(nextSchedule.collapsed)) {
        break
      }

      const parsedRegistration = parseRegistrationLine(nextLine.raw)
      if (!parsedRegistration) {
        errors.push(`Rad ${nextLine.lineNumber}: kunde inte läsa anmälan \"${nextLine.raw}\".`)
        index += 1
        continue
      }

      const playerKey = buildPlayerKey(parsedRegistration.playerName, parsedRegistration.clubName)
      if (seenRegistrationKeys.has(playerKey)) {
        errors.push(
          `Dubbel importerad anmälan i klassen ${classLine.raw}: ${parsedRegistration.playerName}, ${parsedRegistration.clubName}.`,
        )
      }
      seenRegistrationKeys.add(playerKey)

      registrations.push({
        playerName: parsedRegistration.playerName,
        clubName: parsedRegistration.clubName,
        playerKey,
      })
      index += 1
    }

    if (parsedSchedule.declaredCount !== registrations.length) {
      errors.push(
        `Klassen ${classLine.raw} har deklarerat ${parsedSchedule.declaredCount} anmälningar men ${registrations.length} kunde läsas.`,
      )
    }

    classes.push({
      externalClassKey: identityKey,
      identityKey,
      className: classLine.raw,
      startAt,
      classDate: parsedSchedule.classDate,
      classTime: parsedSchedule.classTime,
      registrations,
    })
  }

  if (classes.length === 0) {
    errors.push('Ingen klass kunde läsas från startlistan.')
  }

  const registrationCount = classes.reduce((total, classRow) => total + classRow.registrations.length, 0)
  if (registrationCount === 0) {
    errors.push('Ingen anmälan kunde läsas från startlistan.')
  }

  const uniquePlayers = new Set(
    classes.flatMap(classRow => classRow.registrations.map(registration => registration.playerKey)),
  )

  return {
    sourceType: TT_COORDINATOR_SOURCE_TYPE,
    competitionTitleFromSource,
    classes,
    errors,
    summary: {
      classesParsed: classes.length,
      playersParsed: uniquePlayers.size,
      registrationsParsed: registrationCount,
    },
  }
}