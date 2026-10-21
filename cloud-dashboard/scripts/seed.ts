/**
 * @file seed.ts
 * @description Script de inicialização e povoamento (seeding) do banco de dados PostgreSQL do Cloud Dashboard.
 *
 * Responsabilidade:
 * - Garante a existência do usuário superadministrador (`MASTER`) inicial via operação idempotente `upsert`.
 * - Gera o hash de senha utilizando `bcryptjs` com salt factor 10.
 * - Concede créditos ilimitados para emissão inicial de licenças e criação de revendedores.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Função executora do seeding que cria o usuário administrador inicial no banco de dados.
 */
async function main() {
  const email = 'master@nio-os.com';
  const password = 'admin';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      role: 'MASTER',
      status: 'ACTIVE',
      credits: 999999,
    },
  });

  console.log({ user });
  console.log("Master user created. Login: master@nio-os.com, Pass: admin");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

