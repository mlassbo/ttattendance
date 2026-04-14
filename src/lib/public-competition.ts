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
  max_players: number | null
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

type ReservePositionRow = {
  id: string
  class_id: string
  status: RegistrationStatus
  reserve_joined_at: string | null
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

type ClassDashboardRow = {
  id: string
  session_id: string
  name: string
  start_time: string | null
  max_players: number | null
}

type ClassDashboardRegistrationRow = {
  class_id: string
  status: RegistrationStatus
}

type CompetitionClassNameRow = {
  id: string
  name: string
}

type OnDataIntegrationStatusRow = {
  current_snapshot_id: string | null
}

type OnDataSnapshotClassRow = {
  id: string
  class_name: string
}

type OnDataSnapshotPoolRow = {
  id: string
  snapshot_class_id: string
  pool_number: number
  pool_order: number
}

type OnDataSnapshotPlayerRow = {
  snapshot_pool_id: string
  player_order: number
  name: string
  club: string | null
}

export type PublicSearchMode = 'all' | 'player' | 'club' | 'class'
export type ClassLiveStatus = 'none' | 'pools_available'

export interface PublicCompetition {
  id: string
  name: string
  slug: string
}

export interface ClassDashboardSession {
  id: string
  name: string
  date: string
  sessionOrder: number
  classes: ClassDashboardEntry[]
}

export interface ClassDashboardEntry {
  id: string
  name: string
  startTime: string | null
  maxPlayers: number | null
  registeredCount: number
  reserveCount: number
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
  maxPlayers: number | null
  session: PublicClassRegistration['class']['session']
  playerCount: number
  players: PlayerRow[]
  reserveList: PublicReserveEntry[]
}

export interface PublicSearchClassSuggestion {
  id: string
  name: string
}

export interface ClassLivePool {
  poolNumber: number
  players: Array<{ name: string; club: string | null }>
}

export interface ClassLiveData {
  pools: ClassLivePool[]
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

export async function getClassDashboard(
  supabase: ServerClient,
  competitionId: string,
): Promise<ClassDashboardSession[]> {
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, name, date, session_order')
    .eq('competition_id', competitionId)
    .order('date', { ascending: true })
    .order('session_order', { ascending: true })

  if (sessionsError) {
    throw new Error(sessionsError.message)
  }

  const sessionRows = (sessions ?? []) as SessionRow[]
  if (sessionRows.length === 0) {
    return []
  }

  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('id, session_id, name, start_time, max_players')
    .in('session_id', sessionRows.map(session => session.id))

  if (classesError) {
    throw new Error(classesError.message)
  }

  const classRows = (classes ?? []) as ClassDashboardRow[]
  if (classRows.length === 0) {
    return []
  }

  const registrations = await fetchAllPages<ClassDashboardRegistrationRow>(async (from, to) =>
    await supabase
      .from('registrations')
      .select('class_id, status')
      .in('class_id', classRows.map(classRow => classRow.id))
      .in('status', ['registered', 'reserve'])
      .range(from, to),
  )

  const registeredCountByClassId = new Map<string, number>()
  const reserveCountByClassId = new Map<string, number>()

  for (const registration of registrations) {
    if (registration.status === 'registered') {
      registeredCountByClassId.set(
        registration.class_id,
        (registeredCountByClassId.get(registration.class_id) ?? 0) + 1,
      )
      continue
    }

    if (registration.status === 'reserve') {
      reserveCountByClassId.set(
        registration.class_id,
        (reserveCountByClassId.get(registration.class_id) ?? 0) + 1,
      )
    }
  }

  return sessionRows
    .map(session => ({
      id: session.id,
      name: session.name,
      date: session.date,
      sessionOrder: session.session_order,
      classes: classRows
        .filter(classRow => classRow.session_id === session.id)
        .sort((left, right) => {
          const leftStartTime = left.start_time ?? '9999-12-31T23:59:59.999Z'
          const rightStartTime = right.start_time ?? '9999-12-31T23:59:59.999Z'

          if (leftStartTime !== rightStartTime) {
            return leftStartTime.localeCompare(rightStartTime)
          }

          return left.name.localeCompare(right.name, 'sv')
        })
        .map(classRow => ({
          id: classRow.id,
          name: classRow.name,
          startTime: classRow.start_time,
          maxPlayers: classRow.max_players,
          registeredCount: registeredCountByClassId.get(classRow.id) ?? 0,
          reserveCount: reserveCountByClassId.get(classRow.id) ?? 0,
        })),
    }))
    .filter(session => session.classes.length > 0)
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
      max_players,
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

export async function getPublicClassDetails(
  supabase: ServerClient,
  competitionId: string,
  classId: string,
): Promise<PublicSearchClass | null> {
  const { data: classRow, error } = await supabase
    .from('classes')
    .select(`
      id,
      name,
      start_time,
      attendance_deadline,
      max_players,
      sessions!inner (
        id,
        name,
        date,
        session_order,
        competition_id
      )
    `)
    .eq('id', classId)
    .eq('sessions.competition_id', competitionId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!classRow) {
    return null
  }

  const daySessionOrderById = await getDaySessionOrderMap(supabase, competitionId)
  const classes = await buildPublicSearchClasses(
    supabase,
    [classRow as ClassRow],
    daySessionOrderById,
  )

  return classes[0] ?? null
}

export async function getClassLiveData(
  supabase: ServerClient,
  competitionId: string,
  classId: string,
): Promise<ClassLiveData | null> {
  const { data: classRow, error: classError } = await supabase
    .from('classes')
    .select(`
      name,
      sessions!inner (
        competition_id
      )
    `)
    .eq('id', classId)
    .eq('sessions.competition_id', competitionId)
    .maybeSingle()

  if (classError) {
    throw new Error(classError.message)
  }

  if (!classRow) {
    return null
  }

  const currentSnapshotId = await getCurrentOnDataSnapshotId(supabase, competitionId)
  if (!currentSnapshotId) {
    return null
  }

  const { data: snapshotClass, error: snapshotClassError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .select('id')
    .eq('snapshot_id', currentSnapshotId)
    .eq('class_name', classRow.name)
    .maybeSingle()

  if (snapshotClassError) {
    throw new Error(snapshotClassError.message)
  }

  if (!snapshotClass) {
    return null
  }

  const { data: pools, error: poolsError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .select('id, snapshot_class_id, pool_number, pool_order')
    .eq('snapshot_class_id', snapshotClass.id)
    .order('pool_order', { ascending: true })

  if (poolsError) {
    throw new Error(poolsError.message)
  }

  const poolRows = (pools ?? []) as OnDataSnapshotPoolRow[]
  if (poolRows.length === 0) {
    return null
  }

  const { data: players, error: playersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .select('snapshot_pool_id, player_order, name, club')
    .in('snapshot_pool_id', poolRows.map(pool => pool.id))
    .order('player_order', { ascending: true })

  if (playersError) {
    throw new Error(playersError.message)
  }

  const playersByPoolId = new Map<string, Array<{ name: string; club: string | null }>>()
  for (const player of (players ?? []) as OnDataSnapshotPlayerRow[]) {
    const poolPlayers = playersByPoolId.get(player.snapshot_pool_id) ?? []
    poolPlayers.push({
      name: player.name,
      club: player.club,
    })
    playersByPoolId.set(player.snapshot_pool_id, poolPlayers)
  }

  const livePools = poolRows.map(pool => ({
    poolNumber: pool.pool_number,
    players: playersByPoolId.get(pool.id) ?? [],
  }))

  if (livePools.every(pool => pool.players.length === 0)) {
    return null
  }

  return {
    pools: livePools,
  }
}

export async function getClassDashboardLiveStatus(
  supabase: ServerClient,
  competitionId: string,
): Promise<Map<string, ClassLiveStatus>> {
  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select(`
      id,
      name,
      sessions!inner (
        competition_id
      )
    `)
    .eq('sessions.competition_id', competitionId)

  if (classesError) {
    throw new Error(classesError.message)
  }

  const localClasses = (classes ?? []) as CompetitionClassNameRow[]
  const liveStatus = new Map<string, ClassLiveStatus>(
    localClasses.map(classRow => [classRow.id, 'none']),
  )

  if (localClasses.length === 0) {
    return liveStatus
  }

  const currentSnapshotId = await getCurrentOnDataSnapshotId(supabase, competitionId)
  if (!currentSnapshotId) {
    return liveStatus
  }

  const { data: snapshotClasses, error: snapshotClassesError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .select('id, class_name')
    .eq('snapshot_id', currentSnapshotId)

  if (snapshotClassesError) {
    throw new Error(snapshotClassesError.message)
  }

  const snapshotClassRows = (snapshotClasses ?? []) as OnDataSnapshotClassRow[]
  if (snapshotClassRows.length === 0) {
    return liveStatus
  }

  const { data: pools, error: poolsError } = await supabase
    .from('ondata_integration_snapshot_pools')
    .select('id, snapshot_class_id')
    .in('snapshot_class_id', snapshotClassRows.map(snapshotClass => snapshotClass.id))

  if (poolsError) {
    throw new Error(poolsError.message)
  }

  const poolRows = (pools ?? []) as Array<Pick<OnDataSnapshotPoolRow, 'id' | 'snapshot_class_id'>>
  if (poolRows.length === 0) {
    return liveStatus
  }

  const poolClassIdByPoolId = new Map(
    poolRows.map(poolRow => [poolRow.id, poolRow.snapshot_class_id]),
  )

  const { data: players, error: playersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .select('snapshot_pool_id')
    .in('snapshot_pool_id', poolRows.map(pool => pool.id))

  if (playersError) {
    throw new Error(playersError.message)
  }

  const snapshotClassIdsWithPlayers = new Set<string>()
  for (const player of (players ?? []) as Array<Pick<OnDataSnapshotPlayerRow, 'snapshot_pool_id'>>) {
    const snapshotClassId = poolClassIdByPoolId.get(player.snapshot_pool_id)
    if (snapshotClassId) {
      snapshotClassIdsWithPlayers.add(snapshotClassId)
    }
  }

  const localClassIdsByName = new Map<string, string[]>()
  for (const classRow of localClasses) {
    const classIds = localClassIdsByName.get(classRow.name) ?? []
    classIds.push(classRow.id)
    localClassIdsByName.set(classRow.name, classIds)
  }

  for (const snapshotClass of snapshotClassRows) {
    if (!snapshotClassIdsWithPlayers.has(snapshotClass.id)) {
      continue
    }

    for (const classId of localClassIdsByName.get(snapshotClass.class_name) ?? []) {
      liveStatus.set(classId, 'pools_available')
    }
  }

  return liveStatus
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
      max_players,
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

  return buildPublicSearchClasses(supabase, matchedClasses, daySessionOrderById)
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

async function getCurrentOnDataSnapshotId(
  supabase: ServerClient,
  competitionId: string,
): Promise<string | null> {
  const { data: integrationStatus, error } = await supabase
    .from('ondata_integration_status')
    .select('current_snapshot_id')
    .eq('competition_id', competitionId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return ((integrationStatus ?? null) as OnDataIntegrationStatusRow | null)?.current_snapshot_id ?? null
}

async function buildPublicSearchClasses(
  supabase: ServerClient,
  classRows: ClassRow[],
  daySessionOrderById: Map<string, number>,
): Promise<PublicSearchClass[]> {
  if (classRows.length === 0) {
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
      .in('class_id', classRows.map(classRow => classRow.id))
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

    const playersForClass = playersByClassId.get(registration.class_id) ?? []
    playersForClass.push(player)
    playersByClassId.set(registration.class_id, playersForClass)
  }

  for (const playersForClass of Array.from(playersByClassId.values())) {
    playersForClass.sort((left, right) => left.name.localeCompare(right.name, 'sv'))
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

  return classRows
    .sort((left, right) => comparePublicClassRows(left, right, daySessionOrderById))
    .map(classRow => ({
      ...buildPublicClassDetails(classRow, daySessionOrderById),
      playerCount: (playersByClassId.get(classRow.id) ?? []).length,
      players: playersByClassId.get(classRow.id) ?? [],
      reserveList: reserveListByClassId.get(classRow.id) ?? [],
    }))
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
          max_players,
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

  const classIds = Array.from(
    new Set(((registrations ?? []) as RegistrationRow[]).map(registration => registration.class_id)),
  )
  const reserveRegistrations = classIds.length === 0
    ? []
    : await fetchAllPages<ReservePositionRow>(async (from, to) =>
        await supabase
          .from('registrations')
          .select('id, class_id, status, reserve_joined_at')
          .in('class_id', classIds)
          .eq('status', 'reserve')
          .range(from, to),
      )

  const registrationsByPlayerId = new Map<string, PublicClassRegistration[]>()
  const reservePositions = buildReservePositionMap(
    ((reserveRegistrations ?? []) as ReservePositionRow[])
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
    maxPlayers: classRow.max_players,
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
