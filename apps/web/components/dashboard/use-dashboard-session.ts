"use client";

import { useEffect, useState, useTransition } from "react";
import { fetchDashboardUser, logoutDashboardUser } from "../../lib/dashboard-api";
import type { DashboardUser } from "../../lib/dashboard-api";
import type { SessionState, StoredSession } from "./dashboard-types";
import {
  clearStoredSession,
  readStoredSession,
  replaceStoredUser,
  toErrorMessage
} from "./dashboard-utils";

export function useDashboardSession() {
  const [sessionState, setSessionState] = useState<SessionState>({
    errorMessage: null,
    status: "booting",
    token: null,
    user: null
  });
  const [isLoggingOut, startLogoutTransition] = useTransition();

  useEffect(() => {
    let isActive = true;
    const storedSession = readStoredSession();

    if (!storedSession?.accessToken) {
      setSessionState({
        errorMessage: null,
        status: "unauthenticated",
        token: null,
        user: null
      });
      return;
    }

    fetchDashboardUser(storedSession.accessToken)
      .then((user) => {
        if (!isActive) {
          return;
        }

        replaceStoredUser(storedSession, user);
        setSessionState({
          errorMessage: null,
          status: "ready",
          token: storedSession.accessToken,
          user
        });
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        clearStoredSession();
        setSessionState({
          errorMessage: toErrorMessage(error),
          status: "unauthenticated",
          token: null,
          user: null
        });
      });

    return () => {
      isActive = false;
    };
  }, []);

  function handleAuthenticated(session: StoredSession) {
    setSessionState({
      errorMessage: null,
      status: "ready",
      token: session.accessToken,
      user: session.user
    });
  }

  function handleUserUpdated(user: DashboardUser) {
    setSessionState((currentState) =>
      currentState.status === "ready"
        ? {
            ...currentState,
            user
          }
        : currentState
    );
  }

  function handleLogout() {
    if (sessionState.status !== "ready") {
      return;
    }

    startLogoutTransition(async () => {
      try {
        await logoutDashboardUser(sessionState.token);
      } catch {
        // Local logout should still clear stale session material.
      }

      clearStoredSession();
      setSessionState({
        errorMessage: null,
        status: "unauthenticated",
        token: null,
        user: null
      });
    });
  }

  return {
    handleAuthenticated,
    handleLogout,
    handleUserUpdated,
    isLoggingOut,
    sessionState
  };
}
