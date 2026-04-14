"use client";

import type { Route } from "next";
import Link from "next/link";
import { qrStatuses, qrTypes } from "@qr/types";
import { useDeferredValue, useEffect, useState } from "react";
import {
  createDashboardFolder,
  createDashboardWorkspace,
  deleteDashboardQrCode,
  downloadDashboardQrAsset,
  duplicateDashboardQrCode,
  exportDashboardQrCodes,
  importDashboardQrCodes,
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
  getErrorRequestId,
  getErrorSupportText,
  getQrDisplayName,
  getStatusLabel,
  getStatusTone,
  isUpgradeRequiredError,
  matchesSearch,
  sortQrCodes,
  startFileDownload,
  toErrorMessage
} from "./dashboard-utils";
import { useWorkspaceSelection } from "./use-workspace-selection";

export function QrListView({
  token
}: {
  token: string;
}) {
  const {
    chooseFolder,
    chooseWorkspace,
    folders,
    foldersState,
    refreshFolders,
    refreshWorkspaces,
    selectedFolder,
    selectedFolderId,
    selectedWorkspace,
    selectedWorkspaceId,
    workspaces,
    workspacesState
  } = useWorkspaceSelection({
    token
  });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sortValue, setSortValue] = useState<QrSortValue>("updated-desc");
  const [searchValue, setSearchValue] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [actionError, setActionError] = useState<{
    message: string;
    supportText: string | null;
    upgradeRequired: boolean;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [folderName, setFolderName] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importData, setImportData] = useState("");
  const [qrCodesState, setQrCodesState] =
    useState<RemoteState<DashboardQrListResponse>>(createInitialRemoteState);
  const deferredSearch = useDeferredValue(searchValue);

  function buildActionKey(qrId: string, action: string) {
    return `${qrId}:${action}`;
  }

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    let isActive = true;
    setActionError(null);

    setQrCodesState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      errorRequestId: null,
      status: "loading"
    }));

    listDashboardQrCodes(token, {
      page: 1,
      pageSize: 100,
      status: statusFilter === "ALL" ? undefined : statusFilter,
      type: typeFilter === "ALL" ? undefined : typeFilter,
      workspaceId: selectedWorkspaceId
    })
      .then((response) => {
        if (!isActive) {
          return;
        }

        setQrCodesState({
          data: response,
          errorMessage: null,
          errorRequestId: null,
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
          errorRequestId: getErrorRequestId(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [reloadNonce, selectedWorkspaceId, statusFilter, token, typeFilter]);

  const workspaceItems = workspacesState.data?.items ?? [];
  const items = qrCodesState.data?.items ?? [];
  const folderFilteredItems = selectedFolderId
    ? items.filter((qrCode) => qrCode.folderId === selectedFolderId)
    : items;
  const filteredItems = sortQrCodes(
    folderFilteredItems.filter((qrCode) => matchesSearch(qrCode, deferredSearch)),
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
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
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
      refreshWorkspaces();
      refreshFolders();
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
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
      refreshWorkspaces();
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
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
      refreshWorkspaces();
      refreshFolders();
      setReloadNonce((value) => value + 1);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleCreateWorkspace() {
    const trimmedName = workspaceName.trim();

    if (!trimmedName) {
      setActionError({
        message: "Enter a workspace name before creating it.",
        supportText: null,
        upgradeRequired: false
      });
      return;
    }

    setBusyActionKey("workspace:create");
    setActionError(null);
    setActionMessage(null);

    try {
      const workspace = await createDashboardWorkspace(token, {
        name: trimmedName
      });
      setWorkspaceName("");
      refreshWorkspaces();
      chooseWorkspace(workspace.id);
      setActionMessage(`Workspace "${workspace.name}" is ready.`);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: false
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleCreateFolder() {
    if (!selectedWorkspaceId) {
      return;
    }

    const trimmedName = folderName.trim();

    if (!trimmedName) {
      setActionError({
        message: "Enter a folder name before creating it.",
        supportText: null,
        upgradeRequired: false
      });
      return;
    }

    setBusyActionKey("folder:create");
    setActionError(null);
    setActionMessage(null);

    try {
      const folder = await createDashboardFolder(token, selectedWorkspaceId, {
        name: trimmedName
      });
      setFolderName("");
      refreshFolders();
      chooseFolder(folder.id);
      setActionMessage(`Folder "${folder.name}" is ready.`);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: false
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleExport(format: "csv" | "json") {
    if (!selectedWorkspaceId) {
      return;
    }

    setBusyActionKey(`export:${format}`);
    setActionError(null);
    setActionMessage(null);

    try {
      const file = await exportDashboardQrCodes(token, selectedWorkspaceId, format);
      startFileDownload(file);
      setActionMessage(
        format === "csv"
          ? "CSV export downloaded."
          : "JSON export downloaded."
      );
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: false
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  async function handleImport() {
    if (!selectedWorkspaceId) {
      return;
    }

    if (!importData.trim()) {
      setActionError({
        message: "Paste CSV or JSON rows before starting the import.",
        supportText: null,
        upgradeRequired: false
      });
      return;
    }

    setBusyActionKey("import");
    setActionError(null);
    setActionMessage(null);

    try {
      const imported = await importDashboardQrCodes(token, selectedWorkspaceId, {
        data: importData,
        folderId: selectedFolderId,
        format: importFormat
      });
      refreshWorkspaces();
      refreshFolders();
      setReloadNonce((value) => value + 1);
      setActionMessage(`Imported ${imported.createdCount} QR code${imported.createdCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error),
        upgradeRequired: isUpgradeRequiredError(error)
      });
    } finally {
      setBusyActionKey(null);
    }
  }

  if (workspacesState.status === "loading" && !workspacesState.data) {
    return (
      <main data-testid="qr-list-view">
        <LoadingState
          body="Loading your workspaces and QR codes."
          title="Loading your QR codes"
        />
      </main>
    );
  }

  if (workspacesState.status === "error") {
    return (
      <main data-testid="qr-list-view">
        <ErrorState
          body={workspacesState.errorMessage ?? "We couldn't load your workspaces right now."}
          supportText={
            workspacesState.errorRequestId
              ? `Support reference: ${workspacesState.errorRequestId}`
              : null
          }
          title="Could not load dashboard workspaces"
        />
      </main>
    );
  }

  if (!selectedWorkspace) {
    return (
      <main data-testid="qr-list-view">
        <EmptyState
          body="Create a workspace to start organizing QR codes."
          title="No workspace available"
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
          supportText={
            qrCodesState.errorRequestId
              ? `Support reference: ${qrCodesState.errorRequestId}`
              : null
          }
          title="Could not load QR codes"
        />
      </main>
    );
  }

  const totalQrCodes = qrCodesState.data?.total ?? items.length;

  return (
    <main className="stack-xl" data-testid="qr-list-view">
      <section className="card stack-lg">
        <div className="toolbar">
          <div>
            <span className="badge">Workspace</span>
            <h1 className="h2">Run QR operations for each workspace</h1>
            <p className="muted">
              Switch workspaces, group QR codes into folders, and handle imports or exports without leaving the dashboard.
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

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="workspace-select">
              Workspace
            </label>
            <select
              className="select"
              data-testid="workspace-select"
              id="workspace-select"
              onChange={(event) => chooseWorkspace(event.target.value)}
              value={selectedWorkspaceId}
            >
              {workspaceItems.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <div className="muted">
              Plan: {selectedWorkspace.plan} | QR codes: {selectedWorkspace.qrCodeCount}
              {selectedWorkspace.customDomain ? ` | Domain: ${selectedWorkspace.customDomain}` : ""}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="workspace-name">
              New workspace
            </label>
            <input
              className="input"
              data-testid="workspace-name"
              id="workspace-name"
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Campaign Ops"
              value={workspaceName}
            />
            <button
              className="button secondary compact"
              data-testid="workspace-create"
              disabled={busyActionKey === "workspace:create"}
              onClick={handleCreateWorkspace}
              type="button"
            >
              {busyActionKey === "workspace:create" ? "Creating..." : "Create workspace"}
            </button>
          </div>

          <div>
            <label className="label" htmlFor="folder-select">
              Folder filter
            </label>
            <select
              className="select"
              data-testid="folder-select"
              id="folder-select"
              onChange={(event) => chooseFolder(event.target.value ? event.target.value : null)}
              value={selectedFolderId ?? ""}
            >
              <option value="">All folders</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <div className="muted">
              {foldersState.status === "loading"
                ? "Loading folders..."
                : selectedFolder
                  ? `Showing ${selectedFolder.name}`
                  : "Showing every folder in this workspace"}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="folder-name">
              New folder
            </label>
            <input
              className="input"
              data-testid="folder-name"
              id="folder-name"
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Spring launch"
              value={folderName}
            />
            <button
              className="button secondary compact"
              data-testid="folder-create"
              disabled={busyActionKey === "folder:create"}
              onClick={handleCreateFolder}
              type="button"
            >
              {busyActionKey === "folder:create" ? "Creating..." : "Create folder"}
            </button>
          </div>
        </div>

        <div className="dashboard-split">
          <div className="card compact-card stack-md">
            <div>
              <h2 className="h2">Bulk export</h2>
              <p className="muted">
                Download the current workspace inventory as JSON or CSV.
              </p>
            </div>
            <div className="table-actions">
              <button
                className="button secondary compact"
                data-testid="qr-export-json"
                disabled={busyActionKey === "export:json"}
                onClick={() => handleExport("json")}
                type="button"
              >
                {busyActionKey === "export:json" ? "Preparing..." : "Export JSON"}
              </button>
              <button
                className="button secondary compact"
                data-testid="qr-export-csv"
                disabled={busyActionKey === "export:csv"}
                onClick={() => handleExport("csv")}
                type="button"
              >
                {busyActionKey === "export:csv" ? "Preparing..." : "Export CSV"}
              </button>
            </div>
          </div>

          <div className="card compact-card stack-md">
            <div>
              <h2 className="h2">Bulk import</h2>
              <p className="muted">
                Import link QR codes into the selected workspace{selectedFolder ? ` and folder ${selectedFolder.name}` : ""}.
              </p>
            </div>
            <div className="form-grid">
              <div>
                <label className="label" htmlFor="qr-import-format">
                  Format
                </label>
                <select
                  className="select"
                  data-testid="qr-import-format"
                  id="qr-import-format"
                  onChange={(event) => setImportFormat(event.target.value as "csv" | "json")}
                  value={importFormat}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </div>
            </div>
            <textarea
              className="input"
              data-testid="qr-import-data"
              onChange={(event) => setImportData(event.target.value)}
              placeholder={
                importFormat === "csv"
                  ? "title,link\nSpring launch,https://example.com/spring"
                  : '[{\"title\":\"Spring launch\",\"link\":\"https://example.com/spring\"}]'
              }
              rows={5}
              value={importData}
            />
            <button
              className="button secondary compact"
              data-testid="qr-import-submit"
              disabled={busyActionKey === "import"}
              onClick={handleImport}
              type="button"
            >
              {busyActionKey === "import" ? "Importing..." : "Import QR codes"}
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <div>
            <span className="badge">QR codes</span>
            <h2 className="h2">QR list</h2>
            <p className="muted">
              Search by title, filter by status, and manage the QR codes inside {selectedWorkspace.name}.
            </p>
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
            Showing {filteredItems.length} of {totalQrCodes} QR codes in {selectedWorkspace.name}
          </span>
          {qrCodesState.status === "loading" ? (
            <span className="muted">Refreshing...</span>
          ) : null}
        </div>

        {totalQrCodes === 0 ? (
          <EmptyState
            action={
              <>
                <Link className="button" href={"/generator" as Route}>
                  Create your first link QR
                </Link>
                <Link className="button secondary" href={"/dashboard/settings" as Route}>
                  Connect a custom domain
                </Link>
              </>
            }
            body={`No QR codes exist in ${selectedWorkspace.name} yet. Create one from the generator or import a batch above.`}
            title="No QR codes yet"
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            action={
              <>
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearchValue("");
                    setSortValue("updated-desc");
                    setStatusFilter("ALL");
                    setTypeFilter("ALL");
                    chooseFolder(null);
                  }}
                  type="button"
                >
                  Clear filters
                </button>
                <Link className="button" href={"/generator" as Route}>
                  Create another QR
                </Link>
              </>
            }
            body="No QR codes match the current search, status, type, or folder filters."
            title="Nothing matches these filters"
          />
        ) : (
          <div className="table-wrap">
            <table className="table" data-testid="qr-list-table">
              <thead>
                <tr>
                  <th>QR code</th>
                  <th>Status</th>
                  <th>Folder</th>
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
                        <span className="muted">
                          {qrCode.workspace.name}
                          {qrCode.folder ? ` | ${qrCode.folder.name}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill ${getStatusTone(qrCode.status)}`}>
                        {getStatusLabel(qrCode.status)}
                      </span>
                    </td>
                    <td>{qrCode.folder?.name ?? "Root"}</td>
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
