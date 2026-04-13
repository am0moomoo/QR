"use client";

import type { Route } from "next";
import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useState,
  useTransition,
  type FormEvent
} from "react";
import { qrStatuses, qrTypes } from "@qr/types";
import {
  type DashboardAnalyticsDailyPoint,
  type DashboardAnalyticsEvent,
  type DashboardAnalyticsResponse,
  type DashboardDownload,
  type DashboardQrCode,
  type DashboardQrListResponse,
  type DashboardUser,
  DashboardApiError,
  downloadDashboardQrAsset,
  fetchDashboardUser,
  getDashboardQrAnalytics,
  getDashboardQrCode,
  listDashboardQrCodes,
  loginDashboardUser,
  logoutDashboardUser,
  postDashboardQrAction,
  registerDashboardUser,
  updateDashboardUser
} from "../../lib/dashboard-api";

type DashboardSection = "analytics" | "details" | "list" | "settings";

type DashboardShellProps = {
  initialAnalyticsQrId?: string | null;
  qrId?: string;
  section: DashboardSection;
};

type StoredSession = {
  accessToken: string;
  user: DashboardUser;
};

type SessionState =
  | {
      errorMessage: string | null;
      status: "booting" | "unauthenticated";
      token: null;
      user: null;
    }
  | {
      errorMessage: string | null;
      status: "ready";
      token: string;
      user: DashboardUser;
    };

type RemoteState<T> = {
  data: T | null;
  errorMessage: string | null;
  status: "error" | "loading" | "ready";
};

const authStorageKey = "qrflow.dashboard.session";

const qrSortOptions = [
  { label: "Recently updated", value: "updated-desc" },
  { label: "Most scans", value: "scans-desc" },
  { label: "Last scan", value: "last-scan-desc" },
  { label: "Title A-Z", value: "title-asc" }
] as const;

type QrSortValue = (typeof qrSortOptions)[number]["value"];

