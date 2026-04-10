import ClassSettingsView from './ClassSettingsView'

export default function ClassSettingsPage({
  params,
}: {
  params: { competitionId: string }
}) {
  return <ClassSettingsView competitionId={params.competitionId} />
}
