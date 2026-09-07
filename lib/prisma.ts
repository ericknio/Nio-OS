import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaConfigured?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Configura o SQLite com WAL mode e busy timeout para evitar 'database is locked' em concorrência
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