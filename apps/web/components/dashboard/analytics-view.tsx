"use client";

import { useEffect, useState } from "react";
import {
  getDashboardQrAnalytics,
  listDashboardQrCodes,
  type DashboardAnalyticsDailyPoint,
  type DashboardAnalyticsEvent,
  type DashboardAnalyticsResponse,
  type DashboardQrListResponse
} from "../../lib/dashboard-api";
import { EmptyState, ErrorState, LoadingState } from "./dashboard-state";
import type { RemoteState } from "./dashboard-types";
import {
  createInitialRemoteState,
  formatDateTime,
  formatNumber,
  formatShortDate,
  getDefaultRange,
  getQrDisplayName,
  sumByKey,
  toErrorMessage
} from "./dashboard-utils";

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

export function AnalyticsView({
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
          if (currentValue && response.items.some((item) => item.id === currentValue)) {
            return currentValue;
          }

          if (initialQrId && response.items.some((item) => item.id === initialQrId)) {
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

  const selectedQr = qrCodes.find((qrCode) => qrCode.id === selectedQrId) ?? qrCodes[0];

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
