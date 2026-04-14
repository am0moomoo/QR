import {
  type DashboardAnalyticsDailyPoint,
  type DashboardQrCode,
  type DashboardUser,
  DashboardApiError
} from "../../lib/dashboard-api";
import {
  type QrSortValue,
  type RemoteState,
  type StoredSession,
  authStorageKey
} from "./dashboard-types";

export function readStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(authStorageKey);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredSession;
  } catch {
    window.localStorage.removeItem(authStorageKey);
    return null;
  }
}

export function writeStoredSession(session: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(authStorageKey, JSON.stringify(session));
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(authStorageKey);
}

export function toErrorMessage(error: unknown) {
  if (error instanceof DashboardApiError || error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while talking to the API.";
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

export function formatNumber(value: number | string) {
  return new Intl.NumberFormat("en").format(Number(value));
}

export function formatBytes(value: string | null) {
  if (!value) {
    return "Unknown size";
  }

  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatBytesNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCurrencyCents(value: number) {
  if (value <= 0) {
    return "Free";
  }

  return new Intl.NumberFormat("en", {
    currency: "USD",
    style: "currency"
  }).format(value / 100);
}

export function normalizeFieldValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function createInitialRemoteState<T>(): RemoteState<T> {
  return {
    data: null,
    errorMessage: null,
    status: "loading"
  };
}

export function getDefaultRange(days: number) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - (days - 1));

  return {
    from: start.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10)
  };
}

export function getQrDisplayName(qrCode: DashboardQrCode) {
  return qrCode.title?.trim() || qrCode.slug;
}

export function getQrLinkTarget(qrCode: DashboardQrCode) {
  const link = qrCode.content?.link;
  return typeof link === "string" ? link : null;
}

export function formatBooleanLabel(value: boolean) {
  return value ? "Enabled" : "Disabled";
}

export function getStatusTone(status: DashboardQrCode["status"]) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "INACTIVE":
      return "warning";
    case "ARCHIVED":
      return "neutral";
    case "DELETED":
      return "danger";
    default:
      return "neutral";
  }
}

export function getStatusLabel(status: DashboardQrCode["status"]) {
  return status.toLowerCase().replace(/_/g, " ");
}

export function sortQrCodes(items: DashboardQrCode[], sortValue: QrSortValue) {
  return [...items].sort((left, right) => {
    if (sortValue === "title-asc") {
      return getQrDisplayName(left).localeCompare(getQrDisplayName(right));
    }

    if (sortValue === "scans-desc") {
      return Number(right.scansCount) - Number(left.scansCount);
    }

    if (sortValue === "last-scan-desc") {
      return (
        new Date(right.lastScanAt ?? 0).getTime() -
        new Date(left.lastScanAt ?? 0).getTime()
      );
    }

    return (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  });
}

export function matchesSearch(qrCode: DashboardQrCode, search: string) {
  if (!search) {
    return true;
  }

  const haystack = [qrCode.title, qrCode.slug, qrCode.shortUrl, qrCode.type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

export function sumByKey(
  points: DashboardAnalyticsDailyPoint[],
  key: "browsers" | "countries" | "devices" | "operatingSystems"
) {
  const result: Record<string, number> = {};

  for (const point of points) {
    const values = point[key];

    for (const [entryKey, entryValue] of Object.entries(values)) {
      result[entryKey] = (result[entryKey] ?? 0) + entryValue;
    }
  }

  return Object.entries(result).sort((left, right) => right[1] - left[1]);
}

export function replaceStoredUser(session: StoredSession, user: DashboardUser) {
  writeStoredSession({
    accessToken: session.accessToken,
    user
  });
}

export function startFileDownload(file: { blob: Blob; fileName: string }) {
  const objectUrl = window.URL.createObjectURL(file.blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(objectUrl);
}
