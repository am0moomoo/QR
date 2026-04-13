"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { type DashboardUser, updateDashboardUser } from "../../lib/dashboard-api";
import { normalizeFieldValue, toErrorMessage, writeStoredSession } from "./dashboard-utils";

export function SettingsView({
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
        setMessage("Profile updated.");
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
    });
  }

  return (
    <main className="stack-xl" data-testid="settings-view">
      <section className="card">
        <span className="badge">Account</span>
        <h1 className="h2">Profile & settings</h1>
        <p className="muted">
          Keep your name, avatar, and locale up to date for your dashboard account.
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
