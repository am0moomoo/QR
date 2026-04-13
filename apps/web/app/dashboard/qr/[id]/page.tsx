import { DashboardShell } from "../../../../components/dashboard/dashboard-shell";

export default async function DashboardQrDetailsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DashboardShell qrId={id} section="details" />;
}
