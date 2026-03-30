/**
 * Normalises a PostgREST attendance relation that may be returned as an
 * object (has-one, when a unique constraint on registration_id exists) or
 * an array (has-many).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAttendanceField(reg: any, field: string): string | null {
  const a = reg.attendance
  if (!a) return null
  if (Array.isArray(a)) return a[0]?.[field] ?? null
  return a[field] ?? null
}
