-- CreateEnum
CREATE TYPE "LicensePlan" AS ENUM ('TESTE', 'MENSAL', 'ANUAL', 'VITALICIO');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('PENDENTE', 'ATIVA', 'EXPIRADA', 'BLOQUEADA');

-- AlterEnum
ALTER TYPE "EquipmentType" ADD VALUE 'TV';

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "plan" "LicensePlan" NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDENTE',
    "customerName" TEXT,
    "customerDocument" TEXT,
    "customerEmail" TEXT,
    "machineId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "lastCheckAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationLog" (
    "id" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "machineId" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_licenseKey_key" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_licenseKey_idx" ON "License"("licenseKey");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE INDEX "License_machineId_idx" ON "License"("machineId");

-- CreateIndex
CREATE INDEX "License_expiresAt_idx" ON "License"("expiresAt");

-- CreateIndex
CREATE INDEX "ActivationLog_licenseKey_idx" ON "ActivationLog"("licenseKey");

-- CreateIndex
CREATE INDEX "ActivationLog_machineId_idx" ON "ActivationLog"("machineId");

-- CreateIndex
CREATE INDEX "ActivationLog_createdAt_idx" ON "ActivationLog"("createdAt");
