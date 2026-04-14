import type { ReactNode } from "react";

export function LoadingState({
  body,
  title
}: {
  body: string;
  title: string;
}) {
  return (
    <section className="card state-card">
      <span className="badge">Loading</span>
      <h1 className="h2">{title}</h1>
      <p className="muted">{body}</p>
    </section>
  );
}

export function ErrorState({
  actionLabel,
  actions,
  body,
  onRetry,
  supportText,
  title
}: {
  actionLabel?: string;
  actions?: ReactNode;
  body: string;
  onRetry?: () => void;
  supportText?: string | null;
  title: string;
}) {
  return (
    <section className="card state-card">
      <span className="badge">Error</span>
      <h1 className="h2">{title}</h1>
      <p className="muted">{body}</p>
      {supportText ? <p className="muted">{supportText}</p> : null}
      {onRetry || actions ? (
        <div className="table-actions">
          {onRetry ? (
            <button className="button" onClick={onRetry} type="button">
              {actionLabel ?? "Retry"}
            </button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </section>
  );
}

export function EmptyState({
  action,
  body,
  title
}: {
  action?: ReactNode;
  body: string;
  title: string;
}) {
  return (
    <section className="card state-card">
      <span className="badge">Empty</span>
      <h1 className="h2">{title}</h1>
      <p className="muted">{body}</p>
      {action ? <div className="table-actions">{action}</div> : null}
    </section>
  );
}
