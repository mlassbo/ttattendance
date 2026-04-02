interface CompetitionSessionRow {
  id: string
  date: string
  session_order: number
}

export function buildDaySessionOrderMap(sessions: CompetitionSessionRow[]) {
  const sortedSessions = [...sessions].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date)
    }

    return left.session_order - right.session_order
  })

  const dayCounters = new Map<string, number>()
  const daySessionOrderById = new Map<string, number>()

  for (const session of sortedSessions) {
    const nextOrder = (dayCounters.get(session.date) ?? 0) + 1
    dayCounters.set(session.date, nextOrder)
    daySessionOrderById.set(session.id, nextOrder)
  }

  return daySessionOrderById
}