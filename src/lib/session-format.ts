const SWEDISH_TIME_ZONE = 'Europe/Stockholm'

export function formatPlayerSessionLabel(sessionDate: string, passNumber: number) {
  const weekday = new Date(sessionDate).toLocaleDateString('sv-SE', {
    timeZone: SWEDISH_TIME_ZONE,
    weekday: 'short',
  })

  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - Pass ${passNumber}`
}