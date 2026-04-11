import { buildDaySessionOrderMap } from './session-order'
import {
  buildReserveListEntries,
  buildReservePositionMap,
  type RegistrationStatus,
} from './reserve-status'
import { createServerClient } from './supabase'

type ServerClient = ReturnType<typeof createServerClient>

type SearchPlayerRow = {
  id: string
  name: string
  club: string | null
}

type SessionRow = {
  id: string
  name: string
  date: string
  session_order: number
}

type CompetitionSessionRow = {
  id: string
  date: string
  session_order: number
}

type ClassRow = {
  id: string
  name: string
  start_time: string | null
  attendance_deadline: string | null
  sessions: RelationValue<SessionRow>
}

type AttendanceRow = {
  status: 'confirmed' | 'absent'
  reported_at: string
}

type RelationValue<T> = T | T[] | null | undefined

type RegistrationRow = {
  id: string
  player_id: string
  class_id: string
  status: RegistrationStatus
  reserve_joined_at: string | null
  classes: RelationValue<ClassRow>
  attendance?: RelationValue<AttendanceRow>
}

type PlayerRow = {
  id: string
  name: string
  club: string | null
}

type ClassRegistrationPlayerRow = {
  id: string
  class_id: string
  status: RegistrationStatus
  reserve_joined_at: string | null
  players: RelationValue<PlayerRow>
}

type ClubCountRow = {
  club: string | null
}

export type PublicSearchMode = 'all' | 'player' | 'club' | 'class'

export interface PublicCompetition {
  id: string
  name: string
  slug: string
}

export interface PublicClassRegistration {
  registrationId: string
  status: RegistrationStatus
  reservePosition: number | null
  class: {
    id: string | null
    name: string
    startTime: string | null
    attendanceDeadline: string | null
    session: {
      id: string
      name: string
      date: string
      sessionOrder: number
      daySessionOrder?: number
    } | null
  }
  attendance: {
    status: 'confirmed' | 'absent'
    reportedAt: string
  } | null
}

export interface PublicReserveEntry {
  registrationId: string
  position: number
  name: string
  club: string | null
  joinedAt: string | null
}

export interface PublicRegistrationGroup {
  session: PublicClassRegistration['class']['session']
  registrations: PublicClassRegistration[]
}

export interface PublicSearchPlayer {
  id: string
  name: string
  club: string | null
  classCount: number
  classNames: string[]
  registrations: PublicClassRegistration[]
}

export interface PublicSearchClub {
  name: string
  playerCount: number
}

export interface PublicSearchClass {
  id: string
  name: string
  startTime: string | null
  attendanceDeadline: string | null
  session: PublicClassRegistration['class']['session']
  playerCount: number
  players: PlayerRow[]
  reserveList: PublicReserveEntry[]
}

export interface PublicSearchClassSuggestion {
  id: string
  name: string
}

export interface PublicPlayerDetails {
  player: PlayerRow
  registrations: PublicClassRegistration[]
  sessionGroups: PublicRegistrationGroup[]
}

export interface PublicClubDetails {
  clubName: string
  players: Array<{
    id: string
    name: string
    classCount: number
    registrations: PublicClassRegistration[]
    sessionGroups: PublicRegistrationGroup[]
  }>
}

const QUERY_PAGE_SIZE = 1000

export async function getPublicCompetitionBySlug(
  supabase: ServerClient,
  slug: string,
): Promise<PublicCompetition | null> {
  const { data: competition, error } = await supabase
    .from('competitions')
    .select('id, name, slug')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return competition ?? null
}

