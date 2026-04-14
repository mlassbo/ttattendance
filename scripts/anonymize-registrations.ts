// Anonymizes competition_registrations.txt by replacing real player names with
// deterministic fake Swedish names. Club names, class names, counts, dates and
// overall structure are preserved. Safe to re-run — the same input always
// produces the same output.
//
// Run with: npx tsx scripts/anonymize-registrations.ts

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const FIRST_NAMES = [
  'Alva', 'Alvar', 'Anders', 'Anna', 'Arvid', 'Astrid', 'Axel', 'Bengt',
  'Bo', 'Carl', 'Cecilia', 'Daniel', 'David', 'Ebba', 'Elin', 'Elias',
  'Elisabeth', 'Emma', 'Erik', 'Eva', 'Felicia', 'Felix', 'Filip', 'Frida',
  'Gabriel', 'Greta', 'Gustav', 'Hanna', 'Hans', 'Henrik', 'Hugo', 'Ida',
  'Ingrid', 'Isak', 'Ivar', 'Jakob', 'Johan', 'Johanna', 'Jonas', 'Josefin',
  'Karl', 'Karin', 'Kerstin', 'Klara', 'Kristina', 'Lars', 'Leif', 'Lena',
  'Linda', 'Linnea', 'Lisa', 'Lovisa', 'Magnus', 'Maja', 'Malin', 'Maria',
  'Martin', 'Matilda', 'Mats', 'Mikael', 'Monika', 'Nils', 'Noel', 'Olof',
  'Oskar', 'Ove', 'Per', 'Peter', 'Rebecka', 'Saga', 'Sara', 'Selma',
  'Signe', 'Siri', 'Stina', 'Sten', 'Sven', 'Teodor', 'Tilde', 'Tobias',
  'Tyra', 'Ulf', 'Vera', 'Viktor', 'Vilma', 'Wilhelm', 'Yngve', 'Åke',
]

const LAST_NAMES = [
  'Almgren', 'Andersson', 'Axelsson', 'Berg', 'Bergkvist', 'Bergman',
  'Bergström', 'Björk', 'Björklund', 'Blom', 'Brandt', 'Claesson', 'Dahl',
  'Dahlberg', 'Dahlgren', 'Edlund', 'Ek', 'Ekström', 'Engström', 'Eriksson',
  'Fors', 'Forsberg', 'Forslund', 'Fransson', 'Gunnarsson', 'Gustafsson',
  'Hallberg', 'Hansson', 'Hedberg', 'Hedman', 'Hermansson', 'Holm',
  'Holmberg', 'Ingesson', 'Isaksson', 'Jansson', 'Johansson', 'Jonsson',
  'Jönsson', 'Karlsson', 'Kjellberg', 'Larsson', 'Lindberg', 'Lindell',
  'Lindgren', 'Lindholm', 'Lindqvist', 'Lindström', 'Ljung', 'Lund',
  'Lundberg', 'Lundgren', 'Lundin', 'Lundqvist', 'Magnusson', 'Melander',
  'Månsson', 'Mårtensson', 'Nilsson', 'Nordin', 'Nordström', 'Norén',
  'Nyberg', 'Nyström', 'Olsson', 'Palm', 'Persson', 'Pettersson',
  'Rydberg', 'Sandberg', 'Sjögren', 'Sjöström', 'Strand', 'Ström',
  'Sundberg', 'Svensson', 'Söder', 'Söderberg', 'Vikström', 'Wahlgren',
  'Wallin', 'Wiklund', 'Åberg', 'Åkesson', 'Öberg', 'Örn',
]

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function splitRegistration(line: string): { name: string; club: string } | null {
  const separator = line.indexOf(', ')
  if (separator === -1) return null

  const name = line.slice(0, separator).trim()
  const club = line.slice(separator + 2).trim()
  if (!name || !club) return null

  return { name, club }
}

function buildNameMap(pairs: Array<[string, string]>): Map<string, string> {
  const mapping = new Map<string, string>()
  const taken = new Set<string>()

  const unique = Array.from(
    new Map(pairs.map(([name, club]) => [`${name}|${club}`, [name, club] as const])).values()
  ).sort(([a1, b1], [a2, b2]) => `${a1}|${b1}`.localeCompare(`${a2}|${b2}`, 'sv'))

  for (const [realName, realClub] of unique) {
    const key = `${realName}|${realClub}`
    const seed = hashString(key)

    let assigned: string | null = null
    for (let attempt = 0; attempt < 10_000; attempt++) {
      const firstIndex = (seed + attempt * 13) % FIRST_NAMES.length
      const lastIndex = (Math.floor(seed / FIRST_NAMES.length) + attempt * 7) % LAST_NAMES.length
      const candidate = `${LAST_NAMES[lastIndex]} ${FIRST_NAMES[firstIndex]}`
      if (!taken.has(candidate)) {
        taken.add(candidate)
        assigned = candidate
        break
      }
    }

    if (!assigned) {
      throw new Error(`Could not generate unique fake name for "${realName}" / "${realClub}"`)
    }

    mapping.set(key, assigned)
  }

  return mapping
}

function main() {
  const filePath = path.resolve(process.cwd(), 'competition_registrations.txt')
  const original = readFileSync(filePath, 'utf8')
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const lines = original.split(/\r?\n/)

  const registrationPairs: Array<[string, string]> = []
  for (const line of lines) {
    const parsed = splitRegistration(line)
    if (parsed) registrationPairs.push([parsed.name, parsed.club])
  }

  if (registrationPairs.length === 0) {
    throw new Error('No registration lines found — refusing to overwrite file.')
  }

  const nameMap = buildNameMap(registrationPairs)

  const outputLines = lines.map(line => {
    const parsed = splitRegistration(line)
    if (!parsed) return line
    const fake = nameMap.get(`${parsed.name}|${parsed.club}`)
    if (!fake) return line
    return `${fake}, ${parsed.club}`
  })

  writeFileSync(filePath, outputLines.join(eol), 'utf8')

  console.log(
    `Anonymized ${registrationPairs.length} registration lines (${nameMap.size} unique players).`
  )
  console.log(`Wrote ${filePath}`)
}

main()
