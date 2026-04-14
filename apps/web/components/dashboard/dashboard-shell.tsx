"use client";

import { DashboardAuthPanel } from "./dashboard-auth-panel";
import { AnalyticsView } from "./analytics-view";
import { BillingView } from "./billing-view";
import { DashboardNavigation } from "./dashboard-navigation";
import { LoadingState } from "./dashboard-state";
import { QrDetailsView } from "./qr-details-view";
import { QrListView } from "./qr-list-view";
import { SettingsView } from "./settings-view";
import type { DashboardShellProps } from "./dashboard-types";
import { useDashboardSession } from "./use-dashboard-session";

export function DashboardShell({
  checkoutCanceled,
  checkoutSessionId,
  initialAnalyticsQrId,
  qrId,
  section
}: DashboardShellProps) {
  const {
    handleAuthenticated,
    handleLogout,
    handleUserUpdated,
    isLoggingOut,
    sessionState
  } = useDashboardSession();

  if (sessionState.status === "booting") {
    return (
      <LoadingState
        body="Restoring your saved session."
        title="Loading dashboard"
      />
    );
  }

  if (sessionState.status === "unauthenticated") {
    return (
      <DashboardAuthPanel
        errorMessage={sessionState.errorMessage}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const authenticatedSession =
    sessionState.status === "ready" ? sessionState : null;

  if (!authenticatedSession) {
    return (
      <LoadingState
        body="Preparing your workspace."
        title="Loading dashboard"
      />
    );
  }

  return (
    <main className="dashboard-layout">
      <aside className="card dashboard-sidebar">
        <div className="stack-lg">
          <div>
            <span className="badge">QRFlow</span>
            <h1 className="h2">Run your QR program</h1>
            <p className="muted">
              Create codes, review scans, manage billing, and keep your account settings in one place.
            </p>
          </div>

          <DashboardNavigation section={section} />

          <div className="card compact-card">
            <div className="muted">Signed in as</div>
            <div className="h2 dashboard-user-name">
              {authenticatedSession.user.fullName ?? authenticatedSession.user.email}
            </div>
            <div className="muted break-word">{authenticatedSession.user.email}</div>
            <button
              className="button secondary compact"
              data-testid="dashboard-logout"
              disabled={isLoggingOut}
              onClick={handleLogout}
              type="button"
            >
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <section className="dashboard-content">
        {section === "list" ? <QrListView token={authenticatedSession.token} /> : null}
        {section === "details" ? (
          <QrDetailsView qrId={qrId} token={authenticatedSession.token} />
        ) : null}
        {section === "analytics" ? (
          <AnalyticsView
            initialQrId={initialAnalyticsQrId}
            token={authenticatedSession.token}
          />
        ) : null}
        {section === "billing" ? (
          <BillingView
            checkoutCanceled={checkoutCanceled}
            checkoutSessionId={checkoutSessionId}
            token={authenticatedSession.token}
            user={authenticatedSession.user}
          />
        ) : null}
        {section === "settings" ? (
          <SettingsView
            onUserUpdated={handleUserUpdated}
            token={authenticatedSession.token}
            user={authenticatedSession.user}
          />
        ) : null}
      </section>
    </main>
  );
}
