type DomainLike = {
  domain: string;
  status: string;
  updatedAt?: Date | string | null;
};

type WorkspaceBrandingLike = {
  customDomains?: DomainLike[] | null;
} | null;

export function getWorkspaceShortBaseUrl(workspace: WorkspaceBrandingLike) {
  const preferredDomain = getPreferredCustomDomain(workspace);

  if (preferredDomain) {
    return `https://${preferredDomain.domain}`;
  }

  return (
    process.env.SHORT_DOMAIN ??
    process.env.API_URL ??
    "http://localhost:4000"
  ).replace(/\/$/, "");
}

export function getPreferredCustomDomain(workspace: WorkspaceBrandingLike) {
  const verifiedDomains = (workspace?.customDomains ?? []).filter((domain) =>
    isVerifiedCustomDomainStatus(domain.status)
  );

  return verifiedDomains[0] ?? null;
}

export function isVerifiedCustomDomainStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "verified";
}

export function getWorkspaceBrandingVersion(workspace: WorkspaceBrandingLike) {
  return (workspace?.customDomains ?? [])
    .map((domain) =>
      [
        domain.domain,
        domain.status,
        domain.updatedAt instanceof Date
          ? domain.updatedAt.toISOString()
          : String(domain.updatedAt ?? "")
      ].join(":")
    )
    .sort()
    .join("|");
}
