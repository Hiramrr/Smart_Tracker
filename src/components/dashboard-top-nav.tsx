"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "jugador", match: (pathname: string) => pathname === "/dashboard" },
  { href: "/dashboard/tournaments", label: "torneos", match: (pathname: string) => pathname.startsWith("/dashboard/tournaments") },
  { href: "/dashboard/shop", label: "tienda", match: (pathname: string) => pathname.startsWith("/dashboard/shop") },
  { href: "/dashboard/compare", label: "comparar", match: (pathname: string) => pathname.startsWith("/dashboard/compare") },
];

export function DashboardTopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-miyu-border/80 bg-miyu-bg/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/dashboard"
          className="text-sm font-bold uppercase tracking-[0.18em] text-miyu-text"
        >
          miyu tracker
        </Link>

        <nav aria-label="Dashboard" className="flex items-center gap-2 rounded-full border border-miyu-border bg-white/70 p-1">
          {NAV_ITEMS.map((item) => {
            const isActive = item.match(pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-miyu-accent text-white"
                    : "text-miyu-text-muted hover:bg-miyu-accent-light hover:text-miyu-text"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
