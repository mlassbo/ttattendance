import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyRosterImport,
  buildRosterImportPreview,
  CompetitionImportNotFoundError,
  type CompetitionImportApplyResult,
  type CompetitionImportClassSessionAssignment,
  type CompetitionImportClassSessionPrompt,
  type CompetitionImportDiffRow,
  type CompetitionImportPreview,
  type CompetitionImportSessionOption,
  type RosterImportClass,
  type RosterImportDataset,
  type RosterImportRegistration,
} from '@/lib/roster-import/planner'
import { parseCompetitionImportSource } from '@/lib/roster-import/ttcoordinator-source'

export type {
  CompetitionImportApplyResult,
  CompetitionImportClassSessionAssignment,
  CompetitionImportClassSessionPrompt,
  CompetitionImportDiffRow,
  CompetitionImportPreview,
  CompetitionImportSessionOption,
  RosterImportClass,
  RosterImportDataset,
  RosterImportRegistration,
} from '@/lib/roster-import/planner'

export { CompetitionImportNotFoundError, parseCompetitionImportSource }

export async function buildCompetitionImportPreview(
  supabase: SupabaseClient,
  competitionId: string,
  sourceText: string,
): Promise<CompetitionImportPreview> {
  return buildRosterImportPreview(supabase, competitionId, parseCompetitionImportSource(sourceText))
}

export async function applyCompetitionImport(
  supabase: SupabaseClient,
  competitionId: string,
  sourceText: string,
  confirmRemovalWithAttendance: boolean,
  classSessionAssignments: CompetitionImportClassSessionAssignment[],
): Promise<{ preview?: CompetitionImportPreview; result?: CompetitionImportApplyResult }> {
  return applyRosterImport(
    supabase,
    competitionId,
    parseCompetitionImportSource(sourceText),
    confirmRemovalWithAttendance,
    classSessionAssignments,
  )
}