function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(authStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredSession;
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

function writeStoredSession(session: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(authStorageKey);
}

function toErrorMessage(error: unknown) {
  if (error instanceof DashboardApiError || error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the API.";
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatNumber(value: number | string) {
  return new Intl.NumberFormat("en").format(Number(value));
}

function formatBytes(value: string | null) {
  if (!value) {
    return "Unknown size";
  }

  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeFieldValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function createInitialRemoteState<T>(): RemoteState<T> {
  return {
    data: null,
    errorMessage: null,
    status: "loading"
  };
}

function getDefaultRange(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  return {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10)
  };
}

function getQrDisplayName(qrCode: DashboardQrCode) {
  return qrCode.title?.trim() || qrCode.slug;
}

function getStatusTone(status: DashboardQrCode["status"]) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INACTIVE":
      return "warning";
    case "ARCHIVED":
      return "neutral";
    case "DELETED":
      return "danger";
    default:
      return "neutral";
  }
}

function getStatusLabel(status: DashboardQrCode["status"]) {
  return status.toLowerCase().replace(/_/g, " ");
}

function sortQrCodes(items: DashboardQrCode[], sortValue: QrSortValue) {
  return [...items].sort((left, right) => {
    if (sortValue === "title-asc") {
      return getQrDisplayName(left).localeCompare(getQrDisplayName(right));
    }

    if (sortValue === "scans-desc") {
      return Number(right.scansCount) - Number(left.scansCount);
    }

    if (sortValue === "last-scan-desc") {
      return (
        new Date(right.lastScanAt ?? 0).getTime() -
        new Date(left.lastScanAt ?? 0).getTime()
      );
    }

    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });
}

function matchesSearch(qrCode: DashboardQrCode, search: string) {
  if (!search) {
    return true;
  }

  const haystack = [
    qrCode.title,
    qrCode.slug,
    qrCode.shortUrl,
    qrCode.type
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function sumByKey(
  points: DashboardAnalyticsDailyPoint[],
  key: "browsers" | "countries" | "devices" | "operatingSystems"
) {
  const result: Record<string, number> = {};

  for (const point of points) {
    const values = point[key];

    for (const [entryKey, entryValue] of Object.entries(values)) {
      result[entryKey] = (result[entryKey] ?? 0) + entryValue;
    }
  }

  return Object.entries(result).sort((left, right) => right[1] - left[1]);
}

function LoadingState({ title, body }: { body: string; title: string }) {
  return (
    <section className="card state-card">
      <span className="badge">Loading</span>
      <h1 className="h2">{title}</h1>
      <p className="muted">{body}</p>
    </section>
  );
}

function ErrorState({
  actionLabel,
  body,
  onRetry,
  title
}: {
  actionLabel?: string;
  body: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <section className="card state-card">
      <span className="badge">Error</span>
      <h1 className="h2">{title}</h1>
      <p className="muted">{body}</p>
      {onRetry ? (
        <button className="button" onClick={onRetry} type="button">
          {actionLabel ?? "Retry"}
        </button>
      ) : null}
    </section>
  );
}

function EmptyState({
  action,
  body,
  title
}: {
  action?: React.ReactNode;
  body: string;
  title: string;
}) {
  return (
    <section className="card state-card">
      <span className="badge">Empty</span>
      <h1 className="h2">{title}</h1>
      <p className="muted">{body}</p>
      {action}
    </section>
  );
}

function AuthPanel({
  errorMessage,
  onAuthenticated
}: {
  errorMessage: string | null;
  onAuthenticated: (session: StoredSession) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    startTransition(async () => {
      try {
        const response =
          mode === "login"
            ? await loginDashboardUser({ email, password })
            : await registerDashboardUser({
                email,
                fullName: normalizeFieldValue(fullName),
                password
              });
        const session = {
          accessToken: response.accessToken,
          user: response.user
        };
        writeStoredSession(session);
        onAuthenticated(session);
      } catch (error) {
        setFormError(toErrorMessage(error));
      }
    });
  }

  return (
    <main className="dashboard-auth">
      <section className="card auth-card">
        <span className="badge">Authenticated dashboard</span>
        <h1 className="h2">Sign in to your QR workspace</h1>
        <p className="muted">
          This dashboard calls the live QR API with bearer auth. No mocks, no
          placeholder datasets.
        </p>

        <div className="dashboard-toggle">
          <button
            className={mode === "login" ? "button" : "button secondary"}
            onClick={() => setMode("login")}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "button" : "button secondary"}
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
        </div>

        <form
          className="stack-lg"
          data-testid="dashboard-auth-form"
          onSubmit={handleSubmit}
        >
          {mode === "register" ? (
            <div>
              <label className="label" htmlFor="dashboard-full-name">
                Full name
              </label>
              <input
                className="input"
                id="dashboard-full-name"
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Owner Example"
                value={fullName}
              />
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="dashboard-email">
              Email
            </label>
            <input
              className="input"
              id="dashboard-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
              type="email"
              value={email}
            />
          </div>

          <div>
            <label className="label" htmlFor="dashboard-password">
              Password
            </label>
            <input
              className="input"
              id="dashboard-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              type="password"
              value={password}
            />
          </div>

          {errorMessage || formError ? (
            <div className="callout danger">{formError ?? errorMessage}</div>
          ) : null}

          <button
            className="button"
            data-testid="dashboard-auth-submit"
            disabled={isPending}
            type="submit"
          >
            {isPending
              ? "Submitting..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function DashboardNavigation({
  section
}: {
  section: DashboardSection;
}) {
  return (
    <nav className="dashboard-nav">
      <Link
        className={section === "list" ? "dashboard-nav-link active" : "dashboard-nav-link"}
        href="/dashboard"
      >
        QR list
      </Link>
      <Link
        className={section === "analytics" ? "dashboard-nav-link active" : "dashboard-nav-link"}
        href={"/dashboard/analytics" as Route}
      >
        Analytics
      </Link>
      <Link
        className={section === "settings" ? "dashboard-nav-link active" : "dashboard-nav-link"}
        href={"/dashboard/settings" as Route}
      >
        Profile & settings
      </Link>
    </nav>
  );
}

function QrListView({
  token
}: {
  token: string;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sortValue, setSortValue] = useState<QrSortValue>("updated-desc");
  const [searchValue, setSearchValue] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [qrCodesState, setQrCodesState] =
    useState<RemoteState<DashboardQrListResponse>>(createInitialRemoteState);
  const deferredSearch = useDeferredValue(searchValue);

  useEffect(() => {
    let isActive = true;

    setQrCodesState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      status: "loading"
    }));

    listDashboardQrCodes(token, {
      page: 1,
      pageSize: 100,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      type: typeFilter === "ALL" ? undefined : typeFilter
    })
      .then((response) => {
        if (!isActive) {
          return;
        }

        setQrCodesState({
          data: response,
          errorMessage: null,
          status: "ready"
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setQrCodesState({
          data: null,
          errorMessage: toErrorMessage(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [reloadNonce, statusFilter, token, typeFilter]);

  const items = qrCodesState.data?.items ?? [];
  const filteredItems = sortQrCodes(
    items.filter((qrCode) => matchesSearch(qrCode, deferredSearch)),
    sortValue
  );

  if (qrCodesState.status === "loading" && !qrCodesState.data) {
    return (
      <LoadingState
        body="The dashboard is pulling QR codes from the live API."
        title="Loading your QR codes"
      />
    );
  }

  if (qrCodesState.status === "error") {
    return (
      <ErrorState
        body={qrCodesState.errorMessage ?? "QR list request failed."}
        onRetry={() => setReloadNonce((value) => value + 1)}
        title="Could not load QR codes"
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        body="No QR codes exist for this account yet. The list is reading live API data, so an empty state here means the backend returned zero items."
        title="No QR codes yet"
      />
    );
  }

  return (
    <main className="stack-xl" data-testid="qr-list-view">
      <section className="card">
        <div className="toolbar">
          <div>
            <span className="badge">Real API data</span>
            <h1 className="h2">QR list</h1>
            <p className="muted">
              Search runs locally on the live response set. Status and type
              filters call the real list endpoint.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setReloadNonce((value) => value + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="qr-search">
              Search
            </label>
            <input
              className="input"
              id="qr-search"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by title, slug, type, or short URL"
              value={searchValue}
            />
          </div>

          <div>
            <label className="label" htmlFor="qr-status-filter">
              Status filter
            </label>
            <select
              className="select"
              id="qr-status-filter"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="ALL">All statuses</option>
              {qrStatuses.map((status) => (
                <option key={status} value={status}>
                  {getStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="qr-type-filter">
              Type filter
            </label>
            <select
              className="select"
              id="qr-type-filter"
              onChange={(event) => setTypeFilter(event.target.value)}
              value={typeFilter}
            >
              <option value="ALL">All types</option>
              {qrTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="qr-sort">
              Sort
            </label>
            <select
              className="select"
              id="qr-sort"
              onChange={(event) => setSortValue(event.target.value as QrSortValue)}
              value={sortValue}
            >
              {qrSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="meta-row">
          <span className="muted">
            Showing {filteredItems.length} of {qrCodesState.data?.total ?? items.length} QR codes
          </span>
          {qrCodesState.status === "loading" ? (
            <span className="muted">Refreshing...</span>
          ) : null}
        </div>

        {filteredItems.length === 0 ? (
          <div className="callout">
            No QR codes match the current search and filter combination.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="qr-list-table">
              <thead>
                <tr>
                  <th>QR code</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Scans</th>
                  <th>Last scan</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((qrCode) => (
                  <tr data-testid={`qr-row-${qrCode.id}`} key={qrCode.id}>
                    <td>
                      <div className="stack-sm">
                        <strong>{getQrDisplayName(qrCode)}</strong>
                        <span className="muted mono">{qrCode.slug}</span>
                        <span className="muted mono">{qrCode.shortUrl}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${getStatusTone(qrCode.status)}`}>
                        {getStatusLabel(qrCode.status)}
                      </span>
                    </td>
                    <td>{qrCode.type}</td>
                    <td>{formatNumber(qrCode.scansCount)}</td>
                    <td>{formatDateTime(qrCode.lastScanAt)}</td>
                    <td>{formatDateTime(qrCode.updatedAt)}</td>
                    <td>
                      <div className="table-actions">
                        <Link
                          className="button secondary compact"
                          data-testid={`qr-details-link-${qrCode.id}`}
                          href={`/dashboard/qr/${qrCode.id}` as Route}
                        >
                          Details
                        </Link>
                        <Link
                          className="button secondary compact"
                          data-testid={`qr-analytics-link-${qrCode.id}`}
                          href={`/dashboard/analytics?qr=${qrCode.id}` as Route}
                        >
                          Analytics
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function QrDetailsView({
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

    Promise.all([
      getDashboardQrCode(token, qrId),
      getDashboardQrAnalytics(token, qrId, range)
    ])
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
                <a className="mono dashboard-link" href={qrCode.shortUrl} rel="noreferrer" target="_blank">
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
          <pre className="code-block">
            {JSON.stringify(qrCode.content, null, 2)}
          </pre>
        </div>

        <div className="card">
          <h2 className="h2">Design payload</h2>
          <pre className="code-block">
            {JSON.stringify(qrCode.design, null, 2)}
          </pre>
        </div>
      </section>
    </main>
  );
}

function AnalyticsChart({
  points
}: {
  points: DashboardAnalyticsDailyPoint[];
}) {
  const maxValue = points.reduce(
    (currentMax, point) => Math.max(currentMax, point.scans),
    1
  );

  return (
    <div className="stack-md">
      {points.map((point) => (
        <div className="bar-row" key={point.day}>
          <div className="bar-label">
            <strong>{formatShortDate(point.day)}</strong>
            <span className="muted">{formatNumber(point.scans)} scans</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max((point.scans / maxValue) * 100, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsTable({
  events
}: {
  events: DashboardAnalyticsEvent[];
}) {
  if (events.length === 0) {
    return <div className="callout">No raw scan events in the selected range.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Scanned</th>
            <th>Outcome</th>
            <th>Country</th>
            <th>Device</th>
            <th>Browser</th>
            <th>Language</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={`${event.scannedAt}-${event.requestId ?? event.outcome}`}>
              <td>{formatDateTime(event.scannedAt)}</td>
              <td>{event.outcome}</td>
              <td>{event.country ?? "Unknown"}</td>
              <td>{event.deviceType ?? "Unknown"}</td>
              <td>{event.browser ?? "Unknown"}</td>
              <td>{event.language ?? "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnalyticsView({
  initialQrId,
  token
}: {
  initialQrId?: string | null;
  token: string;
}) {
  const [qrCodesState, setQrCodesState] =
    useState<RemoteState<DashboardQrListResponse>>(createInitialRemoteState);
  const [analyticsState, setAnalyticsState] =
    useState<RemoteState<DashboardAnalyticsResponse>>(createInitialRemoteState);
  const [selectedQrId, setSelectedQrId] = useState<string>(initialQrId ?? "");
  const [range, setRange] = useState(getDefaultRange(14));
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let isActive = true;

    listDashboardQrCodes(token, { page: 1, pageSize: 100 })
      .then((response) => {
        if (!isActive) {
          return;
        }

        setQrCodesState({
          data: response,
          errorMessage: null,
          status: "ready"
        });

        setSelectedQrId((currentValue) => {
          if (
            currentValue &&
            response.items.some((item) => item.id === currentValue)
          ) {
            return currentValue;
          }

          if (
            initialQrId &&
            response.items.some((item) => item.id === initialQrId)
          ) {
            return initialQrId;
          }

          return response.items[0]?.id ?? "";
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setQrCodesState({
          data: null,
          errorMessage: toErrorMessage(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [initialQrId, token]);

  useEffect(() => {
    if (!selectedQrId) {
      return;
    }

    let isActive = true;

    setAnalyticsState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      status: "loading"
    }));

    getDashboardQrAnalytics(token, selectedQrId, range)
      .then((response) => {
        if (!isActive) {
          return;
        }

        setAnalyticsState({
          data: response,
          errorMessage: null,
          status: "ready"
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        setAnalyticsState({
          data: null,
          errorMessage: toErrorMessage(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [range, reloadNonce, selectedQrId, token]);

  if (qrCodesState.status === "loading" && !qrCodesState.data) {
    return (
      <LoadingState
        body="The analytics page is loading your QR inventory so it can query real aggregate data."
        title="Loading analytics"
      />
    );
  }

  if (qrCodesState.status === "error") {
    return (
      <ErrorState
        body={qrCodesState.errorMessage ?? "Could not load the QR selector."}
        onRetry={() => setReloadNonce((value) => value + 1)}
        title="Could not load analytics"
      />
    );
  }

  const qrCodes = qrCodesState.data?.items ?? [];

  if (qrCodes.length === 0) {
    return (
      <EmptyState
        body="Analytics is empty because there are no QR codes in this account yet."
        title="No QR codes to analyze"
      />
    );
  }

  const selectedQr =
    qrCodes.find((qrCode) => qrCode.id === selectedQrId) ?? qrCodes[0];

  if (!selectedQr) {
    return (
      <EmptyState
        body="No QR code is available for analytics selection."
        title="No analytics target"
      />
    );
  }

  const analytics = analyticsState.data;
  const countryTotals = analytics ? sumByKey(analytics.daily, "countries") : [];
  const deviceTotals = analytics ? sumByKey(analytics.daily, "devices") : [];

  return (
    <main className="stack-xl" data-testid="analytics-view">
      <section className="card">
        <div className="toolbar">
          <div>
            <span className="badge">Real aggregate API</span>
            <h1 className="h2">Analytics</h1>
            <p className="muted">
              Daily bars, recent events, and breakdown cards are drawn from the
              live <code>/qr-codes/:id/analytics</code> endpoint.
            </p>
          </div>
          <button
            className="button secondary"
            onClick={() => setReloadNonce((value) => value + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="analytics-qr">
              QR code
            </label>
            <select
              className="select"
              id="analytics-qr"
              onChange={(event) => setSelectedQrId(event.target.value)}
              value={selectedQr.id}
            >
              {qrCodes.map((qrCode) => (
                <option key={qrCode.id} value={qrCode.id}>
                  {getQrDisplayName(qrCode)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="analytics-from">
              From
            </label>
            <input
              className="input"
              id="analytics-from"
              onChange={(event) =>
                setRange((currentRange) => ({
                  ...currentRange,
                  from: event.target.value
                }))
              }
              type="date"
              value={range.from}
            />
          </div>
          <div>
            <label className="label" htmlFor="analytics-to">
              To
            </label>
            <input
              className="input"
              id="analytics-to"
              onChange={(event) =>
                setRange((currentRange) => ({
                  ...currentRange,
                  to: event.target.value
                }))
              }
              type="date"
              value={range.to}
            />
          </div>
        </div>
      </section>

      <section className="stats-grid" data-testid="analytics-summary">
        <div className="card compact-card">
          <div className="muted">Selected QR</div>
          <div className="h2">{getQrDisplayName(selectedQr)}</div>
          <div className="muted mono">{selectedQr.slug}</div>
        </div>
        <div className="card compact-card">
          <div className="muted">Scans in range</div>
          <div className="h2">
            {analytics ? formatNumber(analytics.summary.scans) : "--"}
          </div>
        </div>
        <div className="card compact-card">
          <div className="muted">Unique IPs</div>
          <div className="h2">
            {analytics ? formatNumber(analytics.summary.uniqueIps) : "--"}
          </div>
        </div>
        <div className="card compact-card">
          <div className="muted">Unique devices</div>
          <div className="h2">
            {analytics ? formatNumber(analytics.summary.uniqueDevices) : "--"}
          </div>
        </div>
      </section>

      {analyticsState.status === "loading" && !analytics ? (
        <LoadingState
          body="Pulling aggregates for the selected QR code."
          title="Loading chart data"
        />
      ) : null}

      {analyticsState.status === "error" ? (
        <ErrorState
          body={analyticsState.errorMessage ?? "Analytics request failed."}
          onRetry={() => setReloadNonce((value) => value + 1)}
          title="Could not load analytics"
        />
      ) : null}

      {analytics ? (
        <>
          <section className="dashboard-split">
            <div className="card">
              <h2 className="h2">Daily scan volume</h2>
              {analytics.daily.length === 0 ? (
                <div className="callout">
                  No daily aggregate rows were returned for this time window.
                </div>
              ) : (
                <AnalyticsChart points={analytics.daily} />
              )}
            </div>

            <div className="card stack-lg">
              <div>
                <h2 className="h2">Top countries</h2>
                {countryTotals.length === 0 ? (
                  <div className="callout">No country data yet.</div>
                ) : (
                  <div className="stack-sm">
                    {countryTotals.slice(0, 5).map(([country, count]) => (
                      <div className="inline-stat" key={country}>
                        <span>{country}</span>
                        <strong>{formatNumber(count)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h2 className="h2">Top devices</h2>
                {deviceTotals.length === 0 ? (
                  <div className="callout">No device data yet.</div>
                ) : (
                  <div className="stack-sm">
                    {deviceTotals.slice(0, 5).map(([device, count]) => (
                      <div className="inline-stat" key={device}>
                        <span>{device}</span>
                        <strong>{formatNumber(count)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="h2">Recent scan events</h2>
            <EventsTable events={analytics.recentEvents} />
          </section>
        </>
      ) : null}
    </main>
  );
}

function SettingsView({
  onUserUpdated,
  token,
  user
}: {
  onUserUpdated: (user: DashboardUser) => void;
  token: string;
  user: DashboardUser;
}) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [locale, setLocale] = useState(user.locale);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFullName(user.fullName ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
    setLocale(user.locale);
  }, [user.avatarUrl, user.fullName, user.id, user.locale]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const updatedUser = await updateDashboardUser(token, {
          avatarUrl: normalizeFieldValue(avatarUrl),
          fullName: normalizeFieldValue(fullName),
          locale: locale.trim() || "en"
        });
        writeStoredSession({
          accessToken: token,
          user: updatedUser
        });
        onUserUpdated(updatedUser);
        setMessage("Profile settings saved from the live API.");
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
    });
  }

  return (
    <main className="stack-xl" data-testid="settings-view">
      <section className="card">
        <span className="badge">Live /me endpoint</span>
        <h1 className="h2">Profile & settings</h1>
        <p className="muted">
          These fields load from <code>GET /me</code> and save back to{" "}
          <code>PATCH /me</code>.
        </p>
      </section>

      <section className="dashboard-split">
        <form
          className="card stack-lg"
          data-testid="settings-form"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="label" htmlFor="settings-full-name">
              Full name
            </label>
            <input
              className="input"
              id="settings-full-name"
              onChange={(event) => setFullName(event.target.value)}
              value={fullName}
            />
          </div>

          <div>
            <label className="label" htmlFor="settings-avatar-url">
              Avatar URL
            </label>
            <input
              className="input"
              id="settings-avatar-url"
              onChange={(event) => setAvatarUrl(event.target.value)}
              placeholder="https://example.com/avatar.png"
              type="url"
              value={avatarUrl}
            />
          </div>

          <div>
            <label className="label" htmlFor="settings-locale">
              Locale
            </label>
            <input
              className="input"
              id="settings-locale"
              onChange={(event) => setLocale(event.target.value)}
              value={locale}
            />
          </div>

          {message ? <div className="callout success">{message}</div> : null}
          {errorMessage ? <div className="callout danger">{errorMessage}</div> : null}

          <button className="button" disabled={isPending} type="submit">
            {isPending ? "Saving..." : "Save profile"}
          </button>
        </form>

        <div className="card stack-lg">
          <div>
            <h2 className="h2">Current account</h2>
            <div className="key-value-grid">
              <div className="muted">Email</div>
              <div>{user.email}</div>
              <div className="muted">Full name</div>
              <div>{user.fullName ?? "Not set"}</div>
              <div className="muted">Avatar URL</div>
              <div className="mono break-word">{user.avatarUrl ?? "Not set"}</div>
              <div className="muted">Locale</div>
              <div>{user.locale}</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function DashboardShell({
  initialAnalyticsQrId,
  qrId,
  section
}: DashboardShellProps) {
  const [sessionState, setSessionState] = useState<SessionState>({
    errorMessage: null,
    status: "booting",
    token: null,
    user: null
  });
  const [isLoggingOut, startLogoutTransition] = useTransition();

  useEffect(() => {
    let isActive = true;
    const storedSession = readStoredSession();

    if (!storedSession?.accessToken) {
      setSessionState({
        errorMessage: null,
        status: "unauthenticated",
        token: null,
        user: null
      });
      return;
    }

    fetchDashboardUser(storedSession.accessToken)
      .then((user) => {
        if (!isActive) {
          return;
        }

        writeStoredSession({
          accessToken: storedSession.accessToken,
          user
        });
        setSessionState({
          errorMessage: null,
          status: "ready",
          token: storedSession.accessToken,
          user
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        clearStoredSession();
        setSessionState({
          errorMessage: toErrorMessage(error),
          status: "unauthenticated",
          token: null,
          user: null
        });
      });

    return () => {
      isActive = false;
    };
  }, []);

  function handleAuthenticated(session: StoredSession) {
    setSessionState({
      errorMessage: null,
      status: "ready",
      token: session.accessToken,
      user: session.user
    });
  }

  function handleUserUpdated(user: DashboardUser) {
    setSessionState((currentState) =>
      currentState.status === "ready"
        ? {
            ...currentState,
            user
          }
        : currentState
    );
  }

  function handleLogout() {
    if (sessionState.status !== "ready") {
      return;
    }

    startLogoutTransition(async () => {
      try {
        await logoutDashboardUser(sessionState.token);
      } catch {
        // Local logout should still clear stale session material.
      }

      clearStoredSession();
      setSessionState({
        errorMessage: null,
        status: "unauthenticated",
        token: null,
        user: null
      });
    });
  }

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
      <AuthPanel
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
