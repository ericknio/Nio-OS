-- CreateEnum
CREATE TYPE "ActivationRequestStatus" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "ActivationRequest" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "installationName" TEXT,
    "responsibleName" TEXT,
    "document" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "status" "ActivationRequestStatus" NOT NULL DEFAULT 'PENDENTE',
    "approvedLicenseId" TEXT,
    "approvedLicenseKey" TEXT,
    "appVersion" TEXT,
    "adminNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivationRequest_machineId_idx" ON "ActivationRequest"("machineId");

-- CreateIndex
CREATE INDEX "ActivationRequest_status_idx" ON "ActivationRequest"("status");

-- CreateIndex
CREATE INDEX "ActivationRequest_email_idx" ON "ActivationRequest"("email");

-- CreateIndex
CREATE INDEX "ActivationRequest_document_idx" ON "ActivationRequest"("document");

-- CreateIndex
CREATE INDEX "ActivationRequest_requestedAt_idx" ON "ActivationRequest"("requestedAt");
