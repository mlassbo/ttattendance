export const PUBLIC_ATTENDANCE_UNLOCK_KEY_PREFIX = 'public-player-unlocked:'

export function getAttendanceStatusCopy(
  status: 'confirmed' | 'absent',
  audience: 'player' | 'club',
) {
  if (status === 'confirmed') {
    return {
      badgeLabel: 'Närvaro bekräftad',
      title: 'Närvaro bekräftad',
      description:
        audience === 'player'
          ? 'Du är markerad som närvarande i den här klassen.'
          : 'Spelaren är markerad som närvarande i klassen.',
      containerClassName: 'border-green-200 bg-green-50 text-green-900',
      descriptionClassName: 'text-green-800',
    }
  }

  return {
    badgeLabel: 'Frånvaro',
    title: 'Frånvaro anmäld',
    description:
      audience === 'player'
        ? 'Du är markerad som frånvarande i den här klassen.'
        : 'Spelaren är markerad som frånvarande i klassen.',
    containerClassName: 'border-red-200 bg-red-50 text-red-900',
    descriptionClassName: 'text-red-700',
  }
}

export function getDeadlinePassedWithoutAttendanceCopy() {
  return {
    title: 'Tiden för anmälan har gått ut',
    description: 'Kontakta sekretariatet.',
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    descriptionClassName: 'text-amber-900',
  }
}

export function getCompetitionScheduleMissingCopy() {
  return {
    title: 'Tävlingsschemat är inte importerat än',
    description: 'Närvaro kan inte rapporteras förrän schemat finns på plats.',
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-950',
    descriptionClassName: 'text-amber-900',
  }
}