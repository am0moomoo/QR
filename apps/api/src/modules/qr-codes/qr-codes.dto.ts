import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

class QrCodeDesignDto {
  @ApiPropertyOptional({ default: "#ffffff" })
  backgroundColor?: string;

  @ApiPropertyOptional({ default: "square" })
  cornersInner?: string;

  @ApiPropertyOptional({ default: "#111111" })
  cornersInnerColor?: string;

  @ApiPropertyOptional({ default: "square" })
  cornersOuter?: string;

  @ApiPropertyOptional({ default: "#111111" })
  cornersOuterColor?: string;

  @ApiPropertyOptional({ enum: ["L", "M", "Q", "H"], default: "M" })
  errorCorrection?: "L" | "M" | "Q" | "H";

  @ApiPropertyOptional({
    format: "uuid",
    nullable: true,
    default: null
  })
  logoAssetId?: string | null;

  @ApiPropertyOptional({ default: true })
  logoHideBg?: boolean;

  @ApiPropertyOptional({ default: "square" })
  pattern?: string;

  @ApiPropertyOptional({ default: "#111111" })
  patternColor?: string;

  @ApiPropertyOptional({ default: 4 })
  quietZoneModules?: number;

  @ApiPropertyOptional({ default: 512 })
  sizePx?: number;
}

class QrCodeSettingsDto {
  @ApiPropertyOptional({ default: true })
  adsEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  doNotIndex?: boolean;

  @ApiPropertyOptional({
    format: "date-time",
    nullable: true,
    default: null
  })
  expiresAt?: string | null;

  @ApiPropertyOptional({ default: false })
  isOneTime?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    default: null
  })
  maxScans?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    default: null
  })
  password?: string | null;
}

export class CreateQrCodeDto {
  @ApiProperty({
    type: String,
    format: "uuid"
  })
  workspaceId!: string;

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    default: null
  })
  folderId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    default: "My first link QR"
  })
  title?: string | null;

  @ApiProperty({
    enum: ["link"],
    example: "link"
  })
  type!: "link";

  @ApiProperty({
    type: "object",
    additionalProperties: {
      type: "string"
    },
    example: {
      link: "https://example.com/launch"
    }
  })
  content!: {
    link: string;
  };

  @ApiPropertyOptional({
    type: () => QrCodeDesignDto
  })
  design?: QrCodeDesignDto;

  @ApiPropertyOptional({
    type: () => QrCodeSettingsDto
  })
  settings?: QrCodeSettingsDto;

  @ApiPropertyOptional({
    enum: ["png", "svg"],
    isArray: true,
    default: ["png", "svg"]
  })
  exports?: Array<"png" | "svg">;
}

export class UpdateQrCodeDto {
  @ApiPropertyOptional({
    nullable: true,
    default: "Updated QR title"
  })
  title?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: "uuid",
    nullable: true,
    default: null
  })
  folderId?: string | null;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: {
      type: "string"
    },
    example: {
      link: "https://example.com/updated"
    }
  })
  content?: {
    link: string;
  };

  @ApiPropertyOptional({
    type: () => QrCodeDesignDto
  })
  design?: QrCodeDesignDto;

  @ApiPropertyOptional({
    type: () => QrCodeSettingsDto
  })
  settings?: QrCodeSettingsDto;
}
