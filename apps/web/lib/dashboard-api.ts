"use client";

export type DashboardUser = {
  avatarUrl: string | null;
  defaultWorkspaceId: string | null;
  email: string;
  fullName: string | null;
  id: string;
  locale: string;
};

export type DashboardAuthResponse = {
  accessToken: string;
  user: DashboardUser;
};

export type DashboardDownload = {
  bytes: string | null;
  checksum: string | null;
  format: "png" | "svg";
  url: string;
};

export type DashboardQrCode = {
  adsEnabled: boolean;
  content: Record<string, unknown> | null;
  createdAt: string;
  design: Record<string, unknown> | null;
  doNotIndex: boolean;
  downloads: DashboardDownload[];
  expiresAt: string | null;
  folderId: string | null;
  id: string;
  isOneTime: boolean;
  lastScanAt: string | null;
  maxScans: number | null;
  scansCount: string;
  shortUrl: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DELETED";
  title: string | null;
  type: string;
  updatedAt: string;
  workspaceId: string;
};

export type DashboardQrListResponse = {
  items: DashboardQrCode[];
  page: number;
  pageSize: number;
  total: number;
};

export type DashboardCreatedQrCode = {
  downloads: DashboardDownload[];
  id: string;
  shortUrl: string;
  slug: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "DELETED";
};

export type DashboardAnalyticsSummary = {
  scans: number;
  uniqueDevices: number;
  uniqueIps: number;
};

export type DashboardAnalyticsDailyPoint = {
  browsers: Record<string, number>;
  countries: Record<string, number>;
  day: string;
  devices: Record<string, number>;
  operatingSystems: Record<string, number>;
  scans: number;
  uniqueDevices: number;
  uniqueIps: number;
};

export type DashboardAnalyticsEvent = {
  browser: string | null;
  country: string | null;
  deviceType: string | null;
  language: string | null;
  openedOk: boolean | null;
  outcome: string;
  referrer: string | null;
  requestId: string | null;
  scannedAt: string;
};

export type DashboardAnalyticsResponse = {
  daily: DashboardAnalyticsDailyPoint[];
  recentEvents: DashboardAnalyticsEvent[];
  summary: DashboardAnalyticsSummary;
};

export type DashboardBillingPlan = {
  analyticsRetentionDays: number;
  apiAccess: boolean;
  code: "enterprise" | "free" | "lite" | "premium";
  displayName: string;
  features: {
    adsControl: boolean;
    apiAccess: boolean;
    invoiceHistory: boolean;
    prioritySupport: boolean;
    whiteLabel: boolean;
  };
  limits: {
    maxQrCodes: number;
    storageQuotaBytes: number;
  };
  monthlyPriceCents: number;
  priceId: string | null;
  summary: string;
  targetAudience: string;
};

export type DashboardBillingPlansResponse = {
  items: DashboardBillingPlan[];
  providerMode: "mock" | "stripe";
};

export type DashboardBillingSubscription = {
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  currentPeriodEnd: string | null;
  id: string;
  plan: "enterprise" | "free" | "lite" | "premium";
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  updatedAt: string;
};

export type DashboardBillingInvoice = {
  amountCents: number | null;
  createdAt: string;
  currency: string | null;
  id: string;
  issuedAt: string | null;
  status: string | null;
  stripeInvoiceId: string | null;
};

export type DashboardBillingSummary = {
  currentPlan: DashboardBillingPlan;
  invoices: DashboardBillingInvoice[];
  providerMode: "mock" | "stripe";
  quotas: {
    qrCodes: {
      limit: number;
      used: number;
    };
    storageBytes: {
      limit: number;
      used: number;
    };
  };
  subscription: DashboardBillingSubscription | null;
  workspace: {
    id: string;
    name: string;
    plan: "enterprise" | "free" | "lite" | "premium";
  };
};

export type DashboardCheckoutSession = {
  checkoutSessionId: string;
  providerMode: "mock" | "stripe";
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  targetPlan: "lite" | "premium";
  url: string;
  workspaceId: string;
};

type DashboardRequestOptions = {
  body?: unknown;
  headers?: HeadersInit;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  token?: string;
};

