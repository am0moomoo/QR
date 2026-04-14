"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import {
  createDashboardCustomDomain,
  deleteDashboardCustomDomain,
  listDashboardCustomDomains,
  type DashboardCustomDomainListResponse,
  type DashboardUser,
  updateDashboardUser,
  verifyDashboardCustomDomain
} from "../../lib/dashboard-api";
import { ErrorState } from "./dashboard-state";
import type { RemoteState } from "./dashboard-types";
import {
  createInitialRemoteState,
  getErrorRequestId,
  getErrorSupportText,
  normalizeFieldValue,
  toErrorMessage,
  writeStoredSession
} from "./dashboard-utils";
import { useWorkspaceSelection } from "./use-workspace-selection";

export function SettingsView({
  onUserUpdated,
  token,
  user
}: {
  onUserUpdated: (user: DashboardUser) => void;
  token: string;
  user: DashboardUser;
}) {
  const {
    chooseWorkspace,
    refreshWorkspaces,
    selectedWorkspace,
    selectedWorkspaceId,
    workspaces,
    workspacesState
  } = useWorkspaceSelection({
    defaultWorkspaceId: user.defaultWorkspaceId ?? null,
    token
  });
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [locale, setLocale] = useState(user.locale);
  const [domain, setDomain] = useState("go.example.com");
  const [message, setMessage] = useState<string | null>(null);
  const [domainMessage, setDomainMessage] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{
    message: string;
    supportText: string | null;
  } | null>(null);
  const [domainsState, setDomainsState] =
    useState<RemoteState<DashboardCustomDomainListResponse>>(createInitialRemoteState);
  const [busyDomainAction, setBusyDomainAction] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFullName(user.fullName ?? "");
    setAvatarUrl(user.avatarUrl ?? "");
    setLocale(user.locale);
  }, [user.avatarUrl, user.fullName, user.id, user.locale]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    let isActive = true;

    setDomainsState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      errorRequestId: null,
      status: "loading"
    }));

    listDashboardCustomDomains(token, selectedWorkspaceId)
      .then((response) => {
        if (!isActive) {
          return;
        }

        setDomainsState({
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

        setDomainsState({
          data: null,
          errorMessage: toErrorMessage(error),
          errorRequestId: getErrorRequestId(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [selectedWorkspaceId, token]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorState(null);

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
        setMessage("Profile updated.");
      } catch (error) {
        setErrorState({
          message: toErrorMessage(error),
          supportText: getErrorSupportText(error)
        });
      }
    });
  }

  async function handleCreateDomain() {
    if (!selectedWorkspaceId) {
      return;
    }

    const trimmedDomain = domain.trim().toLowerCase();

    if (!trimmedDomain) {
      setErrorState({
        message: "Enter a domain before saving it.",
        supportText: null
      });
      return;
    }

    if (/^https?:\/\//i.test(trimmedDomain)) {
      setErrorState({
        message: "Enter only the hostname, for example go.example.com.",
        supportText: null
      });
      return;
    }

    setBusyDomainAction("create");
    setDomainMessage(null);
    setErrorState(null);

    try {
      await createDashboardCustomDomain(token, selectedWorkspaceId, {
        domain: trimmedDomain
      });
      setDomain("go.example.com");
      setDomainMessage("Custom domain saved. Complete verification to use it in short URLs.");
      const refreshed = await listDashboardCustomDomains(token, selectedWorkspaceId);
      setDomainsState({
        data: refreshed,
        errorMessage: null,
        errorRequestId: null,
        status: "ready"
      });
      refreshWorkspaces();
    } catch (error) {
      setErrorState({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error)
      });
    } finally {
      setBusyDomainAction(null);
    }
  }

  async function handleVerifyDomain(domainId: string, verificationToken: string) {
    if (!selectedWorkspaceId) {
      return;
    }

    setBusyDomainAction(`verify:${domainId}`);
    setDomainMessage(null);
    setErrorState(null);

    try {
      await verifyDashboardCustomDomain(token, selectedWorkspaceId, domainId, {
        verificationToken
      });
      setDomainMessage("Custom domain verified. New QR downloads now use the branded short host.");
      const refreshed = await listDashboardCustomDomains(token, selectedWorkspaceId);
      setDomainsState({
        data: refreshed,
        errorMessage: null,
        errorRequestId: null,
        status: "ready"
      });
      refreshWorkspaces();
    } catch (error) {
      setErrorState({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error)
      });
    } finally {
      setBusyDomainAction(null);
    }
  }

  async function handleDeleteDomain(domainId: string) {
    if (!selectedWorkspaceId) {
      return;
    }

    if (!window.confirm("Remove this custom domain from the workspace? Existing QR codes will fall back to the default short host.")) {
      return;
    }

    setBusyDomainAction(`delete:${domainId}`);
    setDomainMessage(null);
    setErrorState(null);

    try {
      await deleteDashboardCustomDomain(token, selectedWorkspaceId, domainId);
      setDomainMessage("Custom domain removed.");
      const refreshed = await listDashboardCustomDomains(token, selectedWorkspaceId);
      setDomainsState({
        data: refreshed,
        errorMessage: null,
        errorRequestId: null,
        status: "ready"
      });
      refreshWorkspaces();
    } catch (error) {
      setErrorState({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error)
      });
    } finally {
      setBusyDomainAction(null);
    }
  }

  if (workspacesState.status === "error") {
    return (
      <ErrorState
        body={workspacesState.errorMessage ?? "Workspace settings are unavailable."}
        supportText={
          workspacesState.errorRequestId
            ? `Support reference: ${workspacesState.errorRequestId}`
            : null
        }
        title="Could not load workspace settings"
      />
    );
  }

  return (
    <main className="stack-xl" data-testid="settings-view">
      <section className="card">
        <span className="badge">Account</span>
        <h1 className="h2">Profile & settings</h1>
        <p className="muted">
          Keep your profile details current and manage branded routing for every workspace.
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
          {errorState ? (
            <div className="callout danger">
              <div>{errorState.message}</div>
              {errorState.supportText ? <div className="muted">{errorState.supportText}</div> : null}
            </div>
          ) : null}

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
              <div className="muted">Default workspace</div>
              <div>{selectedWorkspace?.name ?? "Not set"}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="card stack-lg" data-testid="custom-domains-view">
        <div className="toolbar">
          <div>
            <span className="badge">Workspace routing</span>
            <h2 className="h2">Custom domains</h2>
            <p className="muted">
              Add a branded short host for a workspace and verify it before using it in QR links.
            </p>
          </div>
        </div>

        <div className="form-grid">
          <div>
            <label className="label" htmlFor="settings-workspace">
              Workspace
            </label>
            <select
              className="select"
              data-testid="settings-workspace"
              id="settings-workspace"
              onChange={(event) => chooseWorkspace(event.target.value)}
              value={selectedWorkspaceId}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="settings-domain">
              New custom domain
            </label>
            <input
              className="input"
              data-testid="custom-domain-input"
              id="settings-domain"
              onChange={(event) => setDomain(event.target.value)}
              placeholder="go.example.com"
              value={domain}
            />
            <button
              className="button secondary compact"
              data-testid="custom-domain-create"
              disabled={busyDomainAction === "create" || !selectedWorkspace}
              onClick={handleCreateDomain}
              type="button"
            >
              {busyDomainAction === "create" ? "Saving..." : "Add domain"}
            </button>
          </div>
        </div>

        {domainMessage ? <div className="callout success">{domainMessage}</div> : null}

        {domainsState.status === "error" ? (
          <ErrorState
            body={domainsState.errorMessage ?? "Could not load custom domains."}
            supportText={
              domainsState.errorRequestId
                ? `Support reference: ${domainsState.errorRequestId}`
                : null
            }
            title="Custom domains are unavailable"
          />
        ) : null}

        {domainsState.status === "loading" && !domainsState.data ? (
          <div className="callout">Loading custom domains for {selectedWorkspace?.name ?? "this workspace"}.</div>
        ) : null}

        {domainsState.status !== "error" && (domainsState.data?.items.length ?? 0) === 0 ? (
          <div className="callout">
            No custom domains are connected for {selectedWorkspace?.name ?? "this workspace"} yet.
          </div>
        ) : null}

        <div className="stack-md">
          {(domainsState.data?.items ?? []).map((customDomain) => (
            <div
              className="card compact-card stack-md"
              data-testid={`custom-domain-${customDomain.id}`}
              key={customDomain.id}
            >
              <div className="toolbar">
                <div>
                  <strong>{customDomain.domain}</strong>
                  <div className="muted">
                    Status: {customDomain.status}
                    {customDomain.certificateStatus ? ` | Certificate: ${customDomain.certificateStatus}` : ""}
                  </div>
                </div>
                <div className="table-actions">
                  {customDomain.status !== "verified" ? (
                    <button
                      className="button secondary compact"
                      data-testid={`custom-domain-verify-${customDomain.id}`}
                      disabled={busyDomainAction === `verify:${customDomain.id}`}
                      onClick={() =>
                        handleVerifyDomain(
                          customDomain.id,
                          customDomain.verificationToken
                        )
                      }
                      type="button"
                    >
                      {busyDomainAction === `verify:${customDomain.id}`
                        ? "Verifying..."
                        : "Verify"}
                    </button>
                  ) : null}
                  <button
                    className="button secondary compact"
                    data-testid={`custom-domain-delete-${customDomain.id}`}
                    disabled={busyDomainAction === `delete:${customDomain.id}`}
                    onClick={() => handleDeleteDomain(customDomain.id)}
                    type="button"
                  >
                    {busyDomainAction === `delete:${customDomain.id}`
                      ? "Removing..."
                      : "Remove"}
                  </button>
                </div>
              </div>

              <div className="key-value-grid">
                <div className="muted">Short host</div>
                <div className="mono">{customDomain.shortBaseUrl}</div>
                <div className="muted">CNAME target</div>
                <div className="mono">{customDomain.targetHost}</div>
                <div className="muted">TXT host</div>
                <div className="mono break-word">{customDomain.txtRecordHost}</div>
                <div className="muted">TXT value</div>
                <div className="mono break-word">{customDomain.txtRecordValue}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
