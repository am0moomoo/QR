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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail) {
      setFormError("Enter your email address to continue.");
      return;
    }

    if (!normalizedPassword) {
      setFormError("Enter your password to continue.");
      return;
    }

    if (mode === "register" && normalizedPassword.length < 8) {
      setFormError("Create a password with at least 8 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const response =
          mode === "login"
            ? await loginDashboardUser({
                email: normalizedEmail,
                password: normalizedPassword
              })
            : await registerDashboardUser({
                email: normalizedEmail,
                fullName: normalizeFieldValue(fullName),
                password: normalizedPassword
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
        <span className="badge">Account access</span>
        <h1 className="h2">
          {mode === "login" ? "Sign in to QRFlow" : "Create your QRFlow account"}
        </h1>
        <p className="muted">
          {mode === "login"
            ? "Access your QR inventory, downloads, analytics, billing, and workspace settings."
            : "Create an account to manage QR codes, custom domains, imports, analytics, and billing from one dashboard."}
        </p>

        <div className="dashboard-toggle">
          <button
            className={mode === "login" ? "button" : "button secondary"}
            data-testid="dashboard-auth-mode-login"
            onClick={() => {
              setFormError(null);
              setMode("login");
            }}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "register" ? "button" : "button secondary"}
            data-testid="dashboard-auth-mode-register"
            onClick={() => {
              setFormError(null);
              setMode("register");
            }}
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
                autoComplete="name"
                className="input"
                id="dashboard-full-name"
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Alex Example"
                value={fullName}
              />
              <div className="muted">Optional. This name appears in the dashboard sidebar.</div>
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
              autoComplete={mode === "login" ? "email" : "username"}
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
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {errorMessage || formError ? (
            <div className="callout danger">{formError ?? errorMessage}</div>
          ) : null}

          <div className="callout">
            We keep your session on this device so you can return to the dashboard without signing in on every refresh.
          </div>

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
