"use client";

import { DashboardAuthPanel } from "./dashboard-auth-panel";
import { AnalyticsView } from "./analytics-view";
import { DashboardNavigation } from "./dashboard-navigation";
import { LoadingState } from "./dashboard-state";
import { QrDetailsView } from "./qr-details-view";
import { QrListView } from "./qr-list-view";
import { SettingsView } from "./settings-view";
import type { DashboardShellProps } from "./dashboard-types";
import { useDashboardSession } from "./use-dashboard-session";

export function DashboardShell({
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
        body="Checking for an existing dashboard session."
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
        body="Finalizing your authenticated dashboard session."
        title="Loading dashboard"
      />
    );
  }

  return (
    <main className="dashboard-layout">
      <aside className="card dashboard-sidebar">
        <div className="stack-lg">
          <div>
            <span className="badge">Dashboard</span>
            <h1 className="h2">Real data only</h1>
            <p className="muted">
              Every section below reads the existing API instead of local mock
              fixtures.
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
