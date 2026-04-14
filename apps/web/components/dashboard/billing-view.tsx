"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  cancelDashboardSubscription,
  createDashboardCheckoutSession,
  getDashboardBillingSummary,
  listDashboardBillingPlans,
  type DashboardBillingPlan,
  type DashboardBillingPlansResponse,
  type DashboardBillingSummary,
  type DashboardUser
} from "../../lib/dashboard-api";
import { ErrorState, LoadingState } from "./dashboard-state";
import type { RemoteState } from "./dashboard-types";
import {
  createInitialRemoteState,
  formatBytesNumber,
  formatCurrencyCents,
  getErrorRequestId,
  getErrorSupportText,
  toErrorMessage
} from "./dashboard-utils";
import { useWorkspaceSelection } from "./use-workspace-selection";

export function BillingView({
  checkoutCanceled,
  checkoutSessionId,
  token,
  user
}: {
  checkoutCanceled?: boolean;
  checkoutSessionId?: string | null;
  token: string;
  user: DashboardUser;
}) {
  const {
    chooseWorkspace,
    selectedWorkspace,
    selectedWorkspaceId,
    workspaces,
    workspacesState
  } = useWorkspaceSelection({
    defaultWorkspaceId: user.defaultWorkspaceId ?? null,
    token
  });
  const [plansState, setPlansState] =
    useState<RemoteState<DashboardBillingPlansResponse>>(createInitialRemoteState);
  const [summaryState, setSummaryState] =
    useState<RemoteState<DashboardBillingSummary>>(createInitialRemoteState);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [actionError, setActionError] = useState<{
    message: string;
    supportText: string | null;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    setActionError(null);

    listDashboardBillingPlans()
      .then((response) => {
        if (!isActive) {
          return;
        }

        setPlansState({
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

        setPlansState({
          data: null,
          errorMessage: toErrorMessage(error),
          errorRequestId: getErrorRequestId(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [reloadNonce]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setSummaryState({
        data: null,
        errorMessage: "Choose a workspace before opening billing.",
        errorRequestId: null,
        status: "error"
      });
      return;
    }

    let isActive = true;

    setSummaryState((currentState) => ({
      data: currentState.data,
      errorMessage: null,
      errorRequestId: null,
      status: "loading"
    }));

    getDashboardBillingSummary(token, selectedWorkspaceId)
      .then((response) => {
        if (!isActive) {
          return;
        }

        setSummaryState({
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

        setSummaryState({
          data: null,
          errorMessage: toErrorMessage(error),
          errorRequestId: getErrorRequestId(error),
          status: "error"
        });
      });

    return () => {
      isActive = false;
    };
  }, [reloadNonce, selectedWorkspaceId, token]);

  useEffect(() => {
    if (!checkoutSessionId || !selectedWorkspaceId) {
      return;
    }

    let attempt = 0;
    let timeoutId: number | undefined;

    const queueRefresh = () => {
      if (attempt >= 5) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        attempt += 1;
        setReloadNonce((value) => value + 1);
        queueRefresh();
      }, 2_000);
    };

    queueRefresh();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [checkoutSessionId, selectedWorkspaceId]);

  async function handlePlanSelection(plan: DashboardBillingPlan) {
    if (!selectedWorkspaceId) {
      return;
    }

    const actionKey = `plan-${plan.code}`;
    setBusyAction(actionKey);
    setActionError(null);
    setActionMessage(null);

    try {
      if (plan.code === "free") {
        const result = await cancelDashboardSubscription(token, {
          workspaceId: selectedWorkspaceId
        });
        setActionMessage(
          result.scheduled
            ? "Your paid subscription will end at the close of the current billing period."
            : "The workspace is now back on the Free plan."
        );
        setReloadNonce((value) => value + 1);
        return;
      }

      if (plan.code !== "lite" && plan.code !== "premium") {
        setActionError({
          message: "This plan cannot be selected from the self-serve billing flow.",
          supportText: null
        });
        return;
      }

      const session = await createDashboardCheckoutSession(token, {
        cancelUrl: `${window.location.origin}/dashboard/billing?checkout_canceled=1`,
        successUrl: `${window.location.origin}/dashboard/billing?checkout_session_id={CHECKOUT_SESSION_ID}`,
        targetPlan: plan.code,
        workspaceId: selectedWorkspaceId
      });

      window.location.assign(session.url);
    } catch (error) {
      setActionError({
        message: toErrorMessage(error),
        supportText: getErrorSupportText(error)
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (
    (plansState.status === "loading" && !plansState.data) ||
    (summaryState.status === "loading" && !summaryState.data) ||
    (workspacesState.status === "loading" && !workspacesState.data)
  ) {
    return (
      <LoadingState
        body="Loading plans, quota usage, and subscription history for your workspace."
        title="Loading billing"
      />
    );
  }

  if (plansState.status === "error") {
    return (
      <ErrorState
        body={plansState.errorMessage ?? "Billing plans could not be loaded."}
        onRetry={() => setReloadNonce((value) => value + 1)}
        supportText={
          plansState.errorRequestId
            ? `Support reference: ${plansState.errorRequestId}`
            : null
        }
        title="Could not load billing"
      />
    );
  }

  if (workspacesState.status === "error") {
    return (
      <ErrorState
        body={workspacesState.errorMessage ?? "Workspaces could not be loaded."}
        onRetry={() => window.location.reload()}
        supportText={
          workspacesState.errorRequestId
            ? `Support reference: ${workspacesState.errorRequestId}`
            : null
        }
        title="Could not load billing"
      />
    );
  }

  if (summaryState.status === "error" || !summaryState.data || !plansState.data) {
    return (
      <ErrorState
        body={summaryState.errorMessage ?? "Billing summary could not be loaded."}
        onRetry={() => setReloadNonce((value) => value + 1)}
        supportText={
          summaryState.errorRequestId
            ? `Support reference: ${summaryState.errorRequestId}`
            : null
        }
        title="Could not load billing"
      />
    );
  }

  const summary = summaryState.data;
  const currentPlan = summary.currentPlan.code;

  return (
    <main className="stack-xl" data-testid="billing-view">
      <section className="card">
        <div className="toolbar">
          <div>
            <span className="badge">Billing</span>
            <h1 className="h2">Plan & billing</h1>
            <p className="muted">
              Review the current plan, track usage, and move between Free, Lite, and Premium without leaving the product.
            </p>
          </div>
          <div className="stack-sm" style={{ minWidth: 220 }}>
            <label className="muted" htmlFor="billing-workspace">
              Workspace
            </label>
            <select
              className="input"
              data-testid="billing-workspace"
              id="billing-workspace"
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
          <button
            className="button secondary"
            data-testid="billing-refresh"
            onClick={() => setReloadNonce((value) => value + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>

        {checkoutSessionId ? (
          <div className="callout success" data-testid="billing-checkout-return">
            Checkout returned to the dashboard. We are checking for webhook confirmation and will refresh plan data automatically.
          </div>
        ) : null}
        {checkoutCanceled ? (
          <div className="callout">Checkout was canceled before completion.</div>
        ) : null}
        {summary.providerMode === "mock" ? (
          <div className="callout">
            Billing is running in deterministic test mode. Checkout and webhooks stay inside the local product flow.
          </div>
        ) : null}
        {selectedWorkspace ? (
          <div className="callout">
            Viewing quota usage and billing history for <strong>{selectedWorkspace.name}</strong>.
          </div>
        ) : null}
        {summaryState.status === "loading" && summaryState.data ? (
          <div className="callout">Refreshing plan usage and invoice history.</div>
        ) : null}
        {actionMessage ? <div className="callout success">{actionMessage}</div> : null}
        {actionError ? (
          <div className="callout danger">
            <div>{actionError.message}</div>
            {actionError.supportText ? <div className="muted">{actionError.supportText}</div> : null}
            <div className="table-actions" style={{ marginTop: 10 }}>
              <Link className="button secondary compact" href={"/dashboard/settings" as Route}>
                Review account details
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <section className="stats-grid" data-testid="billing-summary">
        <div className="card compact-card">
          <div className="muted">Current plan</div>
          <div className="h2">{summary.currentPlan.displayName}</div>
          <div className="muted">{summary.currentPlan.summary}</div>
        </div>
        <div className="card compact-card">
          <div className="muted">QR codes used</div>
          <div className="h2">
            {summary.quotas.qrCodes.used} / {summary.quotas.qrCodes.limit}
          </div>
        </div>
        <div className="card compact-card">
          <div className="muted">Storage used</div>
          <div className="h2">
            {formatBytesNumber(summary.quotas.storageBytes.used)}
          </div>
          <div className="muted">
            of {formatBytesNumber(summary.quotas.storageBytes.limit)}
          </div>
        </div>
        <div className="card compact-card">
          <div className="muted">Subscription status</div>
          <div className="h2">
            {summary.subscription?.status ?? "free"}
          </div>
          <div className="muted">
            {summary.subscription?.currentPeriodEnd
              ? `Period ends ${new Date(summary.subscription.currentPeriodEnd).toLocaleDateString("en")}`
              : "No paid subscription yet"}
          </div>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {plansState.data.items.map((plan) => {
          const isCurrent = currentPlan === plan.code;
          const actionKey = `plan-${plan.code}`;

          return (
            <article className="card stack-lg" data-testid={`billing-plan-${plan.code}`} key={plan.code}>
              <div className="stack-sm">
                <span className="badge">{plan.displayName}</span>
                <h2 className="h2">{formatCurrencyCents(plan.monthlyPriceCents)}</h2>
                <p className="muted">{plan.summary}</p>
              </div>

              <div className="key-value-grid">
                <div className="muted">QR code limit</div>
                <div>{plan.limits.maxQrCodes}</div>
                <div className="muted">Storage quota</div>
                <div>{formatBytesNumber(plan.limits.storageQuotaBytes)}</div>
                <div className="muted">Ads control</div>
                <div>{plan.features.adsControl ? "Included" : "Not included"}</div>
                <div className="muted">API access</div>
                <div>{plan.features.apiAccess ? "Included" : "Not included"}</div>
              </div>

              <button
                className={isCurrent ? "button secondary" : "button"}
                data-testid={`billing-select-${plan.code}`}
                disabled={isCurrent || busyAction === actionKey || plan.code === "enterprise"}
                onClick={() => handlePlanSelection(plan)}
                type="button"
              >
                {isCurrent
                  ? "Current plan"
                  : busyAction === actionKey
                    ? "Opening..."
                    : plan.code === "free"
                      ? "Switch to Free"
                      : `Choose ${plan.displayName}`}
              </button>
            </article>
          );
        })}
      </section>

      <section className="dashboard-split">
        <div className="card stack-lg">
          <div>
            <h2 className="h2">Current subscription</h2>
            {summary.subscription ? (
              <div className="key-value-grid">
                <div className="muted">Plan</div>
                <div>{summary.subscription.plan}</div>
                <div className="muted">Status</div>
                <div>{summary.subscription.status}</div>
                <div className="muted">Cancel at period end</div>
                <div>{summary.subscription.cancelAtPeriodEnd ? "Yes" : "No"}</div>
                <div className="muted">Stripe subscription</div>
                <div className="mono break-word">
                  {summary.subscription.stripeSubscriptionId ?? "Not synced yet"}
                </div>
              </div>
            ) : (
              <div className="callout">The workspace is currently on the Free plan.</div>
            )}
          </div>
        </div>

        <div className="card stack-lg">
          <div>
            <h2 className="h2">Invoice history</h2>
            {summary.invoices.length === 0 ? (
              <div className="callout">
                No invoices have been synced yet for this workspace.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table" data-testid="billing-invoices-table">
                  <thead>
                    <tr>
                      <th>Issued</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{new Date(invoice.issuedAt ?? invoice.createdAt).toLocaleDateString("en")}</td>
                        <td>{invoice.status ?? "unknown"}</td>
                        <td>
                          {invoice.amountCents !== null
                            ? formatCurrencyCents(invoice.amountCents)
                            : "Unknown"}
                        </td>
                        <td className="mono">
                          {invoice.stripeInvoiceId ?? "Not synced yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
