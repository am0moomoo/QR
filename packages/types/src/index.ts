import { z } from "zod";

export const planNames = ["free", "lite", "premium", "enterprise"] as const;
export const qrStatuses = ["ACTIVE", "INACTIVE", "ARCHIVED", "DELETED"] as const;
export const exportFormats = ["png", "svg"] as const;
export const qrTypes = [
  "link",
  "text",
  "phone",
  "sms",
  "email",
  "wifi",
  "vcard",
  "geo",
  "event",
  "file",
  "image",
  "pdf",
  "app-store",
  "whatsapp",
  "telegram",
  "menu",
  "coupon",
  "social-profile"
] as const;

export type PlanName = (typeof planNames)[number];
export type QrStatus = (typeof qrStatuses)[number];
export type ExportFormat = (typeof exportFormats)[number];
export type QrType = (typeof qrTypes)[number];

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);

const nullableStringSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => value ?? null);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  fullName: nullableStringSchema
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128)
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
  token: z.string().min(24).max(512)
});

export const updateProfileSchema = z.object({
  avatarUrl: z.union([z.string().trim().url(), z.null()]).optional(),
  fullName: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
  locale: z.string().trim().min(2).max(16).optional()
});

export const qrDesignSchema = z
  .object({
    sizePx: z.number().int().min(128).max(2048).default(512),
    pattern: z.string().trim().min(1).max(40).default("square"),
    patternColor: hexColorSchema.default("#111111"),
    backgroundColor: hexColorSchema.default("#ffffff"),
    cornersInner: z.string().trim().min(1).max(40).default("square"),
    cornersInnerColor: hexColorSchema.default("#111111"),
    cornersOuter: z.string().trim().min(1).max(40).default("square"),
    cornersOuterColor: hexColorSchema.default("#111111"),
    logoAssetId: nullableStringSchema,
    logoHideBg: z.boolean().default(true),
    errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
    quietZoneModules: z.number().int().min(0).max(16).default(4)
  })
  .default({});

export const qrSettingsSchema = z
  .object({
    adsEnabled: z.boolean().default(true),
    doNotIndex: z.boolean().default(false),
    password: nullableStringSchema,
    isOneTime: z.boolean().default(false),
    maxScans: z.number().int().positive().nullable().optional().transform((value) => value ?? null),
    expiresAt: z
      .union([z.string().datetime(), z.null()])
      .optional()
      .transform((value) => value ?? null)
  })
  .default({});

const urlSchema = z.string().trim().url();

const qrContentSchemaMap = {
  link: z.object({
    link: urlSchema
  }),
  text: z.object({
    text: z.string().trim().min(1).max(5000)
  }),
  phone: z.object({
    phone: z.string().trim().min(3).max(40)
  }),
  sms: z.object({
    phone: z.string().trim().min(3).max(40),
    message: nullableStringSchema
  }),
  email: z.object({
    email: z.string().trim().email(),
    subject: nullableStringSchema,
    body: nullableStringSchema
  }),
  wifi: z.object({
    ssid: z.string().trim().min(1).max(64),
    password: nullableStringSchema,
    encryption: z.enum(["WPA", "WEP", "nopass"]).default("WPA"),
    hidden: z.boolean().default(false)
  }),
  vcard: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: nullableStringSchema,
    organization: nullableStringSchema,
    title: nullableStringSchema,
    phone: nullableStringSchema,
    email: nullableStringSchema,
    website: nullableStringSchema,
    address: nullableStringSchema
  }),
  geo: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: nullableStringSchema
  }),
  event: z.object({
    title: z.string().trim().min(1).max(160),
    startAt: z.string().datetime(),
    endAt: z.union([z.string().datetime(), z.null()]).optional().transform((value) => value ?? null),
    location: nullableStringSchema,
    description: nullableStringSchema
  }),
  file: z.object({
    fileUrl: urlSchema,
    fileName: nullableStringSchema
  }),
  image: z.object({
    imageUrl: urlSchema,
    alt: nullableStringSchema
  }),
  pdf: z.object({
    pdfUrl: urlSchema,
    title: nullableStringSchema
  }),
  "app-store": z
    .object({
      iosUrl: nullableStringSchema,
      androidUrl: nullableStringSchema,
      fallbackUrl: nullableStringSchema
    })
    .refine(
      (value) => Boolean(value.iosUrl || value.androidUrl || value.fallbackUrl),
      "At least one store URL is required"
    ),
  whatsapp: z.object({
    phone: z.string().trim().min(3).max(40),
    message: nullableStringSchema
  }),
  telegram: z.object({
    username: z.string().trim().min(3).max(64),
    message: nullableStringSchema
  }),
  menu: z.object({
    menuUrl: urlSchema,
    title: nullableStringSchema
  }),
  coupon: z.object({
    title: z.string().trim().min(1).max(160),
    code: z.string().trim().min(1).max(80),
    targetUrl: nullableStringSchema
  }),
  "social-profile": z.object({
    profileUrl: urlSchema,
    platform: nullableStringSchema
  })
} satisfies Record<QrType, z.ZodTypeAny>;

