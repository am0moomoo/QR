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
      {action}
    </section>
  );
}
