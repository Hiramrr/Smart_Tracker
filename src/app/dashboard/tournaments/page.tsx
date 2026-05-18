import { TournamentsList } from "@/components/tournaments-list";

export default function TournamentsPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-[1400px] flex-col px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-miyu-text tracking-tight">Fortnite Tournaments</h1>
        <p className="mt-1 text-sm text-miyu-text-muted">
          Explore competitive events, track upcoming sessions, and view past results.
        </p>
      </div>

      <TournamentsList />
    </section>
  );
}
