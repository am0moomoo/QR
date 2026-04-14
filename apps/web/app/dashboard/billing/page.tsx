import { DashboardShell } from "../../../components/dashboard/dashboard-shell";

export default async function DashboardBillingPage({
  searchParams
}: {
  searchParams: Promise<{ checkout_canceled?: string; checkout_session_id?: string }>;
}) {
  const search = await searchParams;

  return (
    <DashboardShell
      checkoutCanceled={search.checkout_canceled === "1"}
      checkoutSessionId={search.checkout_session_id ?? null}
      section="billing"
    />
  );
}
