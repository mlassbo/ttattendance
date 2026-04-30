export type ParsePoolTablesResult =
  | { ok: true; tables: number[] }
  | { ok: false; error: string }

export function parsePoolTables(input: string): ParsePoolTablesResult {
  const trimmed = input.trim()
  if (trimmed === '') {
    return { ok: true, tables: [] }
  }

  const parts = trimmed
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)

  const numbers: number[] = []
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { ok: false, error: 'Endast positiva heltal' }
    }
    const value = Number.parseInt(part, 10)
    if (!Number.isFinite(value) || value < 1) {
      return { ok: false, error: 'Bordnummer måste vara minst 1' }
    }
    numbers.push(value)
  }

  const unique = Array.from(new Set(numbers)).sort((a, b) => a - b)
  return { ok: true, tables: unique }
}

export function formatPoolTables(tables: number[]): string {
  return tables.join(', ')
}
