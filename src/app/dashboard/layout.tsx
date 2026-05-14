import { DashboardTopNav } from "@/components/dashboard-top-nav";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-miyu-bg">
      <DashboardTopNav />
      <main>{children}</main>
    </div>
  );
}
