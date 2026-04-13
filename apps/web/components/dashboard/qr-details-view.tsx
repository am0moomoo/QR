"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type DashboardAnalyticsResponse,
  type DashboardDownload,
  type DashboardQrCode,
  downloadDashboardQrAsset,
  getDashboardQrAnalytics,
  getDashboardQrCode,
  postDashboardQrAction
} from "../../lib/dashboard-api";
import { ErrorState, LoadingState } from "./dashboard-state";
import type { RemoteState } from "./dashboard-types";
import {
  createInitialRemoteState,
  formatBytes,
  formatDateTime,
  formatNumber,
  getDefaultRange,
  getQrDisplayName,
  getStatusLabel,
  toErrorMessage
} from "./dashboard-utils";

export function QrDetailsView({
  qrId,
  token
}: {
  qrId?: string;
  token: string;
}) {
  const [detailsState, setDetailsState] =
    useState<RemoteState<{ analytics: DashboardAnalyticsResponse; qrCode: DashboardQrCode }>>(createInitialRemoteState);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!qrId) {
      setDetailsState({
        data: null,
        errorMessage: "QR id is missing from the route.",
        status: "error"
      });
      return;
    }

    let isActive = true;
    const range = getDefaultRange(30);

    setDetailsState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      status: "loading"
    }));

    Promise.all([getDashboardQrCode(token, qrId), getDashboardQrAnalytics(token, qrId, range)])
      .then(([qrCode, analytics]) => {
        if (!isActive) {
          return;
        }

        setDetailsState({
          data: { analytics, qrCode },
          errorMessage: null,
          status: "ready"
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setDetailsState({
          data: null,
          errorMessage: toErrorMessage(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [qrId, reloadNonce, token]);

  async function runAction(action: "activate" | "archive" | "deactivate" | "render") {
    if (!qrId) {
      return;
    }

    setBusyAction(action);
    setActionError(null);

    try {
      await postDashboardQrAction(token, qrId, action);
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDownload(download: DashboardDownload) {
    if (!qrId) {
      return;
    }

    setBusyAction(download.format);
    setActionError(null);

    try {
      const file = await downloadDashboardQrAsset(token, qrId, download.format);
      const objectUrl = window.URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  if (detailsState.status === "loading" && !detailsState.data) {
    return (
      <LoadingState
        body="The details page is loading the live QR record and its analytics summary."
        title="Loading QR details"
      />
    );
  }

  if (detailsState.status === "error" || !detailsState.data) {
    return (
      <ErrorState
        body={detailsState.errorMessage ?? "QR details are unavailable."}
        onRetry={() => setReloadNonce((value) => value + 1)}
        title="Could not load this QR code"
      />
    );
  }

  const { analytics, qrCode } = detailsState.data;
  const summaryCards = [
    { label: "Status", value: getStatusLabel(qrCode.status) },
    { label: "Scans", value: formatNumber(qrCode.scansCount) },
    { label: "Unique IPs (30d)", value: formatNumber(analytics.summary.uniqueIps) },
    { label: "Last scan", value: formatDateTime(qrCode.lastScanAt) }
  ];

  return (
    <main className="stack-xl" data-testid="qr-details-view">
      <section className="card">
        <div className="toolbar">
          <div>
            <span className="badge">Live QR record</span>
            <h1 className="h2">{getQrDisplayName(qrCode)}</h1>
            <p className="muted">
              Detail data comes from <code>/qr-codes/{qrCode.id}</code> and summary data
              comes from <code>/qr-codes/{qrCode.id}/analytics</code>.
            </p>
          </div>
          <div className="table-actions">
            <button
              className="button secondary compact"
              disabled={busyAction === "render"}
              onClick={() => runAction("render")}
              type="button"
            >
              {busyAction === "render" ? "Refreshing..." : "Refresh assets"}
            </button>
            {qrCode.status === "ACTIVE" ? (
              <button
                className="button secondary compact"
                disabled={busyAction === "deactivate"}
                onClick={() => runAction("deactivate")}
                type="button"
              >
                {busyAction === "deactivate" ? "Saving..." : "Deactivate"}
              </button>
            ) : null}
            {qrCode.status === "INACTIVE" ? (
              <button
                className="button secondary compact"
                disabled={busyAction === "activate"}
                onClick={() => runAction("activate")}
                type="button"
              >
                {busyAction === "activate" ? "Saving..." : "Activate"}
              </button>
            ) : null}
            {qrCode.status !== "ARCHIVED" ? (
              <button
                className="button secondary compact"
                disabled={busyAction === "archive"}
                onClick={() => runAction("archive")}
                type="button"
              >
                {busyAction === "archive" ? "Saving..." : "Archive"}
              </button>
            ) : null}
          </div>
        </div>

        {actionError ? <div className="callout danger">{actionError}</div> : null}

        <div className="stats-grid" data-testid="qr-details-summary">
          {summaryCards.map((card) => (
            <div className="card compact-card" key={card.label}>
              <div className="muted">{card.label}</div>
              <div className="h2">{card.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-split">
        <div className="card stack-lg">
          <div>
            <h2 className="h2">Routing</h2>
            <div className="stack-sm">
              <div>
                <div className="muted">Slug</div>
                <div className="mono">{qrCode.slug}</div>
              </div>
              <div>
                <div className="muted">Short URL</div>
                <a
                  className="mono dashboard-link"
                  href={qrCode.shortUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {qrCode.shortUrl}
                </a>
              </div>
              <div>
                <div className="muted">Type</div>
                <div>{qrCode.type}</div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="h2">Settings</h2>
            <div className="key-value-grid">
              <div className="muted">Ads enabled</div>
              <div>{qrCode.adsEnabled ? "Yes" : "No"}</div>
              <div className="muted">Do not index</div>
              <div>{qrCode.doNotIndex ? "Yes" : "No"}</div>
              <div className="muted">One-time</div>
              <div>{qrCode.isOneTime ? "Yes" : "No"}</div>
              <div className="muted">Max scans</div>
              <div>{qrCode.maxScans ?? "Unlimited"}</div>
              <div className="muted">Expires at</div>
              <div>{formatDateTime(qrCode.expiresAt)}</div>
              <div className="muted">Updated</div>
              <div>{formatDateTime(qrCode.updatedAt)}</div>
            </div>
          </div>
        </div>

        <div className="card stack-lg">
          <div>
            <h2 className="h2">Assets & downloads</h2>
            <div className="stack-sm">
              {qrCode.downloads.map((download) => (
                <div className="asset-row" key={download.format}>
                  <div>
                    <strong>{download.format.toUpperCase()}</strong>
                    <div className="muted">
                      {formatBytes(download.bytes)}
                      {download.checksum ? ` | ${download.checksum.slice(0, 10)}...` : ""}
                    </div>
                  </div>
                  <button
                    className="button secondary compact"
                    data-testid={`qr-download-${download.format}`}
                    disabled={busyAction === download.format}
                    onClick={() => handleDownload(download)}
                    type="button"
                  >
                    {busyAction === download.format ? "Downloading..." : "Download"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="h2">Scan summary</h2>
            <div className="key-value-grid">
              <div className="muted">30d scans</div>
              <div>{formatNumber(analytics.summary.scans)}</div>
              <div className="muted">30d unique devices</div>
              <div>{formatNumber(analytics.summary.uniqueDevices)}</div>
              <div className="muted">Recent events</div>
              <div>{formatNumber(analytics.recentEvents.length)}</div>
            </div>
            <Link
              className="button secondary compact"
              data-testid="open-analytics-page"
              href={`/dashboard/analytics?qr=${qrCode.id}` as Route}
            >
              Open analytics page
            </Link>
          </div>
        </div>
      </section>

      <section className="dashboard-split">
        <div className="card">
          <h2 className="h2">Content payload</h2>
          <pre className="code-block">{JSON.stringify(qrCode.content, null, 2)}</pre>
        </div>

        <div className="card">
          <h2 className="h2">Design payload</h2>
          <pre className="code-block">{JSON.stringify(qrCode.design, null, 2)}</pre>
        </div>
      </section>
    </main>
  );
}
