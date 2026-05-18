import OsirionDashboard from "@/components/osirion-dashboard";

export default async function PlayerStatsPage({
  searchParams,
}: {
  searchParams?: Promise<{ player?: string; displayName?: string }>;
}) {
  const params = await searchParams;

  return (
    <OsirionDashboard
      initialPlayer={params?.player}
      initialDisplayName={params?.displayName}
    />
  );
}
