-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'LITE', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "QRCodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "FolderRole" AS ENUM ('VIEW', 'EDIT');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('QR_IMAGE', 'LOGO', 'UPLOADED_FILE', 'TEMPLATE_PREVIEW');

-- CreateEnum
CREATE TYPE "AssetFormat" AS ENUM ('PNG', 'SVG', 'PDF', 'JPG', 'EPS', 'WEBP');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('EMAIL', 'WEBHOOK', 'PUSH');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "ScanOutcome" AS ENUM ('REDIRECTED', 'LANDED', 'BLOCKED', 'INACTIVE', 'EXPIRED', 'PASSWORD_REQUIRED', 'NOT_FOUND');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolderShare" (
    "id" UUID NOT NULL,
    "folderId" UUID NOT NULL,
    "invitedUserId" UUID,
    "invitedEmail" TEXT NOT NULL,
    "role" "FolderRole" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "FolderShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRCode" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "folderId" UUID,
    "title" TEXT,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "QRCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "adsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "doNotIndex" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "isOneTime" BOOLEAN NOT NULL DEFAULT false,
    "maxScans" INTEGER,
    "scansCount" BIGINT NOT NULL DEFAULT 0,
    "lastScanAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "QRCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRContent" (
    "qrCodeId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "targetUrl" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRContent_pkey" PRIMARY KEY ("qrCodeId")
);

-- CreateTable
CREATE TABLE "QRDesign" (
    "qrCodeId" UUID NOT NULL,
    "sizePx" INTEGER NOT NULL DEFAULT 300,
    "pattern" TEXT NOT NULL DEFAULT 'square',
    "patternColor" TEXT NOT NULL DEFAULT '#000000',
    "backgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
    "cornersInner" TEXT NOT NULL DEFAULT 'square',
    "cornersInnerColor" TEXT NOT NULL DEFAULT '#000000',
    "cornersOuter" TEXT NOT NULL DEFAULT 'square',
    "cornersOuterColor" TEXT NOT NULL DEFAULT '#000000',
    "logoAssetId" UUID,
    "logoSizeRatio" DECIMAL(4,3),
    "logoHideBg" BOOLEAN NOT NULL DEFAULT true,
    "logoMargin" INTEGER NOT NULL DEFAULT 0,
    "frameId" UUID,
    "errorCorrection" TEXT NOT NULL DEFAULT 'M',
    "quietZoneModules" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRDesign_pkey" PRIMARY KEY ("qrCodeId")
);

