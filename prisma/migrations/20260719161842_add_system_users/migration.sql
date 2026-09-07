-- CreateEnum
CREATE TYPE "SystemUserRole" AS ENUM ('ADMIN', 'ATENDENTE', 'TECNICO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "SystemUserStatus" AS ENUM ('ATIVO', 'INATIVO', 'BLOQUEADO');

-- CreateTable
CREATE TABLE "SystemUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "SystemUserRole" NOT NULL DEFAULT 'ATENDENTE',
    "status" "SystemUserStatus" NOT NULL DEFAULT 'ATIVO',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemUser_username_key" ON "SystemUser"("username");

-- CreateIndex
CREATE INDEX "SystemUser_username_idx" ON "SystemUser"("username");

-- CreateIndex
CREATE INDEX "SystemUser_email_idx" ON "SystemUser"("email");

-- CreateIndex
CREATE INDEX "SystemUser_role_idx" ON "SystemUser"("role");

-- CreateIndex
CREATE INDEX "SystemUser_status_idx" ON "SystemUser"("status");
