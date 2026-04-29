import { getClassAttendanceOpensAt } from './attendance-window'
import { buildDaySessionOrderMap } from './session-order'
import { parseMatchResult } from './match-result'
import { labelRound } from './playoff-progress-view'
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

type AttendanceBannerClassRow = {
  id: string
  start_time: string | null
  attendance_deadline: string | null
}

type AttendanceBannerRegistrationRow = {
  id: string
  class_id: string
  attendance: RelationValue<{ id: string }>
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
  external_class_key: string
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

type OnDataSnapshotMatchRow = {
  snapshot_pool_id: string
  match_order: number
  player_a_name: string | null
  player_a_club: string | null
  player_b_name: string | null
  player_b_club: string | null
  result: string | null
}

type OnDataPoolResultStatusRow = {
  current_snapshot_id: string | null
}

type OnDataPoolResultSnapshotPoolRow = {
  id: string
  pool_number: number
}

type OnDataPoolResultStandingRow = {
  pool_id: string
  placement: number
  player_name: string
  club_name: string | null
}

type SnapshotPoolMatch = ClassLiveMatch & {
  matchOrder: number
}

type PlayoffBracketCode = 'A' | 'B'

type PlayoffStatusRow = {
  parent_external_class_key: string
  playoff_bracket: PlayoffBracketCode
  current_snapshot_id: string | null
  last_summary_matches: number
  last_summary_completed_matches: number
}

type PlayoffSnapshotRow = {
  id: string
  parent_external_class_key: string
  playoff_bracket: PlayoffBracketCode
}

type PlayoffSnapshotRoundRow = {
  id: string
  snapshot_id: string
  round_order: number
  round_name: string
}

type PlayoffSnapshotMatchRow = {
  snapshot_round_id: string
  match_order: number
  player_a_name: string
  player_b_name: string
  winner_name: string | null
  result: string | null
  is_completed: boolean
}

export type PublicSearchMode = 'all' | 'player' | 'club'
export type ClassLiveStatus =
  | 'none'
  | 'pools_available'
  | 'pool_play_started'
  | 'pool_play_complete'
  | 'playoff_complete'
  | 'playoff_in_progress'

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

export type AttendanceStatusBannerState =
  | { kind: 'open' }
  | { kind: 'opens_soon'; opensAt: string }
  | { kind: 'closed_pending' }
  | { kind: 'idle' }

export const ATTENDANCE_OPENS_SOON_WINDOW_MS = 60 * 60 * 1000

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

export interface ClassLivePoolStanding {
  placement: number
  playerName: string
  clubName: string | null
}

export interface ClassLivePool {
  poolNumber: number
  players: Array<{ name: string; club: string | null }>
  matches: ClassLiveMatch[]
  playedMatches: number
  totalMatches: number
  standings: ClassLivePoolStanding[] | null
}

export interface ClassLiveMatch {
  playerA: { name: string; club: string | null }
  playerB: { name: string; club: string | null }
  isPlayed: boolean
  isWalkover: boolean
  setScoreA: number | null
  setScoreB: number | null
}

export interface ClassLivePlayoffMatch {
  playerAName: string
  playerBName: string
  winnerName: string | null
  isPlayed: boolean
  isWalkover: boolean
  setScoreA: number | null
  setScoreB: number | null
  rawResult: string | null
}

export interface ClassLivePlayoffRound {
  name: string
  matches: ClassLivePlayoffMatch[]
}

export interface ClassLivePlayoffBracket {
  bracket: PlayoffBracketCode
  rounds: ClassLivePlayoffRound[]
}

export interface ClassLivePlayoffData {
  a: ClassLivePlayoffBracket | null
  b: ClassLivePlayoffBracket | null
}

export interface ClassLiveData {
  pools: ClassLivePool[]
  playoff: ClassLivePlayoffData | null
}

export function hasPoolMatchFixtures(liveData: ClassLiveData): boolean {
  return liveData.pools.some(pool => pool.totalMatches > 0)
}

export function hasPublishedPoolResults(liveData: ClassLiveData): boolean {
  return liveData.pools.length > 0 && liveData.pools.every(pool => pool.standings !== null)
}

function getPlayoffBrackets(playoff: ClassLivePlayoffData): ClassLivePlayoffBracket[] {
  return [playoff.a, playoff.b].filter(
    (bracket): bracket is ClassLivePlayoffBracket => bracket !== null,
  )
}

function isPlayoffComplete(playoff: ClassLivePlayoffData): boolean {
  const brackets = getPlayoffBrackets(playoff)

  return brackets.length > 0 && brackets.every(bracket => {
    const hasFinalRound = bracket.rounds.some(round => round.name === 'Final')
    return hasFinalRound && bracket.rounds.every(round => round.matches.every(match => match.isPlayed))
  })
}

export function getClassLiveStatus(liveData: ClassLiveData | null): ClassLiveStatus {
  if (!liveData) {
    return 'none'
  }

  if (liveData.playoff) {
    return isPlayoffComplete(liveData.playoff) ? 'playoff_complete' : 'playoff_in_progress'
  }

  if (liveData.pools.length === 0) {
    return 'none'
  }

  if (hasPublishedPoolResults(liveData)) {
    return 'pool_play_complete'
  }

  return hasPoolMatchFixtures(liveData) ? 'pool_play_started' : 'pools_available'
}

export function getClassLiveStatusLabel(status: ClassLiveStatus): string {
  if (status === 'playoff_in_progress') {
    return 'Slutspel pågår'
  }

  if (status === 'playoff_complete') {
    return 'Slutspel klart'
  }

  if (status === 'pool_play_complete') {
    return 'Poolspel klart'
  }

  return status === 'pool_play_started' ? 'Poolspel startat' : 'Pooler lottade'
}

export function getClassLiveStatusPillClass(status: ClassLiveStatus): string {
  if (status === 'pool_play_complete' || status === 'playoff_complete') {
    return 'app-pill-success'
  }

  if (status === 'pool_play_started' || status === 'playoff_in_progress') {
    return 'app-pill-info'
  }

  return 'app-pill-warning'
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

export async function getCompetitionAttendanceBannerState(
  supabase: ServerClient,
  competitionId: string,
  now: Date = new Date(),
): Promise<AttendanceStatusBannerState> {
  const { data: classRows, error: classesError } = await supabase
    .from('classes')
    .select(`
      id,
      start_time,
      attendance_deadline,
      sessions!inner (
        competition_id
      )
    `)
    .eq('sessions.competition_id', competitionId)

  if (classesError) {
    throw new Error(classesError.message)
  }

  const classes = (classRows ?? []) as AttendanceBannerClassRow[]
  if (classes.length === 0) {
    return { kind: 'idle' }
  }

  const liveStatusByClassId = await getClassDashboardLiveStatus(supabase, competitionId)
  const nowMs = now.getTime()

  let hasOpen = false
  let earliestUpcomingMs: number | null = null
  const closedUndrawnClassIds: string[] = []

  for (const classRow of classes) {
    if (!classRow.start_time || !classRow.attendance_deadline) {
      continue
    }

    const opensAtMs = getClassAttendanceOpensAt(classRow.start_time).getTime()
    const deadlineMs = new Date(classRow.attendance_deadline).getTime()
    const liveStatus = liveStatusByClassId.get(classRow.id) ?? 'none'
    const isDrawn = liveStatus !== 'none'

    if (!isDrawn && nowMs >= opensAtMs && nowMs <= deadlineMs) {
      hasOpen = true
      break
    }

    if (nowMs < opensAtMs) {
      const millisUntilOpen = opensAtMs - nowMs
      if (
        millisUntilOpen <= ATTENDANCE_OPENS_SOON_WINDOW_MS
        && (earliestUpcomingMs === null || opensAtMs < earliestUpcomingMs)
      ) {
        earliestUpcomingMs = opensAtMs
      }
      continue
    }

    if (!isDrawn && nowMs > deadlineMs) {
      closedUndrawnClassIds.push(classRow.id)
    }
  }

  if (hasOpen) {
    return { kind: 'open' }
  }

  if (earliestUpcomingMs !== null) {
    return { kind: 'opens_soon', opensAt: new Date(earliestUpcomingMs).toISOString() }
  }

  if (closedUndrawnClassIds.length === 0) {
    return { kind: 'idle' }
  }

  const registrations = await fetchAllPages<AttendanceBannerRegistrationRow>(async (from, to) =>
    await supabase
      .from('registrations')
      .select(`
        id,
        class_id,
        attendance (
          id
        )
      `)
      .in('class_id', closedUndrawnClassIds)
      .eq('status', 'registered')
      .range(from, to),
  )

  const hasMissingAttendance = registrations.some(
    registration => getSingleRelation(registration.attendance) === null,
  )

  return hasMissingAttendance ? { kind: 'closed_pending' } : { kind: 'idle' }
}

export async function searchPublicCompetition(
  supabase: ServerClient,
  competitionId: string,
  query: string,
  mode: PublicSearchMode,
): Promise<{ players: PublicSearchPlayer[]; clubs: PublicSearchClub[] }> {
  const searchTerm = query.trim()

  if (searchTerm.length < 2) {
    return { players: [], clubs: [] }
  }

  const players = mode === 'club'
    ? []
    : await searchPlayersWithRegistrations(supabase, competitionId, searchTerm, 'player')
  const clubs = mode === 'player'
    ? []
    : await searchClubs(supabase, competitionId, searchTerm)

  return { players, clubs }
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

  const livePools = await loadClassLivePools(supabase, competitionId, classRow.name)
  const playoff = await loadClassLivePlayoff(supabase, competitionId, classRow.name)

  if (livePools.length === 0 && playoff === null) {
    return null
  }

  return {
    pools: livePools,
    playoff,
  }
}

async function loadClassLivePools(
  supabase: ServerClient,
  competitionId: string,
  className: string,
): Promise<ClassLivePool[]> {
  const currentSnapshotId = await getCurrentOnDataSnapshotId(supabase, competitionId)
  if (!currentSnapshotId) {
    return []
  }

  const { data: snapshotClass, error: snapshotClassError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .select('id, external_class_key')
    .eq('snapshot_id', currentSnapshotId)
    .eq('class_name', className)
    .maybeSingle()

  if (snapshotClassError) {
    throw new Error(snapshotClassError.message)
  }

  if (!snapshotClass) {
    return []
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
    return []
  }

  const { data: players, error: playersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .select('snapshot_pool_id, player_order, name, club')
    .in('snapshot_pool_id', poolRows.map(pool => pool.id))
    .order('player_order', { ascending: true })

  if (playersError) {
    throw new Error(playersError.message)
  }

  const { data: matches, error: matchesError } = await supabase
    .from('ondata_integration_snapshot_matches')
    .select([
      'snapshot_pool_id',
      'match_order',
      'player_a_name',
      'player_a_club',
      'player_b_name',
      'player_b_club',
      'result',
    ].join(', '))
    .in('snapshot_pool_id', poolRows.map(pool => pool.id))
    .order('match_order', { ascending: true })

  if (matchesError) {
    throw new Error(matchesError.message)
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

  const matchRows = (matches ?? []) as unknown as OnDataSnapshotMatchRow[]

  const matchesByPoolId = new Map<string, SnapshotPoolMatch[]>()
  for (const match of matchRows) {
    if (!match.player_a_name || !match.player_b_name) {
      continue
    }

    const poolMatches = matchesByPoolId.get(match.snapshot_pool_id) ?? []
    const parsedResult = parseMatchResult(match.result)
    if (!parsedResult) {
      if (match.result != null) {
        console.warn('Skipping public pool match with invalid result string', {
          rawResult: match.result,
        })
        continue
      }

      poolMatches.push({
        playerA: {
          name: match.player_a_name,
          club: match.player_a_club,
        },
        playerB: {
          name: match.player_b_name,
          club: match.player_b_club,
        },
        matchOrder: match.match_order,
        isPlayed: false,
        isWalkover: false,
        setScoreA: null,
        setScoreB: null,
      })
      matchesByPoolId.set(match.snapshot_pool_id, poolMatches)
      continue
    }

    if (parsedResult.kind === 'walkover') {
      poolMatches.push({
        playerA: {
          name: match.player_a_name,
          club: match.player_a_club,
        },
        playerB: {
          name: match.player_b_name,
          club: match.player_b_club,
        },
        matchOrder: match.match_order,
        isPlayed: true,
        isWalkover: true,
        setScoreA: null,
        setScoreB: null,
      })
      matchesByPoolId.set(match.snapshot_pool_id, poolMatches)
      continue
    }

    poolMatches.push({
      playerA: {
        name: match.player_a_name,
        club: match.player_a_club,
      },
      playerB: {
        name: match.player_b_name,
        club: match.player_b_club,
      },
      matchOrder: match.match_order,
      isPlayed: true,
      isWalkover: false,
      setScoreA: parsedResult.setScoreA,
      setScoreB: parsedResult.setScoreB,
    })
    matchesByPoolId.set(match.snapshot_pool_id, poolMatches)
  }

  const livePools: ClassLivePool[] = poolRows.map(pool => {
    const poolPlayers = playersByPoolId.get(pool.id) ?? []
    const snapshotPoolMatches = matchesByPoolId.get(pool.id) ?? []
    const completePoolMatches = buildCompletePoolMatches(poolPlayers, snapshotPoolMatches)

    return {
      poolNumber: pool.pool_number,
      players: poolPlayers,
      matches: completePoolMatches,
      playedMatches: completePoolMatches.filter(match => match.isPlayed).length,
      totalMatches: (poolPlayers.length * (poolPlayers.length - 1)) / 2,
      standings: null,
    }
  })

  const poolResultSnapshotId = await getCurrentPoolResultSnapshotId(
    supabase,
    competitionId,
    snapshotClass.external_class_key,
  )

  if (poolResultSnapshotId) {
    const { data: resultPools, error: resultPoolsError } = await supabase
      .from('ondata_pool_result_snapshot_pools')
      .select('id, pool_number')
      .eq('snapshot_id', poolResultSnapshotId)

    if (resultPoolsError) {
      throw new Error(resultPoolsError.message)
    }

    const resultPoolRows = (resultPools ?? []) as OnDataPoolResultSnapshotPoolRow[]
    if (resultPoolRows.length > 0) {
      const poolNumberById = new Map(
        resultPoolRows.map(pool => [pool.id, pool.pool_number]),
      )

      const { data: standings, error: standingsError } = await supabase
        .from('ondata_pool_result_snapshot_standings')
        .select('pool_id, placement, player_name, club_name')
        .in('pool_id', resultPoolRows.map(pool => pool.id))
        .order('placement', { ascending: true })

      if (standingsError) {
        throw new Error(standingsError.message)
      }

      const standingsByPoolNumber = new Map<number, ClassLivePoolStanding[]>()
      for (const standing of (standings ?? []) as OnDataPoolResultStandingRow[]) {
        const poolNumber = poolNumberById.get(standing.pool_id)
        if (!poolNumber) {
          continue
        }

        const poolStandings = standingsByPoolNumber.get(poolNumber) ?? []
        poolStandings.push({
          placement: standing.placement,
          playerName: standing.player_name,
          clubName: standing.club_name,
        })
        standingsByPoolNumber.set(poolNumber, poolStandings)
      }

      for (const pool of livePools) {
        pool.standings = standingsByPoolNumber.get(pool.poolNumber) ?? null
      }
    }
  }

  if (livePools.every(pool => pool.players.length === 0)) {
    return []
  }

  return livePools
}

async function loadClassLivePlayoff(
  supabase: ServerClient,
  competitionId: string,
  className: string,
): Promise<ClassLivePlayoffData | null> {
  const { data: snapshotData, error: snapshotError } = await supabase
    .from('ondata_playoff_snapshots')
    .select('id, parent_external_class_key, playoff_bracket')
    .eq('competition_id', competitionId)
    .eq('parent_class_name', className)

  if (snapshotError) {
    throw new Error(snapshotError.message)
  }

  const snapshotRows = (snapshotData ?? []) as PlayoffSnapshotRow[]
  if (snapshotRows.length === 0) {
    return null
  }

  const parentExternalClassKeys = Array.from(
    new Set(snapshotRows.map(row => row.parent_external_class_key)),
  )

  const { data: statusData, error: statusError } = await supabase
    .from('ondata_playoff_status')
    .select('parent_external_class_key, playoff_bracket, current_snapshot_id')
    .eq('competition_id', competitionId)
    .in('parent_external_class_key', parentExternalClassKeys)

  if (statusError) {
    throw new Error(statusError.message)
  }

  const statusRows = (statusData ?? []) as PlayoffStatusRow[]
  const candidateSnapshotIds = new Set(snapshotRows.map(row => row.id))
  const activeSnapshotByBracket = new Map<PlayoffBracketCode, PlayoffSnapshotRow>()
  const snapshotById = new Map(snapshotRows.map(row => [row.id, row] as const))

  for (const status of statusRows) {
    if (!status.current_snapshot_id) continue
    if (!candidateSnapshotIds.has(status.current_snapshot_id)) continue
    const snapshot = snapshotById.get(status.current_snapshot_id)
    if (!snapshot) continue
    activeSnapshotByBracket.set(status.playoff_bracket, snapshot)
  }

  if (activeSnapshotByBracket.size === 0) {
    return null
  }

  const activeSnapshotIds = Array.from(activeSnapshotByBracket.values()).map(snapshot => snapshot.id)

  const { data: roundData, error: roundError } = await supabase
    .from('ondata_playoff_snapshot_rounds')
    .select('id, snapshot_id, round_order, round_name')
    .in('snapshot_id', activeSnapshotIds)
    .order('round_order', { ascending: true })

  if (roundError) {
    throw new Error(roundError.message)
  }

  const roundRows = (roundData ?? []) as PlayoffSnapshotRoundRow[]
  const roundsBySnapshotId = new Map<string, PlayoffSnapshotRoundRow[]>()
  for (const round of roundRows) {
    const list = roundsBySnapshotId.get(round.snapshot_id) ?? []
    list.push(round)
    roundsBySnapshotId.set(round.snapshot_id, list)
  }

  const matchesByRoundId = new Map<string, PlayoffSnapshotMatchRow[]>()
  if (roundRows.length > 0) {
    const { data: matchData, error: matchError } = await supabase
      .from('ondata_playoff_snapshot_matches')
      .select('snapshot_round_id, match_order, player_a_name, player_b_name, winner_name, result, is_completed')
      .in('snapshot_round_id', roundRows.map(round => round.id))
      .order('match_order', { ascending: true })

    if (matchError) {
      throw new Error(matchError.message)
    }

    for (const match of (matchData ?? []) as PlayoffSnapshotMatchRow[]) {
      const list = matchesByRoundId.get(match.snapshot_round_id) ?? []
      list.push(match)
      matchesByRoundId.set(match.snapshot_round_id, list)
    }
  }

  const buildBracket = (bracketCode: PlayoffBracketCode): ClassLivePlayoffBracket | null => {
    const snapshot = activeSnapshotByBracket.get(bracketCode)
    if (!snapshot) return null

    const snapshotRounds = (roundsBySnapshotId.get(snapshot.id) ?? [])
      .slice()
      .sort((left, right) => left.round_order - right.round_order)

    const totalRounds = snapshotRounds.length
    const rounds: ClassLivePlayoffRound[] = []

    snapshotRounds.forEach((round, roundIndex) => {
      const matchRows = (matchesByRoundId.get(round.id) ?? [])
        .slice()
        .sort((left, right) => left.match_order - right.match_order)

      if (matchRows.length === 0) return

      const matches: ClassLivePlayoffMatch[] = matchRows.map(matchRow =>
        toClassLivePlayoffMatch(matchRow),
      )

      rounds.push({
        name: labelRound(totalRounds, roundIndex, round.round_name),
        matches,
      })
    })

    if (rounds.length === 0) return null

    return {
      bracket: bracketCode,
      rounds,
    }
  }

  const a = buildBracket('A')
  const b = buildBracket('B')

  if (a === null && b === null) {
    return null
  }

  return { a, b }
}

function toClassLivePlayoffMatch(row: PlayoffSnapshotMatchRow): ClassLivePlayoffMatch {
  const playerAName = row.player_a_name.trim()
  const playerBName = row.player_b_name.trim()
  const trimmedWinner = row.winner_name?.trim() ?? null
  const winnerName =
    trimmedWinner && (trimmedWinner === playerAName || trimmedWinner === playerBName)
      ? trimmedWinner
      : null

  if (!row.is_completed) {
    return {
      playerAName,
      playerBName,
      winnerName: null,
      isPlayed: false,
      isWalkover: false,
      setScoreA: null,
      setScoreB: null,
      rawResult: row.result,
    }
  }

  const parsed = parseMatchResult(row.result)
  if (parsed?.kind === 'walkover') {
    return {
      playerAName,
      playerBName,
      winnerName,
      isPlayed: true,
      isWalkover: true,
      setScoreA: null,
      setScoreB: null,
      rawResult: row.result,
    }
  }

  if (parsed?.kind === 'score') {
    const normalizedScore = normalizePlayoffScore(parsed.setScoreA, parsed.setScoreB, {
      playerAName,
      playerBName,
      winnerName,
    })

    return {
      playerAName,
      playerBName,
      winnerName,
      isPlayed: true,
      isWalkover: false,
      setScoreA: normalizedScore.setScoreA,
      setScoreB: normalizedScore.setScoreB,
      rawResult: row.result,
    }
  }

  return {
    playerAName,
    playerBName,
    winnerName,
    isPlayed: true,
    isWalkover: false,
    setScoreA: null,
    setScoreB: null,
    rawResult: row.result,
  }
}

function normalizePlayoffScore(
  setScoreA: number,
  setScoreB: number,
  names: { playerAName: string; playerBName: string; winnerName: string | null },
): { setScoreA: number; setScoreB: number } {
  if (names.winnerName === names.playerAName && setScoreA < setScoreB) {
    return {
      setScoreA: setScoreB,
      setScoreB: setScoreA,
    }
  }

  if (names.winnerName === names.playerBName && setScoreB < setScoreA) {
    return {
      setScoreA: setScoreB,
      setScoreB: setScoreA,
    }
  }

  return { setScoreA, setScoreB }
}

function buildCompletePoolMatches(
  players: Array<{ name: string; club: string | null }>,
  snapshotMatches: SnapshotPoolMatch[],
): ClassLiveMatch[] {
  if (players.length < 2) {
    return []
  }

  const playedMatchByKey = new Map<string, SnapshotPoolMatch>()
  for (const match of snapshotMatches) {
    playedMatchByKey.set(getPoolMatchKey(match.playerA, match.playerB), match)
  }

  const completeMatches: Array<ClassLiveMatch & { sortOrder: number }> = []
  let fallbackSortOrder = players.length * players.length
  for (let playerAIndex = 0; playerAIndex < players.length; playerAIndex += 1) {
    for (let playerBIndex = playerAIndex + 1; playerBIndex < players.length; playerBIndex += 1) {
      const playerA = players[playerAIndex]
      const playerB = players[playerBIndex]
      const directKey = getPoolMatchKey(playerA, playerB)
      const reverseKey = getPoolMatchKey(playerB, playerA)
      const directMatch = playedMatchByKey.get(directKey)

      if (directMatch) {
        completeMatches.push({
          ...directMatch,
          sortOrder: directMatch.matchOrder,
        })
        continue
      }

      const reverseMatch = playedMatchByKey.get(reverseKey)
      if (reverseMatch) {
        completeMatches.push({
          playerA,
          playerB,
          sortOrder: reverseMatch.matchOrder,
          isPlayed: true,
          isWalkover: reverseMatch.isWalkover,
          setScoreA: reverseMatch.setScoreB,
          setScoreB: reverseMatch.setScoreA,
        })
        continue
      }

      completeMatches.push({
        playerA,
        playerB,
        sortOrder: fallbackSortOrder,
        isPlayed: false,
        isWalkover: false,
        setScoreA: null,
        setScoreB: null,
      })
      fallbackSortOrder += 1
    }
  }

  return completeMatches
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ sortOrder: _sortOrder, ...match }) => match)
}

function getPoolMatchKey(
  playerA: { name: string; club: string | null },
  playerB: { name: string; club: string | null },
) {
  return [playerA.name, playerA.club ?? '', playerB.name, playerB.club ?? ''].join('::')
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

  await applyPoolDashboardLiveStatus(supabase, competitionId, localClasses, liveStatus)
  await applyPlayoffDashboardLiveStatus(supabase, competitionId, localClasses, liveStatus)

  return liveStatus
}

async function applyPoolDashboardLiveStatus(
  supabase: ServerClient,
  competitionId: string,
  localClasses: CompetitionClassNameRow[],
  liveStatus: Map<string, ClassLiveStatus>,
): Promise<void> {
  const currentSnapshotId = await getCurrentOnDataSnapshotId(supabase, competitionId)
  if (!currentSnapshotId) {
    return
  }

  const { data: snapshotClasses, error: snapshotClassesError } = await supabase
    .from('ondata_integration_snapshot_classes')
    .select('id, class_name, external_class_key')
    .eq('snapshot_id', currentSnapshotId)

  if (snapshotClassesError) {
    throw new Error(snapshotClassesError.message)
  }

  const snapshotClassRows = (snapshotClasses ?? []) as OnDataSnapshotClassRow[]
  if (snapshotClassRows.length === 0) {
    return
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
    return
  }

  const { data: players, error: playersError } = await supabase
    .from('ondata_integration_snapshot_players')
    .select('snapshot_pool_id')
    .in('snapshot_pool_id', poolRows.map(pool => pool.id))

  if (playersError) {
    throw new Error(playersError.message)
  }

  const playerCountByPoolId = new Map<string, number>()
  for (const player of (players ?? []) as Array<Pick<OnDataSnapshotPlayerRow, 'snapshot_pool_id'>>) {
    playerCountByPoolId.set(
      player.snapshot_pool_id,
      (playerCountByPoolId.get(player.snapshot_pool_id) ?? 0) + 1,
    )
  }

  const snapshotClassIdsWithPlayers = new Set<string>()
  const snapshotClassIdsWithPoolMatches = new Set<string>()
  const poolCountBySnapshotClassId = new Map<string, number>()
  for (const poolEntry of poolRows) {
    const snapshotClassId = poolEntry.snapshot_class_id
    const poolId = poolEntry.id
    poolCountBySnapshotClassId.set(
      snapshotClassId,
      (poolCountBySnapshotClassId.get(snapshotClassId) ?? 0) + 1,
    )
    const playerCount = playerCountByPoolId.get(poolId) ?? 0
    if (playerCount > 0) {
      snapshotClassIdsWithPlayers.add(snapshotClassId)
    }
    if (playerCount > 1) {
      snapshotClassIdsWithPoolMatches.add(snapshotClassId)
    }
  }

  const localClassIdsByName = new Map<string, string[]>()
  for (const classRow of localClasses) {
    const classIds = localClassIdsByName.get(classRow.name) ?? []
    classIds.push(classRow.id)
    localClassIdsByName.set(classRow.name, classIds)
  }

  const snapshotIdByExternalClassKey = new Map<string, string>()
  const currentPoolResultSnapshotIds: string[] = []
  const { data: poolResultStatuses, error: poolResultStatusesError } = await supabase
    .from('ondata_pool_result_status')
    .select('external_class_key, current_snapshot_id')
    .eq('competition_id', competitionId)
    .in('external_class_key', snapshotClassRows.map(snapshotClass => snapshotClass.external_class_key))

  if (poolResultStatusesError) {
    throw new Error(poolResultStatusesError.message)
  }

  for (const status of (poolResultStatuses ?? []) as Array<{
    external_class_key: string
    current_snapshot_id: string | null
  }>) {
    if (!status.current_snapshot_id) {
      continue
    }

    snapshotIdByExternalClassKey.set(status.external_class_key, status.current_snapshot_id)
    currentPoolResultSnapshotIds.push(status.current_snapshot_id)
  }

  const resultPoolCountBySnapshotId = new Map<string, number>()
  if (currentPoolResultSnapshotIds.length > 0) {
    const { data: resultPools, error: resultPoolsError } = await supabase
      .from('ondata_pool_result_snapshot_pools')
      .select('snapshot_id')
      .in('snapshot_id', currentPoolResultSnapshotIds)

    if (resultPoolsError) {
      throw new Error(resultPoolsError.message)
    }

    for (const pool of (resultPools ?? []) as Array<{ snapshot_id: string }>) {
      resultPoolCountBySnapshotId.set(
        pool.snapshot_id,
        (resultPoolCountBySnapshotId.get(pool.snapshot_id) ?? 0) + 1,
      )
    }
  }

  for (const snapshotClass of snapshotClassRows) {
    if (!snapshotClassIdsWithPlayers.has(snapshotClass.id)) {
      continue
    }

    const poolResultSnapshotId = snapshotIdByExternalClassKey.get(snapshotClass.external_class_key)
    const hasPublishedResultsForEveryPool =
      Boolean(poolResultSnapshotId) &&
      (resultPoolCountBySnapshotId.get(poolResultSnapshotId!) ?? 0) >=
        (poolCountBySnapshotClassId.get(snapshotClass.id) ?? 0)

    for (const classId of localClassIdsByName.get(snapshotClass.class_name) ?? []) {
      liveStatus.set(
        classId,
        hasPublishedResultsForEveryPool
          ? 'pool_play_complete'
          : snapshotClassIdsWithPoolMatches.has(snapshotClass.id)
            ? 'pool_play_started'
            : 'pools_available',
      )
    }
  }
}

async function applyPlayoffDashboardLiveStatus(
  supabase: ServerClient,
  competitionId: string,
  localClasses: CompetitionClassNameRow[],
  liveStatus: Map<string, ClassLiveStatus>,
): Promise<void> {
  const { data: statusRows, error: statusError } = await supabase
    .from('ondata_playoff_status')
    .select(
      'parent_external_class_key, playoff_bracket, current_snapshot_id, last_summary_matches, last_summary_completed_matches',
    )
    .eq('competition_id', competitionId)

  if (statusError) {
    throw new Error(statusError.message)
  }

  const activeSnapshotIds = ((statusRows ?? []) as PlayoffStatusRow[])
    .map(row => row.current_snapshot_id)
    .filter((id): id is string => Boolean(id))

  if (activeSnapshotIds.length === 0) {
    return
  }

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from('ondata_playoff_snapshots')
    .select('id, parent_class_name')
    .in('id', activeSnapshotIds)

  if (snapshotError) {
    throw new Error(snapshotError.message)
  }

  const typedSnapshotRows = (snapshotRows ?? []) as Array<{ id: string; parent_class_name: string }>
  const parentClassNameBySnapshotId = new Map(
    typedSnapshotRows.map(row => [row.id, row.parent_class_name] as const),
  )

  const { data: roundRows, error: roundError } = await supabase
    .from('ondata_playoff_snapshot_rounds')
    .select('snapshot_id, round_order, round_name')
    .in('snapshot_id', activeSnapshotIds)

  if (roundError) {
    throw new Error(roundError.message)
  }

  const roundsBySnapshotId = new Map<string, Array<Pick<PlayoffSnapshotRoundRow, 'snapshot_id' | 'round_order' | 'round_name'>>>()
  for (const round of (roundRows ?? []) as Array<Pick<PlayoffSnapshotRoundRow, 'snapshot_id' | 'round_order' | 'round_name'>>) {
    const rounds = roundsBySnapshotId.get(round.snapshot_id) ?? []
    rounds.push(round)
    roundsBySnapshotId.set(round.snapshot_id, rounds)
  }

  const classStatusByName = new Map<string, ClassLiveStatus>()
  for (const status of (statusRows ?? []) as PlayoffStatusRow[]) {
    if (!status.current_snapshot_id) {
      continue
    }

    const parentClassName = parentClassNameBySnapshotId.get(status.current_snapshot_id)
    if (!parentClassName) {
      continue
    }

    const snapshotRounds = (roundsBySnapshotId.get(status.current_snapshot_id) ?? [])
      .slice()
      .sort((left, right) => left.round_order - right.round_order)
    const hasFinalRound = snapshotRounds.some((round, roundIndex) =>
      labelRound(snapshotRounds.length, roundIndex, round.round_name) === 'Final',
    )
    const isComplete =
      hasFinalRound
      && status.last_summary_matches > 0
      && status.last_summary_matches === status.last_summary_completed_matches

    const nextStatus: ClassLiveStatus = isComplete ? 'playoff_complete' : 'playoff_in_progress'
    const currentStatus = classStatusByName.get(parentClassName)

    if (currentStatus !== 'playoff_in_progress') {
      classStatusByName.set(parentClassName, nextStatus)
    }
  }

  for (const classRow of localClasses) {
    const status = classStatusByName.get(classRow.name)
    if (status) {
      liveStatus.set(classRow.id, status)
    }
  }
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

async function getCurrentPoolResultSnapshotId(
  supabase: ServerClient,
  competitionId: string,
  externalClassKey: string,
): Promise<string | null> {
  const { data: poolResultStatus, error } = await supabase
    .from('ondata_pool_result_status')
    .select('current_snapshot_id')
    .eq('competition_id', competitionId)
    .eq('external_class_key', externalClassKey)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return ((poolResultStatus ?? null) as OnDataPoolResultStatusRow | null)?.current_snapshot_id ?? null
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
