const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PERMISSOES_PADRAO = [
  "produtos.ver",
  "estoque.ver",
  "vendas.ver",
  "vendas.registrar",
];

const PERMISSOES_ADMIN = [
  "produtos.ver",
  "produtos.criar",
  "produtos.editar",
  "produtos.excluir",
  "estoque.ver",
  "estoque.ajustar",
  "vendas.ver",
  "vendas.registrar",
  "vendas.cancelar",
];

async function main() {
  console.log("====================================");
  console.log(" Nio-OS - Permissões de produtos");
  console.log("====================================");
  console.log("Este script é legado. Use a tela Usuários do sistema para ajustes finos.");
  console.log("");

  const usuarios = await prisma.systemUser.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      permissions: {
        select: {
          key: true,
        },
      },
    },
  });

  let atualizados = 0;

  for (const usuario of usuarios) {
    const atuais = new Set(usuario.permissions.map((item) => item.key));
    const novas =
      usuario.role === "ADMIN" ? PERMISSOES_ADMIN : PERMISSOES_PADRAO;

    const faltando = novas.filter((key) => !atuais.has(key));

    if (faltando.length === 0) continue;

    await prisma.systemUser.update({
      where: {
        id: usuario.id,
      },
      data: {
        permissions: {
          create: faltando.map((key) => ({
            key,
          })),
        },
      },
    });

    atualizados += 1;

    console.log(
      `OK: ${usuario.name || usuario.username} recebeu ${faltando.length} permissão(ões).`
    );
  }

  console.log("");
  console.log(`Finalizado. Usuários atualizados: ${atualizados}`);
}

main()
  .catch((error) => {
    console.error("Erro ao adicionar permissões:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
