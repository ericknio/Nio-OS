/**
 * @file prisma.ts
 * @description Instância singleton do Prisma Client conectada ao banco de dados PostgreSQL na nuvem.
 *
 * Gerenciamento de Conexões e Pool:
 * - Utiliza o padrão singleton no escopo global (`globalThis`) para evitar o esgotamento do pool de conexões
 *   com o banco de dados durante os ciclos de Fast Refresh do Next.js em ambiente de desenvolvimento.
 * - Conecta-se via string de conexão parametrizada em `NIO_CLOUD_DATABASE_URL`.
 */

import { PrismaClient } from "@prisma/client";

/**
 * Extensão do objeto global Node.js para cachear a instância do Prisma Client.
 */
const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Cliente Prisma compartilhado para consultas e mutações no banco de dados na nuvem.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasourceUrl: process.env.NIO_CLOUD_DATABASE_URL
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

