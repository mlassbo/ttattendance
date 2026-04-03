const SWEDISH_TIME_ZONE = 'Europe/Stockholm'

const swedishDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SWEDISH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const swedishOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SWEDISH_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'shortOffset',
  hourCycle: 'h23',
})

function getSwedishDateParts(date: Date) {
  const parts = swedishDateFormatter.formatToParts(date)
  const year = Number(parts.find(part => part.type === 'year')?.value)
  const month = Number(parts.find(part => part.type === 'month')?.value)
  const day = Number(parts.find(part => part.type === 'day')?.value)

  if (!year || !month || !day) {
    throw new Error('Failed to resolve Swedish local date parts')
  }

  return { year, month, day }
}

function getSwedishOffsetMinutes(date: Date) {
  const offsetValue = swedishOffsetFormatter
    .formatToParts(date)
    .find(part => part.type === 'timeZoneName')?.value

  if (!offsetValue || offsetValue === 'GMT') {
    return 0
  }

  const match = offsetValue.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    throw new Error(`Unsupported Swedish offset format: ${offsetValue}`)
  }

  const [, sign, hours, minutes = '00'] = match
  const totalMinutes = Number(hours) * 60 + Number(minutes)
  return sign === '+' ? totalMinutes : -totalMinutes
}

function swedishLocalDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0)
  const initialGuess = new Date(utcGuessMs)
  const initialOffset = getSwedishOffsetMinutes(initialGuess)

  let resolved = new Date(utcGuessMs - initialOffset * 60_000)
  const resolvedOffset = getSwedishOffsetMinutes(resolved)

  if (resolvedOffset !== initialOffset) {
    resolved = new Date(utcGuessMs - resolvedOffset * 60_000)
  }

  return resolved
}

export function getCompetitionAttendanceOpensAt(startDate: string | Date) {
  const competitionStart = new Date(startDate)
  const { year, month, day } = getSwedishDateParts(competitionStart)

  return swedishLocalDateTimeToUtc(year, month, day - 1, 20, 0)
}

export function isCompetitionAttendanceOpen(startDate: string | Date, now: Date = new Date()) {
  return now.getTime() >= getCompetitionAttendanceOpensAt(startDate).getTime()
}

export const getClassAttendanceOpensAt = getCompetitionAttendanceOpensAt

export const isClassAttendanceOpen = isCompetitionAttendanceOpen

export function getPlayerAttendanceAvailability(
  classStartDate: string | Date,
  attendanceDeadline: string | Date,
  now: Date = new Date(),
) {
  const attendanceOpensAt = getClassAttendanceOpensAt(classStartDate)

  if (now.getTime() < attendanceOpensAt.getTime()) {
    return { state: 'not_open' as const, attendanceOpensAt }
  }

  if (now.getTime() > new Date(attendanceDeadline).getTime()) {
    return { state: 'deadline_passed' as const, attendanceOpensAt }
  }

  return { state: 'available' as const, attendanceOpensAt }
}

export function formatSwedishDateTime(date: string | Date) {
  return new Date(date).toLocaleString('sv-SE', {
    timeZone: SWEDISH_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatSwedishTime(date: string | Date) {
  return new Date(date).toLocaleTimeString('sv-SE', {
    timeZone: SWEDISH_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getAttendanceNotOpenMessage(opensAt: string | Date) {
  return `Närvarorapporteringen öppnar ${formatSwedishDateTime(opensAt)}.`
}