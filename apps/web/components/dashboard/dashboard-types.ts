import type { DashboardUser } from "../../lib/dashboard-api";

export type DashboardSection = "analytics" | "billing" | "details" | "list" | "settings";

export type DashboardShellProps = {
  checkoutCanceled?: boolean;
  checkoutSessionId?: string | null;
  initialAnalyticsQrId?: string | null;
  qrId?: string;
  section: DashboardSection;
};

export type StoredSession = {
  accessToken: string;
  user: DashboardUser;
};

export type SessionState =
  | {
      errorMessage: string | null;
      status: "booting" | "unauthenticated";
      token: null;
      user: null;
    }
  | {
      errorMessage: string | null;
      status: "ready";
      token: string;
      user: DashboardUser;
    };

export type RemoteState<T> = {
  data: T | null;
  errorMessage: string | null;
  status: "error" | "loading" | "ready";
};

export const authStorageKey = "qrflow.dashboard.session";

export const qrSortOptions = [
  { label: "Recently updated", value: "updated-desc" },
  { label: "Most scans", value: "scans-desc" },
  { label: "Last scan", value: "last-scan-desc" },
  { label: "Title A-Z", value: "title-asc" }
] as const;

export type QrSortValue = (typeof qrSortOptions)[number]["value"];
