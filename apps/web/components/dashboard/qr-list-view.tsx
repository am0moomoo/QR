"use client";

import type { Route } from "next";
import Link from "next/link";
import { qrStatuses, qrTypes } from "@qr/types";
import { useDeferredValue, useEffect, useState } from "react";
import {
  listDashboardQrCodes,
  type DashboardQrListResponse
} from "../../lib/dashboard-api";
import { EmptyState, ErrorState, LoadingState } from "./dashboard-state";
import { type RemoteState, qrSortOptions, type QrSortValue } from "./dashboard-types";
import {
  createInitialRemoteState,
  formatDateTime,
  formatNumber,
  getQrDisplayName,
  getStatusLabel,
  getStatusTone,
  matchesSearch,
  sortQrCodes,
  toErrorMessage
} from "./dashboard-utils";

export function QrListView({
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
      <main data-testid="qr-list-view">
        <LoadingState
          body="The dashboard is pulling QR codes from the live API."
          title="Loading your QR codes"
        />
      </main>
    );
  }

  if (qrCodesState.status === "error") {
    return (
      <main data-testid="qr-list-view">
        <ErrorState
          body={qrCodesState.errorMessage ?? "QR list request failed."}
          onRetry={() => setReloadNonce((value) => value + 1)}
          title="Could not load QR codes"
        />
      </main>
    );
  }

  if ((qrCodesState.data?.total ?? 0) === 0) {
    return (
      <main data-testid="qr-list-view">
        <EmptyState
          action={
            <Link className="button" href={"/generator" as Route}>
              Create your first link QR
            </Link>
          }
          body="No QR codes exist for this account yet. The list is reading live API data, so an empty state here means the backend returned zero items."
          title="No QR codes yet"
        />
      </main>
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
          <div className="table-actions">
            <Link className="button" href={"/generator" as Route}>
              Create link QR
            </Link>
            <button
              className="button secondary"
              onClick={() => setReloadNonce((value) => value + 1)}
              type="button"
            >
              Refresh
            </button>
          </div>
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
