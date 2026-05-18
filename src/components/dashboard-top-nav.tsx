"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GitCompareArrows, ShoppingBag, Trophy, Users } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard/player", label: "Personas", icon: Users, match: (pathname: string) => pathname.startsWith("/dashboard/player") },
  { href: "/dashboard/compare", label: "Comparacion", icon: GitCompareArrows, match: (pathname: string) => pathname.startsWith("/dashboard/compare") },
  { href: "/dashboard/tournaments", label: "Torneos", icon: Trophy, match: (pathname: string) => pathname.startsWith("/dashboard/tournaments") },
  { href: "/dashboard/shop", label: "Tienda", icon: ShoppingBag, match: (pathname: string) => pathname.startsWith("/dashboard/shop") },
];

export function DashboardTopNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-miyu-border bg-miyu-bg/95 px-5 py-6 lg:flex lg:flex-col">
      <Link href="/dashboard" className="mb-10 flex items-center gap-3 text-miyu-text">
        <span className="flex h-9 w-9 items-center justify-center">
          <BarChart3 className="h-8 w-8 stroke-[2.2]" />
        </span>
        <span>
          <span className="block text-xl font-bold tracking-[0.08em]">FN.STATS</span>
          <span className="block text-xs text-miyu-text-muted">Fortnite Tracker</span>
        </span>
      </Link>

      <nav aria-label="Dashboard" className="space-y-8">
        <div>
          <p className="mb-3 px-2 text-xs font-bold uppercase tracking-[0.12em] text-miyu-text">
            Principal
          </p>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.match(pathname);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-miyu-secondary font-semibold text-miyu-text"
                      : "text-miyu-text hover:bg-miyu-secondary/70"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </aside>
  );
}
