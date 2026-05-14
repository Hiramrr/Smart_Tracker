import { TournamentsList } from "@/components/tournaments-list";

export default function TournamentsPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-miyu-text-muted">
            competitivo
          </p>
          <h1 className="text-3xl font-bold text-miyu-text">torneos</h1>
          <p className="max-w-2xl text-sm text-miyu-text-muted">
            Explora eventos actuales, siguientes ventanas y resultados pasados desde un solo lugar.
          </p>
        </div>
      </div>

      <TournamentsList />
    </section>
  );
}
