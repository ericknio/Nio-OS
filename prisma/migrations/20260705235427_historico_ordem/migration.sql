-- CreateTable
CREATE TABLE "HistoricoOrdem" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoOrdem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricoOrdem_ordemId_idx" ON "HistoricoOrdem"("ordemId");

-- AddForeignKey
ALTER TABLE "HistoricoOrdem" ADD CONSTRAINT "HistoricoOrdem_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
