export type RegistrationStatus = 'registered' | 'reserve'

export type ReservePositionSource = {
  registrationId: string
  classId: string
  status: RegistrationStatus
  reserveJoinedAt: string | null
}

export type ReserveListEntrySource = ReservePositionSource & {
  name: string
  club: string | null
}

export function buildReservePositionMap(
  registrations: ReservePositionSource[],
): Map<string, number> {
  const reserveRegistrations = registrations
    .filter(registration => registration.status === 'reserve')
    .sort(compareReserveRegistrations)

  const positions = new Map<string, number>()
  let currentClassId: string | null = null
  let currentPosition = 0

  for (const registration of reserveRegistrations) {
    if (registration.classId !== currentClassId) {
      currentClassId = registration.classId
      currentPosition = 1
    } else {
      currentPosition += 1
    }

    positions.set(registration.registrationId, currentPosition)
  }

  return positions
}

export function buildReserveListEntries(
  registrations: ReserveListEntrySource[],
): Array<{
  registrationId: string
  position: number
  name: string
  club: string | null
  joinedAt: string | null
}> {
  const positions = buildReservePositionMap(registrations)

  return registrations
    .filter(registration => registration.status === 'reserve')
    .sort(compareReserveRegistrations)
    .map(registration => ({
      registrationId: registration.registrationId,
      position: positions.get(registration.registrationId) ?? 0,
      name: registration.name,
      club: registration.club,
      joinedAt: registration.reserveJoinedAt,
    }))
}

function compareReserveRegistrations(
  left: ReservePositionSource,
  right: ReservePositionSource,
) {
  if (left.classId !== right.classId) {
    return left.classId.localeCompare(right.classId)
  }

  const leftJoinedAt = left.reserveJoinedAt ?? '9999-12-31T23:59:59.999Z'
  const rightJoinedAt = right.reserveJoinedAt ?? '9999-12-31T23:59:59.999Z'

  if (leftJoinedAt !== rightJoinedAt) {
    return leftJoinedAt.localeCompare(rightJoinedAt)
  }

  return left.registrationId.localeCompare(right.registrationId)
}