"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  loginDashboardUser,
  registerDashboardUser
} from "../../lib/dashboard-api";
import type { StoredSession } from "./dashboard-types";
import { normalizeFieldValue, toErrorMessage, writeStoredSession } from "./dashboard-utils";

export function DashboardAuthPanel({
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
        <span className="badge">QRFlow</span>
        <h1 className="h2">Sign in to your dashboard</h1>
        <p className="muted">
          Access your QR codes, downloads, scan analytics, and profile settings.
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
            Create account
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
