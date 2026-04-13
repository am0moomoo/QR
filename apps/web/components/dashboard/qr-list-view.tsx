"use client";

import type { Route } from "next";
import Link from "next/link";
import { qrStatuses, qrTypes } from "@qr/types";
import { useDeferredValue, useEffect, useState } from "react";
import {
  deleteDashboardQrCode,
  downloadDashboardQrAsset,
  duplicateDashboardQrCode,
  listDashboardQrCodes,
  postDashboardQrAction,
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
  startFileDownload,
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [qrCodesState, setQrCodesState] =
    useState<RemoteState<DashboardQrListResponse>>(createInitialRemoteState);
  const deferredSearch = useDeferredValue(searchValue);

  function buildActionKey(qrId: string, action: string) {
    return `${qrId}:${action}`;
  }

  useEffect(() => {
    let isActive = true;
    setActionError(null);

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

  async function handleDownload(qrId: string, format: "png" | "svg" = "png") {
    const actionKey = buildActionKey(qrId, `download-${format}`);
    setBusyActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      const file = await downloadDashboardQrAsset(token, qrId, format);
      startFileDownload(file);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleDuplicate(qrId: string) {
    const actionKey = buildActionKey(qrId, "duplicate");
    setBusyActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await duplicateDashboardQrCode(token, qrId);
      setActionMessage("A copy of the QR code is ready in your list.");
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleStatusAction(
    qrId: string,
    action: "activate" | "archive"
  ) {
    const actionKey = buildActionKey(qrId, action);
    setBusyActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await postDashboardQrAction(token, qrId, action);
      setActionMessage(
        action === "archive"
          ? "The QR code was archived."
          : "The QR code is active again."
      );
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleDelete(qrId: string) {
    if (!window.confirm("Delete this QR code? Downloads and scan history links will no longer be available from the dashboard.")) {
      return;
    }

    const actionKey = buildActionKey(qrId, "delete");
    setBusyActionKey(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      await deleteDashboardQrCode(token, qrId);
      setActionMessage("The QR code was deleted.");
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError(toErrorMessage(error));
    } finally {
      setBusyActionKey(null);
    }
  }

  if (qrCodesState.status === "loading" && !qrCodesState.data) {
    return (
      <main data-testid="qr-list-view">
        <LoadingState
          body="Loading your QR codes and the latest scan counts."
          title="Loading your QR codes"
        />
      </main>
    );
  }

  if (qrCodesState.status === "error") {
    return (
      <main data-testid="qr-list-view">
        <ErrorState
          body={qrCodesState.errorMessage ?? "We couldn't load your QR codes right now."}
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
          body="You haven't created any QR codes yet. Start with a link QR and it will appear here right away."
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
            <span className="badge">QR codes</span>
            <h1 className="h2">Manage your QR codes</h1>
            <p className="muted">
              Search by title, filter by status, and take action on codes you already created.
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

        {actionMessage ? <div className="callout success">{actionMessage}</div> : null}
        {actionError ? <div className="callout danger">{actionError}</div> : null}

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
                        <button
                          className="button secondary compact"
                          data-testid={`qr-download-link-${qrCode.id}`}
                          disabled={busyActionKey === buildActionKey(qrCode.id, "download-png")}
                          onClick={() => handleDownload(qrCode.id, "png")}
                          type="button"
                        >
                          {busyActionKey === buildActionKey(qrCode.id, "download-png")
                            ? "Downloading..."
                            : "Download PNG"}
                        </button>
                        <button
                          className="button secondary compact"
                          data-testid={`qr-duplicate-${qrCode.id}`}
                          disabled={busyActionKey === buildActionKey(qrCode.id, "duplicate")}
                          onClick={() => handleDuplicate(qrCode.id)}
                          type="button"
                        >
                          {busyActionKey === buildActionKey(qrCode.id, "duplicate")
                            ? "Duplicating..."
                            : "Duplicate"}
                        </button>
                        {qrCode.status === "ACTIVE" ? (
                          <button
                            className="button secondary compact"
                            data-testid={`qr-archive-${qrCode.id}`}
                            disabled={busyActionKey === buildActionKey(qrCode.id, "archive")}
                            onClick={() => handleStatusAction(qrCode.id, "archive")}
                            type="button"
                          >
                            {busyActionKey === buildActionKey(qrCode.id, "archive")
                              ? "Archiving..."
                              : "Archive"}
                          </button>
                        ) : (
                          <button
                            className="button secondary compact"
                            data-testid={`qr-activate-${qrCode.id}`}
                            disabled={busyActionKey === buildActionKey(qrCode.id, "activate")}
                            onClick={() => handleStatusAction(qrCode.id, "activate")}
                            type="button"
                          >
                            {busyActionKey === buildActionKey(qrCode.id, "activate")
                              ? "Saving..."
                              : "Activate"}
                          </button>
                        )}
                        <button
                          className="button secondary compact"
                          data-testid={`qr-delete-${qrCode.id}`}
                          disabled={busyActionKey === buildActionKey(qrCode.id, "delete")}
                          onClick={() => handleDelete(qrCode.id)}
                          type="button"
                        >
                          {busyActionKey === buildActionKey(qrCode.id, "delete")
                            ? "Deleting..."
                            : "Delete"}
                        </button>
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
