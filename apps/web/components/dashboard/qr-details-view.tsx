"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type DashboardAnalyticsResponse,
  type DashboardDownload,
  type DashboardQrCode,
  deleteDashboardQrCode,
  downloadDashboardQrAsset,
  duplicateDashboardQrCode,
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
  formatBooleanLabel,
  formatNumber,
  getErrorRequestId,
  getErrorSupportText,
  getDefaultRange,
  getQrDisplayName,
  getQrLinkTarget,
  getStatusLabel,
  getStatusTone,
  isUpgradeRequiredError,
  startFileDownload,
  toErrorMessage
} from "./dashboard-utils";

export function QrDetailsView({
  qrId,
  token
}: {
  qrId?: string;
  token: string;
}) {
  const router = useRouter();
  const [detailsState, setDetailsState] =
    useState<RemoteState<{ analytics: DashboardAnalyticsResponse; qrCode: DashboardQrCode }>>(createInitialRemoteState);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    message: string;
    supportText: string | null;
    upgradeRequired: boolean;
  } | null>(null);
  const [duplicatedQrId, setDuplicatedQrId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!qrId) {
      setDetailsState({
        data: null,
        errorMessage: "QR id is missing from the route.",
        errorRequestId: null,
        status: "error"
      });
      return;
    }

    let isActive = true;
    const range = getDefaultRange(30);

    setDetailsState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      errorRequestId: null,
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
          errorRequestId: null,
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
          errorRequestId: getErrorRequestId(error),
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
    setDuplicatedQrId(null);
    setActionMessage(null);

    try {
      await postDashboardQrAction(token, qrId, action);
      setActionMessage(
        action === "render"
          ? "Downloads are being refreshed for this QR code."
          : action === "archive"
            ? "This QR code is now archived."
            : action === "deactivate"
              ? "This QR code is inactive."
              : "This QR code is active again."
      );
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDuplicate() {
    if (!qrId) {
      return;
    }

    setBusyAction("duplicate");
    setActionError(null);
    setDuplicatedQrId(null);
    setActionMessage(null);

    try {
      const duplicatedQr = await duplicateDashboardQrCode(token, qrId);
      setDuplicatedQrId(duplicatedQr.id);
      setActionMessage("A copy of this QR code was added to your dashboard.");
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete() {
    if (!qrId) {
      return;
    }

    if (
      !window.confirm(
        "Delete this QR code? Its downloads and dashboard record will be removed."
      )
    ) {
      return;
    }

    setBusyAction("delete");
    setActionError(null);
    setDuplicatedQrId(null);
    setActionMessage(null);

    try {
      await deleteDashboardQrCode(token, qrId);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
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
    setDuplicatedQrId(null);

    try {
      const file = await downloadDashboardQrAsset(token, qrId, download.format);
      startFileDownload(file);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (detailsState.status === "loading" && !detailsState.data) {
    return (
      <LoadingState
        body="Loading the QR record, downloads, and scan summary."
        title="Loading QR details"
      />
    );
  }

  if (detailsState.status === "error" || !detailsState.data) {
    return (
      <ErrorState
        body={detailsState.errorMessage ?? "QR details are unavailable."}
        onRetry={() => setReloadNonce((value) => value + 1)}
        supportText={
          detailsState.errorRequestId
            ? `Support reference: ${detailsState.errorRequestId}`
            : null
        }
        actions={
          <Link className="button secondary" href={"/dashboard" as Route}>
            Back to QR list
          </Link>
        }
        title="Could not load this QR code"
      />
    );
  }

  const { analytics, qrCode } = detailsState.data;
  const linkTarget = getQrLinkTarget(qrCode);
  const design = qrCode.design ?? {};
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
            <span className="badge">QR details</span>
            <h1 className="h2">{getQrDisplayName(qrCode)}</h1>
            <p className="muted">
              Review routing, downloads, and the latest scan summary for this QR code.
            </p>
          </div>
          <div className="table-actions">
            <button
              className="button secondary compact"
              data-testid="qr-details-refresh-assets"
              disabled={busyAction === "render"}
              onClick={() => runAction("render")}
              type="button"
            >
              {busyAction === "render" ? "Refreshing..." : "Refresh assets"}
            </button>
            <button
              className="button secondary compact"
              data-testid="qr-details-duplicate"
              disabled={busyAction === "duplicate"}
              onClick={handleDuplicate}
              type="button"
            >
              {busyAction === "duplicate" ? "Duplicating..." : "Duplicate"}
            </button>
            {qrCode.status === "ACTIVE" ? (
              <button
                className="button secondary compact"
                data-testid="qr-details-deactivate"
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
                data-testid="qr-details-activate"
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
                data-testid="qr-details-archive"
                disabled={busyAction === "archive"}
                onClick={() => runAction("archive")}
                type="button"
              >
                {busyAction === "archive" ? "Saving..." : "Archive"}
              </button>
            ) : null}
            <button
              className="button secondary compact"
              data-testid="qr-details-delete"
              disabled={busyAction === "delete"}
              onClick={handleDelete}
              type="button"
            >
              {busyAction === "delete" ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {actionMessage ? <div className="callout success">{actionMessage}</div> : null}
        {duplicatedQrId ? (
          <div className="table-actions">
            <Link
              className="button secondary compact"
              data-testid="qr-details-open-duplicate"
              href={`/dashboard/qr/${duplicatedQrId}` as Route}
            >
              Open copied QR
            </Link>
            <Link className="button secondary compact" href={"/dashboard" as Route}>
              Back to QR list
            </Link>
          </div>
        ) : null}
        {actionError ? (
          <div className="callout danger">
            <div>{actionError.message}</div>
            {actionError.supportText ? <div className="muted">{actionError.supportText}</div> : null}
            {actionError.upgradeRequired ? (
              <div className="table-actions" style={{ marginTop: 10 }}>
                <Link className="button secondary compact" href={"/dashboard/billing" as Route}>
                  Review plans
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {qrCode.status !== "ACTIVE" ? (
          <div className="callout">
            {qrCode.status === "INACTIVE"
              ? "This QR code is inactive, so new scans will not redirect until you reactivate it."
              : qrCode.status === "ARCHIVED"
                ? "This QR code is archived. Downloads stay visible here, but scans should stay disabled."
                : "This QR code is not currently available for new scans."}
          </div>
        ) : null}

        <div className="stats-grid" data-testid="qr-details-summary">
          {summaryCards.map((card) => (
            <div className="card compact-card" key={card.label}>
              <div className="muted">{card.label}</div>
              {card.label === "Status" ? (
                <div className={`status-pill ${getStatusTone(qrCode.status)}`}>
                  {card.value}
                </div>
              ) : (
                <div className="h2">{card.value}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-split">
        <div className="card stack-lg">
          <div>
            <h2 className="h2">Routing & metadata</h2>
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
                <div className="muted">Workspace</div>
                <div>{qrCode.workspace.name}</div>
              </div>
              <div>
                <div className="muted">Folder</div>
                <div>{qrCode.folder?.name ?? "Root"}</div>
              </div>
              <div>
                <div className="muted">Custom domain</div>
                <div className="mono">
                  {qrCode.customDomain ?? "Using the default short host"}
                </div>
              </div>
              <div>
                <div className="muted">Type</div>
                <div>{qrCode.type}</div>
              </div>
              <div>
                <div className="muted">Destination URL</div>
                {linkTarget ? (
                  <a
                    className="dashboard-link mono break-word"
                    href={linkTarget}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {linkTarget}
                  </a>
                ) : (
                  <div>No destination URL saved.</div>
                )}
              </div>
              <div>
                <div className="muted">Created</div>
                <div>{formatDateTime(qrCode.createdAt)}</div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="h2">Scan settings</h2>
            <div className="key-value-grid">
              <div className="muted">Ads</div>
              <div>{formatBooleanLabel(qrCode.adsEnabled)}</div>
              <div className="muted">Search indexing</div>
              <div>{qrCode.doNotIndex ? "Hidden from indexing" : "Allowed"}</div>
              <div className="muted">One-time redirect</div>
              <div>{formatBooleanLabel(qrCode.isOneTime)}</div>
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
            {qrCode.downloads.length === 0 ? (
              <div className="callout">
                No downloads are ready yet. Refresh assets to render the latest files for this QR code.
              </div>
            ) : (
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
            )}
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
          <h2 className="h2">Design</h2>
          <div className="key-value-grid">
            <div className="muted">Foreground</div>
            <div>{typeof design.patternColor === "string" ? design.patternColor : "Default"}</div>
            <div className="muted">Background</div>
            <div>{typeof design.backgroundColor === "string" ? design.backgroundColor : "Default"}</div>
            <div className="muted">Pattern</div>
            <div>{typeof design.pattern === "string" ? design.pattern : "square"}</div>
            <div className="muted">Corners</div>
            <div>{typeof design.cornersOuter === "string" ? design.cornersOuter : "square"}</div>
            <div className="muted">Error correction</div>
            <div>{typeof design.errorCorrection === "string" ? design.errorCorrection : "M"}</div>
            <div className="muted">Size</div>
            <div>
              {typeof design.sizePx === "number" ? `${design.sizePx}px` : "Default"}
            </div>
            <div className="muted">Quiet zone</div>
            <div>
              {typeof design.quietZoneModules === "number"
                ? `${design.quietZoneModules} modules`
                : "Default"}
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="h2">Next steps</h2>
          <div className="stack-sm">
            <div className="callout">
              Use the download buttons above to export PNG or SVG files, or open analytics to review the latest scans.
            </div>
            <div className="table-actions">
              <Link className="button secondary compact" href={"/dashboard" as Route}>
                Back to QR list
              </Link>
              <Link className="button secondary compact" href={`/dashboard/analytics?qr=${qrCode.id}` as Route}>
                Open analytics
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
