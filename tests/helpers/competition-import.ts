export type ImportFixtureRegistration = {
  playerName: string
  clubName: string
}

export type ImportFixtureClass = {
  className: string
  classDate: string
  classTime: string
  registrations: ImportFixtureRegistration[]
  declaredCount?: number
  pageBreakAfterRegistrationIndexes?: number[]
}

type BuildCompetitionImportTextOptions = {
  competitionName?: string
  classes: ImportFixtureClass[]
}

function headerNoise(competitionName: string): string[] {
  return [
    'Deltagarlista',
    'Alla klasser',
    competitionName,
    'Tävlingen genomförs med hjälp av programmet TT Coordinator - http://ttcoordinator.com',
    'Denna programlicens får endast användas vid tävlingar arrangerade av Svenska Bordtennisförbundet',
  ]
}

export function buildCompetitionImportText({
  competitionName = 'Test Cup 2025',
  classes,
}: BuildCompetitionImportTextOptions): string {
  const lines = [...headerNoise(competitionName)]

  for (const classRow of classes) {
    lines.push(classRow.className)
    lines.push(
      `${classRow.classDate} ${classRow.classTime}    (${classRow.declaredCount ?? classRow.registrations.length} anmälda)`,
    )

    for (let index = 0; index < classRow.registrations.length; index += 1) {
      const registration = classRow.registrations[index]
      lines.push(`${registration.playerName}, ${registration.clubName}`)

      if (classRow.pageBreakAfterRegistrationIndexes?.includes(index)) {
        lines.push(...headerNoise(competitionName))
      }
    }
  }

  return lines.join('\n')
}