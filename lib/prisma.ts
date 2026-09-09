/**
 * @file prisma.ts
 * @description Gerenciador central da conexão com o banco de dados SQLite local via Prisma ORM.
 * 
 * Implementa o padrão Singleton para evitar vazamento de conexões em recarregamentos
 * rápidos (Hot Reload) do Next.js e configura parâmetros de alta concorrência no SQLite.
 */

import { PrismaClient } from "@prisma/client";

/**
 * Interface estendida do escopo global para armazenar a instância única do Prisma.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConfigured?: boolean;
};

/**
 * Instância única (Singleton) do PrismaClient compartilhada por toda a aplicação.
 * Em desenvolvimento, preserva a instância no objeto globalThis.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Otimização de concorrência para SQLite (Multi-usuário / Rede LAN):
 * 
 * 1. PRAGMA journal_mode = WAL:
 *    Ativa o modo Write-Ahead Logging, permitindo leituras e escritas simultâneas
 *    sem travar o arquivo do banco de dados.
 * 
 * 2. PRAGMA busy_timeout = 5000:
 *    Faz o SQLite aguardar até 5 segundos caso outra operação esteja escrevendo,
 *    evitando o erro fatal 'database is locked'.
 * 
 * 3. PRAGMA synchronous = NORMAL:
 *    Oferece excelente equilíbrio entre velocidade de escrita e segurança contra corrupção.
 */
if (!globalForPrisma.prismaConfigured) {
  globalForPrisma.prismaConfigured = true;
  void (async () => {
    try {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
      await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
    } catch {
      // Ignora em fases onde o arquivo de banco ainda não existe ou durante build estático
    }
  })();
}