-- CreateTable
CREATE TABLE "QRAsset" (
    "id" UUID NOT NULL,
    "qrCodeId" UUID,
    "workspaceId" UUID,
    "kind" "AssetKind" NOT NULL,
    "format" "AssetFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "widthPx" INTEGER,
    "heightPx" INTEGER,
    "bytes" BIGINT,
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" UUID NOT NULL,
    "qrCodeId" UUID NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "deviceType" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "language" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "networkIsp" TEXT,
    "referrer" TEXT,
    "utm" JSONB,
    "openedOk" BOOLEAN,
    "outcome" "ScanOutcome" NOT NULL,
    "redirectRuleId" UUID,
    "requestId" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanAggregateDaily" (
    "qrCodeId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "scans" INTEGER NOT NULL,
    "uniqueIps" INTEGER NOT NULL,
    "uniqueDevices" INTEGER,
    "devices" JSONB,
    "countries" JSONB,
    "browsers" JSONB,
    "operatingSystems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanAggregateDaily_pkey" PRIMARY KEY ("qrCodeId","day")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" UUID NOT NULL,
    "qrCodeId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "plan" "Plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "subscriptionId" UUID,
    "stripeInvoiceId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "status" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "certificateStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedirectRule" (
    "id" UUID NOT NULL,
    "qrCodeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "countryCodes" JSONB,
    "languages" JSONB,
    "deviceTypes" JSONB,
    "operatingSystems" JSONB,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "targetUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedirectRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyCheck" (
    "id" UUID NOT NULL,
    "qrCodeId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "riskScore" INTEGER,
    "summary" TEXT,
    "details" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRTemplate" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "design" JSONB NOT NULL,
    "previewAssetId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QRTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "workspaceId" UUID,
    "qrCodeId" UUID,
    "actorUserId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerUserId_key" ON "OAuthAccount"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_ownerUserId_idx" ON "Workspace"("ownerUserId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Folder_workspaceId_idx" ON "Folder"("workspaceId");

-- CreateIndex
CREATE INDEX "Folder_ownerUserId_idx" ON "Folder"("ownerUserId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "FolderShare_folderId_idx" ON "FolderShare"("folderId");

-- CreateIndex
CREATE INDEX "FolderShare_invitedEmail_idx" ON "FolderShare"("invitedEmail");

-- CreateIndex
CREATE INDEX "FolderShare_invitedUserId_idx" ON "FolderShare"("invitedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QRCode_slug_key" ON "QRCode"("slug");

-- CreateIndex
CREATE INDEX "QRCode_workspaceId_createdAt_idx" ON "QRCode"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "QRCode_workspaceId_updatedAt_idx" ON "QRCode"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "QRCode_folderId_idx" ON "QRCode"("folderId");

-- CreateIndex
CREATE INDEX "QRCode_ownerUserId_idx" ON "QRCode"("ownerUserId");

-- CreateIndex
CREATE INDEX "QRCode_status_idx" ON "QRCode"("status");

-- CreateIndex
CREATE INDEX "QRCode_lastScanAt_idx" ON "QRCode"("lastScanAt");

-- CreateIndex
CREATE UNIQUE INDEX "QRAsset_storageKey_key" ON "QRAsset"("storageKey");

-- CreateIndex
CREATE INDEX "QRAsset_qrCodeId_idx" ON "QRAsset"("qrCodeId");

-- CreateIndex
CREATE INDEX "QRAsset_workspaceId_idx" ON "QRAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "QRAsset_kind_idx" ON "QRAsset"("kind");

-- CreateIndex
CREATE INDEX "ScanEvent_qrCodeId_scannedAt_idx" ON "ScanEvent"("qrCodeId", "scannedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_scannedAt_idx" ON "ScanEvent"("scannedAt");

-- CreateIndex
CREATE INDEX "ScanEvent_country_idx" ON "ScanEvent"("country");

-- CreateIndex
CREATE INDEX "ScanEvent_outcome_idx" ON "ScanEvent"("outcome");

-- CreateIndex
CREATE INDEX "NotificationRule_qrCodeId_idx" ON "NotificationRule"("qrCodeId");

-- CreateIndex
CREATE INDEX "NotificationRule_ownerUserId_idx" ON "NotificationRule"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_workspaceId_idx" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_subscriptionId_idx" ON "Invoice"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyPrefix_key" ON "ApiKey"("keyPrefix");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_workspaceId_idx" ON "ApiKey"("workspaceId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_userId_idx" ON "WebhookEndpoint"("userId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_workspaceId_idx" ON "WebhookEndpoint"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");

-- CreateIndex
CREATE INDEX "CustomDomain_workspaceId_idx" ON "CustomDomain"("workspaceId");

-- CreateIndex
CREATE INDEX "RedirectRule_qrCodeId_enabled_priority_idx" ON "RedirectRule"("qrCodeId", "enabled", "priority");

-- CreateIndex
CREATE INDEX "SafetyCheck_qrCodeId_checkedAt_idx" ON "SafetyCheck"("qrCodeId", "checkedAt");

-- CreateIndex
CREATE INDEX "QRTemplate_workspaceId_idx" ON "QRTemplate"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_qrCodeId_createdAt_idx" ON "AuditLog"("qrCodeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCode" ADD CONSTRAINT "QRCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCode" ADD CONSTRAINT "QRCode_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRCode" ADD CONSTRAINT "QRCode_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRContent" ADD CONSTRAINT "QRContent_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRDesign" ADD CONSTRAINT "QRDesign_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRDesign" ADD CONSTRAINT "QRDesign_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "QRAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRAsset" ADD CONSTRAINT "QRAsset_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanAggregateDaily" ADD CONSTRAINT "ScanAggregateDaily_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedirectRule" ADD CONSTRAINT "RedirectRule_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyCheck" ADD CONSTRAINT "SafetyCheck_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRTemplate" ADD CONSTRAINT "QRTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QRCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