type DashboardListQuery = {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  workspaceId?: string;
};

type DashboardAnalyticsQuery = {
  from?: string;
  to?: string;
};

export class DashboardApiError extends Error {
  code: string | null;
  details: unknown;
  requestId: string | null;
  status: number;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    requestId?: string | null,
    code?: string | null
  ) {
    super(message);
    this.name = "DashboardApiError";
    this.code = code ?? null;
    this.status = status;
    this.details = details;
    this.requestId = requestId ?? null;
  }
}

export const dashboardSessionExpiredEvent = "qrflow:session-expired";

function normalizeBaseUrl(value: string) {
  const trimmed = value.replace(/\/$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

export function getDashboardApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  }

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(
      `${window.location.protocol}//${window.location.hostname}:4000`
    );
  }

  return normalizeBaseUrl(process.env.API_URL ?? "http://localhost:4000");
}

async function parseError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const requestId = response.headers.get("x-request-id");

  if (contentType.includes("application/json")) {
    const json = (await response.json()) as {
      code?: string;
      error?: string;
      message?: string | string[];
      requestId?: string;
    };
    const message = Array.isArray(json.message)
      ? json.message.join(", ")
      : json.message ?? json.error ?? "Request failed";
    return {
      code: json.code ?? null,
      details: json,
      message,
      requestId: json.requestId ?? requestId
    };
  }

  const text = await response.text();
  return {
    code: null,
    details: text,
    message: text || "Request failed",
    requestId
  };
}

function dispatchSessionExpired(requestId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(dashboardSessionExpiredEvent, {
      detail: {
        requestId
      }
    })
  );
}