export async function searchPublicCompetition(
  supabase: ServerClient,
  competitionId: string,
  query: string,
  mode: PublicSearchMode,
): Promise<{ players: PublicSearchPlayer[]; clubs: PublicSearchClub[]; classes: PublicSearchClass[] }> {
  const searchTerm = query.trim()

  if (searchTerm.length < 2) {
    return { players: [], clubs: [], classes: [] }
  }

  const players = mode === 'club' || mode === 'class'
    ? []
    : await searchPlayersWithRegistrations(supabase, competitionId, searchTerm, 'player')
  const clubs = mode === 'player' || mode === 'class'
    ? []
    : await searchClubs(supabase, competitionId, searchTerm)
  const classes = mode === 'player' || mode === 'club'
    ? []
    : await searchClasses(supabase, competitionId, searchTerm)

  return { players, clubs, classes }
}

export async function getPublicCompetitionClassSuggestions(
  supabase: ServerClient,
  competitionId: string,
): Promise<PublicSearchClassSuggestion[]> {
  const daySessionOrderById = await getDaySessionOrderMap(supabase, competitionId)
  const { data: classRows, error } = await supabase
    .from('classes')
    .select(`
      id,
      name,
      start_time,
      attendance_deadline,
      sessions!inner (
        id,
        name,
        date,
        session_order,
        competition_id
      )
    `)
    .eq('sessions.competition_id', competitionId)

  if (error) {
    throw new Error(error.message)
  }

  return ((classRows ?? []) as ClassRow[])
    .sort((left, right) => comparePublicClassRows(left, right, daySessionOrderById))
    .map(classRow => ({
      id: classRow.id,
      name: classRow.name,
    }))
}

export async function getPublicPlayerDetails(
  supabase: ServerClient,
  competitionId: string,
  playerId: string,
): Promise<PublicPlayerDetails | null> {
  const { data: player, error } = await supabase
    .from('players')
    .select('id, name, club')
    .eq('id', playerId)
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!player) {
    return null
  }

  const daySessionOrderById = await getDaySessionOrderMap(supabase, competitionId)
  const registrations = await getRegistrationsByPlayerIds(supabase, [playerId], daySessionOrderById)
  const playerRegistrations = registrations.get(playerId) ?? []

  return {
    player,
    registrations: playerRegistrations,
    sessionGroups: buildRegistrationGroups(playerRegistrations),
  }
}

