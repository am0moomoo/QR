"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DashboardApiError,
  dashboardSessionExpiredEvent,
  fetchDashboardUser,
  logoutDashboardUser
} from "../../lib/dashboard-api";
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
          errorMessage:
            error instanceof DashboardApiError && error.status === 401
              ? "Your session has ended. Sign in again to continue."
              : toErrorMessage(error),
          status: "unauthenticated",
          token: null,
          user: null
        });
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    function handleSessionExpired(event: Event) {
      const customEvent = event as CustomEvent<{ requestId?: string | null }>;
      const requestId = customEvent.detail?.requestId;

      clearStoredSession();
      setSessionState({
        errorMessage: requestId
          ? `Your session ended. Sign in again to continue. Reference: ${requestId}`
          : "Your session ended. Sign in again to continue.",
        status: "unauthenticated",
        token: null,
        user: null
      });
    }

    window.addEventListener(
      dashboardSessionExpiredEvent,
      handleSessionExpired as EventListener
    );

    return () => {
      window.removeEventListener(
        dashboardSessionExpiredEvent,
        handleSessionExpired as EventListener
      );
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
