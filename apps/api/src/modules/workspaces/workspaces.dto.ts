import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateWorkspaceDto {
  @ApiProperty({
    example: "Campaign Ops"
  })
  name!: string;
}

export class CreateFolderDto {
  @ApiProperty({
    example: "Spring launch"
  })
  name!: string;

  @ApiPropertyOptional({
    format: "uuid",
    nullable: true,
    default: null
  })
  parentId?: string | null;
}

export class CreateCustomDomainDto {
  @ApiProperty({
    example: "go.example.com"
  })
  domain!: string;
}

export class VerifyCustomDomainDto {
  @ApiProperty({
    example: "verify_1234567890abcdef"
  })
  verificationToken!: string;
}

export class ImportQrCodesDto {
  @ApiProperty({
    enum: ["csv", "json"],
    example: "csv"
  })
  format!: "csv" | "json";

  @ApiProperty({
    example: "title,link\nSpring launch,https://example.com/spring"
  })
  data!: string;

  @ApiPropertyOptional({
    format: "uuid",
    nullable: true,
    default: null
  })
  folderId?: string | null;
}
