import { DashboardShell } from "../../../components/dashboard/dashboard-shell";

export default async function DashboardAnalyticsPage({
  searchParams
}: {
  searchParams: Promise<{ qr?: string }>;
}) {
  const { qr } = await searchParams;

  return <DashboardShell initialAnalyticsQrId={qr ?? null} section="analytics" />;
}
