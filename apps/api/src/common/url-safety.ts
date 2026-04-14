import { BadRequestException } from "@nestjs/common";
import {
  isPrivateHostname,
  isSafeHttpUrl,
  isSafeRedirectDestination
} from "@qr/types";

function shouldAllowPrivateHosts() {
  return (
    process.env.ALLOW_PRIVATE_TARGET_URLS === "true" ||
    process.env.NODE_ENV !== "production"
  );
}

function parseUrlOrThrow(value: string, fieldName: string) {
  try {
    return new URL(value);
  } catch {
    throw new BadRequestException(`${fieldName} must be a valid absolute URL.`);
  }
}

export function assertSafeRedirectTarget(
  value: string | null | undefined,
  fieldName = "Redirect target"
) {
  if (!value) {
    return value ?? null;
  }

  if (
    !isSafeRedirectDestination(value, {
      allowPrivateHosts: shouldAllowPrivateHosts()
    })
  ) {
    throw new BadRequestException(
      `${fieldName} must use a supported destination and cannot include unsafe hostnames or embedded credentials.`
    );
  }

  return value;
}

export function assertSafeUserFacingUrl(
  value: string | null | undefined,
  fieldName: string
) {
  if (!value) {
    return value ?? null;
  }

  if (
    !isSafeHttpUrl(value, {
      allowPrivateHosts: shouldAllowPrivateHosts()
    })
  ) {
    throw new BadRequestException(
      `${fieldName} must use a supported http or https URL and cannot include unsafe hostnames or embedded credentials.`
    );
  }

  return value;
}

export function assertAllowedReturnUrl(
  value: string | null | undefined,
  appBaseUrl: string,
  fieldName: string
) {
  if (!value) {
    return value ?? null;
  }

  if (value.length > 2048) {
    throw new BadRequestException(`${fieldName} is too long.`);
  }

  if (!isSafeHttpUrl(value, { allowPrivateHosts: true })) {
    throw new BadRequestException(
      `${fieldName} must use an absolute http or https URL without embedded credentials.`
    );
  }

  const returnUrl = parseUrlOrThrow(value, fieldName);
  const appUrl = parseUrlOrThrow(appBaseUrl, "APP_URL");

  if (returnUrl.origin !== appUrl.origin) {
    throw new BadRequestException(
      `${fieldName} must stay on the ${appUrl.origin} origin.`
    );
  }

  if (process.env.NODE_ENV === "production" && isPrivateHostname(returnUrl.hostname)) {
    throw new BadRequestException(
      `${fieldName} must not point to a private or local hostname in production.`
    );
  }

  return returnUrl.toString();
}