export async function getPublicClubDetails(
  supabase: ServerClient,
  competitionId: string,
  clubName: string,
): Promise<PublicClubDetails | null> {
  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, club')
    .eq('competition_id', competitionId)
    .eq('club', clubName)
    .order('name', { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  if (!players || players.length === 0) {
    return null
  }

  const daySessionOrderById = await getDaySessionOrderMap(supabase, competitionId)
  const registrationsByPlayerId = await getRegistrationsByPlayerIds(
    supabase,
    players.map(player => player.id),
    daySessionOrderById,
  )

  return {
    clubName,
    players: players.map(player => {
      const registrations = registrationsByPlayerId.get(player.id) ?? []

      return {
        id: player.id,
        name: player.name,
        classCount: registrations.length,
        registrations,
        sessionGroups: buildRegistrationGroups(registrations),
      }
    }),
  }
}

async function searchPlayersRaw(
  supabase: ServerClient,
  competitionId: string,
  query: string,
  mode: 'player' | 'club',
): Promise<SearchPlayerRow[]> {
  const { data, error } = await supabase.rpc('search_players', {
    p_competition_id: competitionId,
    p_query: query,
    p_mode: mode,
  })

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as SearchPlayerRow[]).sort((left, right) =>
    left.name.localeCompare(right.name, 'sv'),
  )
}

async function searchPlayersWithRegistrations(
  supabase: ServerClient,
  competitionId: string,
  query: string,
  mode: 'player' | 'club',
): Promise<PublicSearchPlayer[]> {
  const players = await searchPlayersRaw(supabase, competitionId, query, mode)

  if (players.length === 0) {
    return []
  }

  const daySessionOrderById = await getDaySessionOrderMap(supabase, competitionId)
  const registrationsByPlayerId = await getRegistrationsByPlayerIds(
    supabase,
    players.map(player => player.id),
    daySessionOrderById,
  )

  return players.map(player => {
    const registrations = registrationsByPlayerId.get(player.id) ?? []

    return {
      id: player.id,
      name: player.name,
      club: player.club,
      classCount: registrations.length,
      classNames: Array.from(new Set(registrations.map(registration => registration.class.name))).sort(
        (left, right) => left.localeCompare(right, 'sv'),
      ),
      registrations,
    }
  })
}

async function searchClasses(
  supabase: ServerClient,
  competitionId: string,
  query: string,
): Promise<PublicSearchClass[]> {
  const daySessionOrderById = await getDaySessionOrderMap(supabase, competitionId)
  const { data: classRows, error } = await supabase
    .from('classes')
    .select(`
      id,
      name,
      start_time,
      attendance_deadline,
      sessions!inner (
        id,
        name,
        date,
        session_order,
        competition_id
      )
    `)
    .eq('sessions.competition_id', competitionId)
    .ilike('name', `%${query}%`)

  if (error) {
    throw new Error(error.message)
  }

  const matchedClasses = (classRows ?? []) as ClassRow[]
  if (matchedClasses.length === 0) {
    return []
  }

  const registrations = await fetchAllPages<ClassRegistrationPlayerRow>(async (from, to) =>
    await supabase
      .from('registrations')
      .select(`
        id,
        class_id,
        status,
        reserve_joined_at,
        players (
          id,
          name,
          club
        )
      `)
      .in('class_id', matchedClasses.map(classRow => classRow.id))
      .range(from, to),
  )

  const playersByClassId = new Map<string, PlayerRow[]>()
  const reserveListByClassId = new Map<string, PublicReserveEntry[]>()
  const reserveClassIdByRegistrationId = new Map<string, string>()
  const reserveSources: Array<{
    registrationId: string
    classId: string
    status: RegistrationStatus
    reserveJoinedAt: string | null
    name: string
    club: string | null
  }> = []
  for (const registration of (registrations ?? []) as ClassRegistrationPlayerRow[]) {
    const player = getSingleRelation(registration.players)
    if (!player) {
      continue
    }

    if (registration.status === 'reserve') {
      reserveClassIdByRegistrationId.set(registration.id, registration.class_id)
      reserveSources.push({
        registrationId: registration.id,
        classId: registration.class_id,
        status: registration.status,
        reserveJoinedAt: registration.reserve_joined_at,
        name: player.name,
        club: player.club,
      })
      continue
    }

    const players = playersByClassId.get(registration.class_id) ?? []
    players.push(player)
    playersByClassId.set(registration.class_id, players)
  }

  for (const players of Array.from(playersByClassId.values())) {
    players.sort((left, right) => left.name.localeCompare(right.name, 'sv'))
  }

  for (const entry of buildReserveListEntries(reserveSources)) {
    const classId = reserveClassIdByRegistrationId.get(entry.registrationId)
    if (!classId) {
      continue
    }

    const reserveList = reserveListByClassId.get(classId) ?? []
    reserveList.push(entry)
    reserveListByClassId.set(classId, reserveList)
  }

  return matchedClasses
    .sort((left, right) => comparePublicClassRows(left, right, daySessionOrderById))
    .map(classRow => ({
      ...buildPublicClassDetails(classRow, daySessionOrderById),
      playerCount: (playersByClassId.get(classRow.id) ?? []).length,
      players: playersByClassId.get(classRow.id) ?? [],
      reserveList: reserveListByClassId.get(classRow.id) ?? [],
    }))
}

async function searchClubs(
  supabase: ServerClient,
  competitionId: string,
  query: string,
): Promise<PublicSearchClub[]> {
  const matchingPlayers = await searchPlayersRaw(supabase, competitionId, query, 'club')
  const clubNames = Array.from(
    new Set(
      matchingPlayers
        .map(player => player.club?.trim())
        .filter((club): club is string => Boolean(club)),
    ),
  )

  if (clubNames.length === 0) {
    return []
  }

  const clubPlayers = await fetchAllPages<ClubCountRow>(async (from, to) =>
    await supabase
      .from('players')
      .select('club')
      .eq('competition_id', competitionId)
      .in('club', clubNames)
      .range(from, to),
  )

  const playerCountByClub = new Map<string, number>()
  for (const player of (clubPlayers ?? []) as ClubCountRow[]) {
    if (!player.club) {
      continue
    }

    playerCountByClub.set(player.club, (playerCountByClub.get(player.club) ?? 0) + 1)
  }

  return clubNames
    .map(clubName => ({
      name: clubName,
      playerCount: playerCountByClub.get(clubName) ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'sv'))
}

async function getDaySessionOrderMap(
  supabase: ServerClient,
  competitionId: string,
): Promise<Map<string, number>> {
  const { data: competitionSessions, error } = await supabase
    .from('sessions')
    .select('id, date, session_order')
    .eq('competition_id', competitionId)

  if (error) {
    throw new Error(error.message)
  }

  return buildDaySessionOrderMap((competitionSessions ?? []) as CompetitionSessionRow[])
}

async function getRegistrationsByPlayerIds(
  supabase: ServerClient,
  playerIds: string[],
  daySessionOrderById: Map<string, number>,
): Promise<Map<string, PublicClassRegistration[]>> {
  if (playerIds.length === 0) {
    return new Map()
  }

  const registrations = await fetchAllPages<RegistrationRow>(async (from, to) =>
    await supabase
      .from('registrations')
      .select(`
        id,
        player_id,
        class_id,
        status,
        reserve_joined_at,
        classes (
          id,
          name,
          start_time,
          attendance_deadline,
          sessions (
            id,
            name,
            date,
            session_order
          )
        ),
        attendance (
          status,
          reported_at
        )
      `)
      .in('player_id', playerIds)
      .range(from, to),
  )

  const registrationsByPlayerId = new Map<string, PublicClassRegistration[]>()
  const reservePositions = buildReservePositionMap(
    ((registrations ?? []) as RegistrationRow[])
      .filter(registration => registration.status === 'reserve')
      .map(registration => ({
        registrationId: registration.id,
        classId: registration.class_id,
        status: registration.status,
        reserveJoinedAt: registration.reserve_joined_at,
      }))
  )

  for (const registration of (registrations ?? []) as unknown as RegistrationRow[]) {
    const cls = getSingleRelation(registration.classes)

    if (!cls) {
      continue
    }

    const attendance = getSingleRelation(registration.attendance)
    const session = getSingleRelation(cls.sessions)

    const groupedRegistrations = registrationsByPlayerId.get(registration.player_id) ?? []
    groupedRegistrations.push({
      registrationId: registration.id,
      status: registration.status,
      reservePosition: registration.status === 'reserve'
        ? (reservePositions.get(registration.id) ?? null)
        : null,
      class: {
        id: cls.id,
        name: cls.name,
        startTime: cls.start_time,
        attendanceDeadline: cls.attendance_deadline,
        session: session
          ? {
              id: session.id,
              name: session.name,
              date: session.date,
              sessionOrder: session.session_order,
              daySessionOrder:
                daySessionOrderById.get(session.id) ??
                session.session_order,
            }
          : null,
      },
      attendance: attendance
        ? {
            status: attendance.status,
            reportedAt: attendance.reported_at,
          }
        : null,
    })
    registrationsByPlayerId.set(registration.player_id, groupedRegistrations)
  }

  for (const registrationsForPlayer of Array.from(registrationsByPlayerId.values())) {
    registrationsForPlayer.sort((left, right) => {
      const leftSessionDate = left.class.session?.date ?? '9999-12-31'
      const rightSessionDate = right.class.session?.date ?? '9999-12-31'

      if (leftSessionDate !== rightSessionDate) {
        return leftSessionDate.localeCompare(rightSessionDate)
      }

      const leftSessionOrder =
        left.class.session?.daySessionOrder ??
        left.class.session?.sessionOrder ??
        Number.MAX_SAFE_INTEGER
      const rightSessionOrder =
        right.class.session?.daySessionOrder ??
        right.class.session?.sessionOrder ??
        Number.MAX_SAFE_INTEGER

      if (leftSessionOrder !== rightSessionOrder) {
        return leftSessionOrder - rightSessionOrder
      }

      const leftStartTime = left.class.startTime ?? '9999-12-31T23:59:59.999Z'
      const rightStartTime = right.class.startTime ?? '9999-12-31T23:59:59.999Z'

      if (leftStartTime !== rightStartTime) {
        return leftStartTime.localeCompare(rightStartTime)
      }

      return left.class.name.localeCompare(right.class.name, 'sv')
    })
  }

  return registrationsByPlayerId
}

function buildRegistrationGroups(registrations: PublicClassRegistration[]): PublicRegistrationGroup[] {
  const groups = new Map<string, PublicRegistrationGroup>()

  for (const registration of registrations) {
    const key = registration.class.session?.id ?? 'unknown'
    const existingGroup = groups.get(key)

    if (existingGroup) {
      existingGroup.registrations.push(registration)
      continue
    }

    groups.set(key, {
      session: registration.class.session,
      registrations: [registration],
    })
  }

  return Array.from(groups.values())
}

function getSingleRelation<T>(value: RelationValue<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + QUERY_PAGE_SIZE - 1
    const { data, error } = await fetchPage(from, to)

    if (error) {
      throw new Error(error.message)
    }

    const pageRows = data ?? []
    rows.push(...pageRows)

    if (pageRows.length < QUERY_PAGE_SIZE) {
      return rows
    }

    from += QUERY_PAGE_SIZE
  }
}

function buildPublicClassDetails(
  classRow: ClassRow,
  daySessionOrderById: Map<string, number>,
) {
  const session = getSingleRelation(classRow.sessions)

  return {
    id: classRow.id,
    name: classRow.name,
    startTime: classRow.start_time,
    attendanceDeadline: classRow.attendance_deadline,
    session: session
      ? {
          id: session.id,
          name: session.name,
          date: session.date,
          sessionOrder: session.session_order,
          daySessionOrder:
            daySessionOrderById.get(session.id) ??
            session.session_order,
        }
      : null,
  }
}

function comparePublicClassRows(
  left: ClassRow,
  right: ClassRow,
  daySessionOrderById: Map<string, number>,
) {
  const leftSession = getSingleRelation(left.sessions)
  const rightSession = getSingleRelation(right.sessions)
  const leftSessionDate = leftSession?.date ?? '9999-12-31'
  const rightSessionDate = rightSession?.date ?? '9999-12-31'

  if (leftSessionDate !== rightSessionDate) {
    return leftSessionDate.localeCompare(rightSessionDate)
  }

  const leftSessionOrder = leftSession
    ? (daySessionOrderById.get(leftSession.id) ?? leftSession.session_order)
    : Number.MAX_SAFE_INTEGER
  const rightSessionOrder = rightSession
    ? (daySessionOrderById.get(rightSession.id) ?? rightSession.session_order)
    : Number.MAX_SAFE_INTEGER

  if (leftSessionOrder !== rightSessionOrder) {
    return leftSessionOrder - rightSessionOrder
  }

  const leftStartTime = left.start_time ?? '9999-12-31T23:59:59.999Z'
  const rightStartTime = right.start_time ?? '9999-12-31T23:59:59.999Z'

  if (leftStartTime !== rightStartTime) {
    return leftStartTime.localeCompare(rightStartTime)
  }

  return left.name.localeCompare(right.name, 'sv')
}