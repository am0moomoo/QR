"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  createDashboardQrCode,
  downloadDashboardQrAsset,
  getDashboardQrCode,
  type DashboardQrCode
} from "../../lib/dashboard-api";
import { DashboardAuthPanel } from "../dashboard/dashboard-auth-panel";
import { EmptyState, ErrorState, LoadingState } from "../dashboard/dashboard-state";
import { useDashboardSession } from "../dashboard/use-dashboard-session";
import {
  getErrorSupportText,
  getQrLinkTarget,
  getStatusLabel,
  isUpgradeRequiredError,
  normalizeFieldValue,
  startFileDownload,
  toErrorMessage
} from "../dashboard/dashboard-utils";

const defaultDesign = {
  backgroundColor: "#ffffff",
  cornersInner: "square",
  cornersInnerColor: "#111111",
  cornersOuter: "square",
  cornersOuterColor: "#111111",
  errorCorrection: "M" as const,
  logoAssetId: null,
  logoHideBg: true,
  pattern: "square",
  patternColor: "#111111",
  quietZoneModules: 4,
  sizePx: 512
};

const defaultSettings = {
  adsEnabled: true,
  doNotIndex: false,
  expiresAt: null,
  isOneTime: false,
  maxScans: null,
  password: null
};

export function LinkGenerator() {
  const {
    handleAuthenticated,
    sessionState
  } = useDashboardSession();
  const [title, setTitle] = useState("Launch QR");
  const [link, setLink] = useState("https://example.com/launch");
  const [patternColor, setPatternColor] = useState("#111111");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [errorCorrection, setErrorCorrection] = useState<"L" | "M" | "Q" | "H">("M");
  const [createdQr, setCreatedQr] = useState<DashboardQrCode | null>(null);
  const [createError, setCreateError] = useState<{
    message: string;
    supportText: string | null;
    upgradeRequired: boolean;
  } | null>(null);
  const [downloadError, setDownloadError] = useState<{
    message: string;
    supportText: string | null;
  } | null>(null);
  const [busyDownload, setBusyDownload] = useState<"png" | "svg" | null>(null);
  const [isCreating, startCreateTransition] = useTransition();

  if (sessionState.status === "booting") {
    return (
      <LoadingState
        body="Restoring your session so you can create a QR code."
        title="Loading generator"
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

  if (!authenticatedSession?.user.defaultWorkspaceId) {
    return (
      <ErrorState
        body="A default workspace is required before this account can create QR codes."
        title="Workspace is unavailable"
      />
    );
  }

  function handleCreate() {
    setCreateError(null);
    setDownloadError(null);

    startCreateTransition(async () => {
      if (!authenticatedSession) {
        setCreateError({
          message: "The generator session is not ready yet.",
          supportText: null,
          upgradeRequired: false
        });
        return;
      }

      const workspaceId = authenticatedSession.user.defaultWorkspaceId;

      if (!workspaceId) {
        setCreateError({
          message: "No default workspace is available for this account.",
          supportText: null,
          upgradeRequired: false
        });
        return;
      }

      try {
        const created = await createDashboardQrCode(authenticatedSession.token, {
          content: {
            link
          },
          design: {
            ...defaultDesign,
            backgroundColor,
            errorCorrection,
            patternColor
          },
          exports: ["png", "svg"],
          settings: defaultSettings,
          title: normalizeFieldValue(title),
          type: "link",
          workspaceId
        });

        const qrCode = await getDashboardQrCode(
          authenticatedSession.token,
          created.id
        );
        setCreatedQr(qrCode);
      } catch (error) {
        setCreateError({
          message: toErrorMessage(error),
          supportText: getErrorSupportText(error),
          upgradeRequired: isUpgradeRequiredError(error)
        });
      }
    });
  }

  async function handleDownload(format: "png" | "svg") {
    if (!createdQr || !authenticatedSession) {
      return;
    }

    setBusyDownload(format);
    setDownloadError(null);

    try {
      const file = await downloadDashboardQrAsset(
        authenticatedSession.token,
        createdQr.id,
        format
      );
      startFileDownload(file);
    } catch (error) {
      setDownloadError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error)
      });
    } finally {
      setBusyDownload(null);
    }
  }

  return (
    <main className="stack-xl" data-testid="generator-view">
      <section className="card">
        <div className="toolbar">
          <div>
            <span className="badge">Create QR</span>
            <h1 className="h2">Create a link QR</h1>
            <p className="muted">
              Save a real link QR to your dashboard and export it as PNG or SVG.
            </p>
          </div>
          <Link className="button secondary" href="/dashboard">
            Open dashboard
          </Link>
        </div>

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="generator-title">
              Title
            </label>
            <input
              className="input"
              data-testid="generator-title"
              id="generator-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>

          <div>
            <label className="label" htmlFor="generator-link">
              Target URL
            </label>
            <input
              className="input"
              data-testid="generator-link"
              id="generator-link"
              onChange={(event) => setLink(event.target.value)}
              type="url"
              value={link}
            />
          </div>

          <div>
            <label className="label" htmlFor="generator-pattern-color">
              Foreground color
            </label>
            <input
              className="input"
              data-testid="generator-pattern-color"
              id="generator-pattern-color"
              onChange={(event) => setPatternColor(event.target.value)}
              value={patternColor}
            />
          </div>

          <div>
            <label className="label" htmlFor="generator-background-color">
              Background color
            </label>
            <input
              className="input"
              data-testid="generator-background-color"
              id="generator-background-color"
              onChange={(event) => setBackgroundColor(event.target.value)}
              value={backgroundColor}
            />
          </div>

          <div>
            <label className="label" htmlFor="generator-error-correction">
              Error correction
            </label>
            <select
              className="select"
              data-testid="generator-error-correction"
              id="generator-error-correction"
              onChange={(event) =>
                setErrorCorrection(event.target.value as "L" | "M" | "Q" | "H")
              }
              value={errorCorrection}
            >
              <option value="L">L</option>
              <option value="M">M</option>
              <option value="Q">Q</option>
              <option value="H">H</option>
            </select>
          </div>
        </div>

        {createError ? (
          <div className="callout danger">
            <div>{createError.message}</div>
            {createError.supportText ? <div className="muted">{createError.supportText}</div> : null}
            {createError.upgradeRequired ? (
              <div className="table-actions" style={{ marginTop: 10 }}>
                <Link className="button secondary compact" href="/dashboard/billing">
                  Review plans
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="table-actions">
          <button
            className="button"
            data-testid="generator-submit"
            disabled={isCreating}
            onClick={handleCreate}
            type="button"
          >
            {isCreating ? "Creating..." : "Create QR"}
          </button>
          <span className="muted">This QR code will be saved to your dashboard.</span>
        </div>
      </section>

      <section className="card">
        <span className="badge">Created result</span>
        {createdQr ? (
          <div className="stack-lg" data-testid="generator-created-result">
            <div className="stack-sm">
              <h2 className="h2">{createdQr.title ?? createdQr.slug}</h2>
              <div>Status: {getStatusLabel(createdQr.status)}</div>
              <div className="muted mono">{createdQr.slug}</div>
              {getQrLinkTarget(createdQr) ? (
                <a
                  className="dashboard-link mono break-word"
                  href={getQrLinkTarget(createdQr) ?? "#"}
                  rel="noreferrer"
                  target="_blank"
                >
                  {getQrLinkTarget(createdQr)}
                </a>
              ) : null}
              <a
                className="dashboard-link mono"
                href={createdQr.shortUrl}
                rel="noreferrer"
                target="_blank"
              >
                {createdQr.shortUrl}
              </a>
            </div>

            <div className="table-actions">
              <button
                className="button secondary compact"
                data-testid="generator-download-png"
                disabled={busyDownload === "png"}
                onClick={() => handleDownload("png")}
                type="button"
              >
                {busyDownload === "png" ? "Downloading..." : "Download PNG"}
              </button>
              <button
                className="button secondary compact"
                data-testid="generator-download-svg"
                disabled={busyDownload === "svg"}
                onClick={() => handleDownload("svg")}
                type="button"
              >
                {busyDownload === "svg" ? "Downloading..." : "Download SVG"}
              </button>
              <Link
                className="button secondary compact"
                href={`/dashboard/qr/${createdQr.id}`}
              >
                Open details
              </Link>
            </div>

            {downloadError ? (
              <div className="callout danger">
                <div>{downloadError.message}</div>
                {downloadError.supportText ? <div className="muted">{downloadError.supportText}</div> : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div data-testid="generator-empty-result">
            <EmptyState
              action={
                <Link className="button secondary" href="/dashboard">
                  Open dashboard
                </Link>
              }
              body="Create a QR code to see its slug, short URL, downloads, and next steps here."
              title="No QR created yet"
            />
          </div>
        )}
      </section>
    </main>
  );
}
