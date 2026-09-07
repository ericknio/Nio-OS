-- CreateTable
CREATE TABLE "SystemUserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemUserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemUserPermission_userId_idx" ON "SystemUserPermission"("userId");

-- CreateIndex
CREATE INDEX "SystemUserPermission_key_idx" ON "SystemUserPermission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SystemUserPermission_userId_key_key" ON "SystemUserPermission"("userId", "key");

-- AddForeignKey
ALTER TABLE "SystemUserPermission" ADD CONSTRAINT "SystemUserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SystemUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
