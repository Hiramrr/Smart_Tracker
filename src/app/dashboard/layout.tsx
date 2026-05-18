import { DashboardTopNav } from "@/components/dashboard-top-nav";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-miyu-bg text-miyu-text">
      <DashboardTopNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
