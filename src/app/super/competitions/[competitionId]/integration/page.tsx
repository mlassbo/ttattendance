import CompetitionIntegrationView from './CompetitionIntegrationView'

export default function CompetitionIntegrationPage({
  params,
}: {
  params: { competitionId: string }
}) {
  return <CompetitionIntegrationView competitionId={params.competitionId} />
}

