import { randomUUID } from "node:crypto";

const apiUrl = (process.env.API_URL ?? "").replace(/\/$/, "");
const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
const apiBaseUrl = `${apiUrl}/api/v1`;
const expectStorageRedirect =
  process.env.STAGING_SMOKE_EXPECT_STORAGE_REDIRECT === "true";
const verifyResetPassword =
  process.env.STAGING_SMOKE_VERIFY_RESET_PASSWORD === "true";
const pollTimeoutMs = Number(process.env.STAGING_SMOKE_POLL_TIMEOUT_MS ?? "45000");
const workspaceId = process.env.STAGING_SMOKE_WORKSPACE_ID?.trim();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readBody(response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    method: options.method ?? "GET",
    redirect: options.redirect ?? "follow"
  });

  if (!response.ok) {
    throw new Error(
      `API request failed for ${path}: ${response.status} ${await response.text()}`
    );
  }

  return readBody(response);
}

async function waitForAnalytics(qrCodeId, token) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < pollTimeoutMs) {
    const analytics = await apiRequest(`/qr-codes/${qrCodeId}/analytics`, {
      token
    });

    if (
      Number(analytics.summary?.scans ?? 0) >= 1 &&
      Array.isArray(analytics.daily) &&
      analytics.daily.length >= 1
    ) {
      return analytics;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Timed out waiting for analytics to reflect a scan for QR ${qrCodeId}.`
  );
}

async function verifyDownload(url, token, expectedContentType) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    redirect: "manual"
  });

  if (expectStorageRedirect) {
    assert(
      [302, 303, 307, 308].includes(response.status),
      `Expected signed redirect for ${url}, got HTTP ${response.status}.`
    );

    const redirectUrl = response.headers.get("location");
    assert(redirectUrl, `Missing signed redirect URL for ${url}.`);

    const redirectedResponse = await fetch(redirectUrl);
    assert(
      redirectedResponse.ok,
      `Signed download failed for ${url}: ${redirectedResponse.status}`
    );
    assert(
      (redirectedResponse.headers.get("content-type") ?? "").includes(
        expectedContentType
      ),
      `Unexpected signed download content type for ${url}.`
    );
    assert(
      (await redirectedResponse.arrayBuffer()).byteLength > 0,
      `Signed download body was empty for ${url}.`
    );

    return {
      mode: "signed-redirect",
      redirectUrl
    };
  }

  assert(response.ok, `Download failed for ${url}: ${response.status}`);
  assert(
    (response.headers.get("content-type") ?? "").includes(expectedContentType),
    `Unexpected content type for ${url}.`
  );
  assert(
    (await response.arrayBuffer()).byteLength > 0,
    `Download body was empty for ${url}.`
  );

  return {
    mode: "direct-stream"
  };
}

async function verifyWeb() {
  if (!appUrl) {
    return {
      checked: false
    };
  }

  const response = await fetch(`${appUrl}/dashboard`, {
    redirect: "follow"
  });

  assert(response.ok, `Dashboard page is unavailable: ${response.status}`);
  assert(
    (await response.text()).includes("<html"),
    "Dashboard response did not look like HTML."
  );

  return {
    checked: true
  };
}

async function main() {
  assert(apiUrl, "API_URL must be provided.");
  assert(
    workspaceId,
    "STAGING_SMOKE_WORKSPACE_ID must be provided because the MVP API does not expose workspace listing yet."
  );

  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `staging-${suffix}@example.com`;
  const password = "StrongPass123!";
  const updatedName = `Staging User ${suffix}`;
  const web = await verifyWeb();
  const health = await apiRequest("/health");

  const registration = await apiRequest("/auth/register", {
    body: {
      email,
      fullName: "Staging Smoke Owner",
      password
    },
    method: "POST"
  });

  const login = await apiRequest("/auth/login", {
    body: {
      email,
      password
    },
    method: "POST"
  });

  const me = await apiRequest("/me", {
    token: login.accessToken
  });

  const qr = await apiRequest("/qr-codes", {
    body: {
      content: {
        link: "https://example.com/staging-smoke"
      },
      design: {
        backgroundColor: "#ffffff",
        cornersInner: "square",
        cornersInnerColor: "#111111",
        cornersOuter: "square",
        cornersOuterColor: "#111111",
        errorCorrection: "M",
        logoAssetId: null,
        logoHideBg: true,
        pattern: "square",
        patternColor: "#111111",
        quietZoneModules: 4,
        sizePx: 512
      },
      exports: ["png", "svg"],
      settings: {
        adsEnabled: true,
        doNotIndex: false,
        expiresAt: null,
        isOneTime: false,
        maxScans: null,
        password: null
      },
      title: `Staging smoke ${suffix}`,
      type: "link",
      workspaceId
    },
    method: "POST",
    token: login.accessToken
  });

  const render = await apiRequest(`/qr-codes/${qr.id}/render`, {
    method: "POST",
    token: login.accessToken
  });

  const downloads = await apiRequest(`/qr-codes/${qr.id}/downloads`, {
    token: login.accessToken
  });
  assert(downloads.downloads?.length === 2, "Expected two QR downloads.");

  const pngDownload = await verifyDownload(
    `${apiBaseUrl}/qr-codes/${qr.id}/downloads?format=png`,
    login.accessToken,
    "image/png"
  );
  const svgDownload = await verifyDownload(
    `${apiBaseUrl}/qr-codes/${qr.id}/downloads?format=svg`,
    login.accessToken,
    "image/svg+xml"
  );

  const scanResponse = await fetch(qr.shortUrl, {
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123",
      "X-Country": "US"
    },
    redirect: "manual"
  });
  assert(
    scanResponse.status === 302,
    `Expected short-link redirect, got HTTP ${scanResponse.status}.`
  );

  const analytics = await waitForAnalytics(qr.id, login.accessToken);
  const updatedProfile = await apiRequest("/me", {
    body: {
      avatarUrl: "https://example.com/staging-avatar.png",
      fullName: updatedName,
      locale: "en"
    },
    method: "PATCH",
    token: login.accessToken
  });

  const forgotPassword = await apiRequest("/auth/forgot-password", {
    body: {
      email
    },
    method: "POST"
  });

  const result = {
    analyticsSummary: analytics.summary,
    downloadMode: {
      png: pngDownload.mode,
      svg: svgDownload.mode
    },
    forgotPasswordVerified: true,
    healthDependencies: health.dependencies ?? null,
    me,
    qrId: qr.id,
    renderAccepted: render.accepted === true,
    resetPasswordVerified: false,
    updatedProfile,
    webChecked: web.checked
  };

  if (verifyResetPassword) {
    const resetToken =
      forgotPassword.resetToken ?? process.env.STAGING_SMOKE_RESET_TOKEN;

    assert(
      resetToken,
      "Reset verification requested, but no reset token was available."
    );

    const resetPassword = await apiRequest("/auth/reset-password", {
      body: {
        password: "EvenStrongerPass123!",
        token: resetToken
      },
      method: "POST"
    });

    const relogin = await apiRequest("/auth/login", {
      body: {
        email,
        password: "EvenStrongerPass123!"
      },
      method: "POST"
    });

    result.resetPasswordVerified = Boolean(
      resetPassword.accessToken && relogin.accessToken
    );
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