export const createQrCodeSchema = z.object({
  workspaceId: z.string().uuid(),
  folderId: z.union([z.string().uuid(), z.null()]).optional().transform((value) => value ?? null),
  title: nullableStringSchema,
  type: z.enum(qrTypes),
  content: z.record(z.string(), z.unknown()),
  design: qrDesignSchema,
  settings: qrSettingsSchema,
  exports: z.array(z.enum(exportFormats)).default(["png", "svg"])
});

export const updateQrCodeSchema = z.object({
  title: z.union([z.string(), z.null()]).optional(),
  folderId: z.union([z.string().uuid(), z.null()]).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  design: qrDesignSchema.optional(),
  settings: qrSettingsSchema.optional()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type QrDesignInput = z.infer<typeof qrDesignSchema>;
export type QrSettingsInput = z.infer<typeof qrSettingsSchema>;
export type CreateQrCodeInput = z.infer<typeof createQrCodeSchema>;
export type UpdateQrCodeInput = z.infer<typeof updateQrCodeSchema>;

export function getQrContentSchema(type: QrType) {
  return qrContentSchemaMap[type];
}

export function validateQrContent(type: QrType, value: unknown) {
  return getQrContentSchema(type).parse(value);
}

export function getQrTargetUrl(type: QrType, value: unknown) {
  const content = validateQrContent(type, value) as Record<string, unknown>;

  switch (type) {
    case "link":
      return content.link as string;
    case "phone":
      return `tel:${content.phone as string}`;
    case "sms": {
      const message = content.message ? `?body=${encodeURIComponent(content.message as string)}` : "";
      return `sms:${content.phone as string}${message}`;
    }
    case "email": {
      const params = new URLSearchParams();

      if (content.subject) {
        params.set("subject", content.subject as string);
      }

      if (content.body) {
        params.set("body", content.body as string);
      }

      const query = params.toString();
      return `mailto:${content.email as string}${query ? `?${query}` : ""}`;
    }
    case "file":
      return content.fileUrl as string;
    case "image":
      return content.imageUrl as string;
    case "pdf":
      return content.pdfUrl as string;
    case "app-store":
      return (content.fallbackUrl || content.iosUrl || content.androidUrl) as string;
    case "whatsapp": {
      const text = content.message ? `?text=${encodeURIComponent(content.message as string)}` : "";
      return `https://wa.me/${content.phone as string}${text}`;
    }
    case "telegram": {
      const text = content.message
        ? `?text=${encodeURIComponent(content.message as string)}`
        : "";
      return `https://t.me/${content.username as string}${text}`;
    }
    case "menu":
      return content.menuUrl as string;
    case "coupon":
      return (content.targetUrl as string | null) ?? null;
    case "social-profile":
      return content.profileUrl as string;
    default:
      return null;
  }
}

export function shouldRenderLanding(type: QrType, value: unknown) {
  return getQrTargetUrl(type, value) === null;
}