async function dashboardRequest<T>(
  path: string,
  { body, headers, method = "GET", token }: DashboardRequestOptions = {}
) {
  const requestHeaders = new Headers(headers);

  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getDashboardApiBaseUrl()}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: requestHeaders,
    method
  });

  if (!response.ok) {
    const error = await parseError(response);
    if (response.status === 401 && token) {
      dispatchSessionExpired(error.requestId ?? null);
    }

    throw new DashboardApiError(
      error.message,
      response.status,
      error.details,
      error.requestId,
      error.code
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function registerDashboardUser(payload: {
  email: string;
  fullName: string | null;
  password: string;
}) {
  return dashboardRequest<DashboardAuthResponse>("/auth/register", {
    body: payload,
    method: "POST"
  });
}

export async function loginDashboardUser(payload: {
  email: string;
  password: string;
}) {
  return dashboardRequest<DashboardAuthResponse>("/auth/login", {
    body: payload,
    method: "POST"
  });
}

export async function logoutDashboardUser(token: string) {
  return dashboardRequest<{ success: boolean }>("/auth/logout", {
    method: "POST",
    token
  });
}

export async function fetchDashboardUser(token: string) {
  return dashboardRequest<DashboardUser>("/me", { token });
}

export async function updateDashboardUser(
  token: string,
  payload: Partial<Pick<DashboardUser, "avatarUrl" | "fullName" | "locale">>
) {
  return dashboardRequest<DashboardUser>("/me", {
    body: payload,
    method: "PATCH",
    token
  });
}

export async function listDashboardQrCodes(
  token: string,
  query: DashboardListQuery = {}
) {
  const searchParams = new URLSearchParams();

  if (query.page) {
    searchParams.set("page", String(query.page));
  }
  if (query.pageSize) {
    searchParams.set("pageSize", String(query.pageSize));
  }
  if (query.status) {
    searchParams.set("status", query.status);
  }
  if (query.type) {
    searchParams.set("type", query.type);
  }
  if (query.workspaceId) {
    searchParams.set("workspaceId", query.workspaceId);
  }

  const queryString = searchParams.toString();
  return dashboardRequest<DashboardQrListResponse>(
    `/qr-codes${queryString ? `?${queryString}` : ""}`,
    { token }
  );
}

export async function getDashboardQrCode(token: string, qrId: string) {
  return dashboardRequest<DashboardQrCode>(`/qr-codes/${qrId}`, { token });
}

export async function createDashboardQrCode(
  token: string,
  payload: {
    content: {
      link: string;
    };
    design: {
      backgroundColor: string;
      cornersInner: string;
      cornersInnerColor: string;
      cornersOuter: string;
      cornersOuterColor: string;
      errorCorrection: "L" | "M" | "Q" | "H";
      logoAssetId: string | null;
      logoHideBg: boolean;
      pattern: string;
      patternColor: string;
      quietZoneModules: number;
      sizePx: number;
    };
    exports: Array<"png" | "svg">;
    settings: {
      adsEnabled: boolean;
      doNotIndex: boolean;
      expiresAt: string | null;
      isOneTime: boolean;
      maxScans: number | null;
      password: string | null;
    };
    title: string | null;
    type: "link";
    workspaceId: string;
  }
) {
  return dashboardRequest<DashboardCreatedQrCode>("/qr-codes", {
    body: payload,
    method: "POST",
    token
  });
}

export async function getDashboardQrAnalytics(
  token: string,
  qrId: string,
  query: DashboardAnalyticsQuery = {}
) {
  const searchParams = new URLSearchParams();

  if (query.from) {
    searchParams.set("from", query.from);
  }
  if (query.to) {
    searchParams.set("to", query.to);
  }

  const queryString = searchParams.toString();
  return dashboardRequest<DashboardAnalyticsResponse>(
    `/qr-codes/${qrId}/analytics${queryString ? `?${queryString}` : ""}`,
    { token }
  );
}

export async function listDashboardBillingPlans() {
  return dashboardRequest<DashboardBillingPlansResponse>("/billing/plans");
}

export async function getDashboardBillingSummary(
  token: string,
  workspaceId?: string
) {
  const searchParams = new URLSearchParams();

  if (workspaceId) {
    searchParams.set("workspaceId", workspaceId);
  }

  const queryString = searchParams.toString();
  return dashboardRequest<DashboardBillingSummary>(
    `/billing/summary${queryString ? `?${queryString}` : ""}`,
    { token }
  );
}

export async function createDashboardCheckoutSession(
  token: string,
  payload: {
    cancelUrl?: string;
    successUrl?: string;
    targetPlan: "lite" | "premium";
    workspaceId: string;
  }
) {
  return dashboardRequest<DashboardCheckoutSession>("/billing/checkout-session", {
    body: payload,
    method: "POST",
    token
  });
}

export async function cancelDashboardSubscription(
  token: string,
  payload: {
    workspaceId: string;
  }
) {
  return dashboardRequest<{
    canceled: boolean;
    currentPlan: string;
    mode: "mock" | "stripe";
    scheduled: boolean;
  }>("/billing/cancel-subscription", {
    body: payload,
    method: "POST",
    token
  });
}

export async function postDashboardQrAction(
  token: string,
  qrId: string,
  action: "activate" | "archive" | "deactivate" | "render"
) {
  return dashboardRequest<
    DashboardQrCode | { accepted: boolean; downloads: DashboardDownload[] }
  >(`/qr-codes/${qrId}/${action}`, {
    method: "POST",
    token
  });
}

export async function duplicateDashboardQrCode(token: string, qrId: string) {
  return dashboardRequest<DashboardCreatedQrCode>(`/qr-codes/${qrId}/duplicate`, {
    method: "POST",
    token
  });
}

export async function deleteDashboardQrCode(token: string, qrId: string) {
  return dashboardRequest<{ success: boolean }>(`/qr-codes/${qrId}`, {
    method: "DELETE",
    token
  });
}

export async function downloadDashboardQrAsset(
  token: string,
  qrId: string,
  format: "png" | "svg"
) {
  const response = await fetch(
    `${getDashboardApiBaseUrl()}/qr-codes/${qrId}/downloads?format=${format}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    const error = await parseError(response);
    if (response.status === 401 && token) {
      dispatchSessionExpired(error.requestId ?? null);
    }

    throw new DashboardApiError(
      error.message,
      response.status,
      error.details,
      error.requestId,
      error.code
    );
  }

  return {
    blob: await response.blob(),
    contentType: response.headers.get("content-type") ?? "",
    fileName:
      response.headers
        .get("content-disposition")
        ?.match(/filename="([^"]+)"/)?.[1] ?? `qr-code.${format}`
  };
}
