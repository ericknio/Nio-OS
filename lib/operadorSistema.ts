// lib/operadorSistema.ts
import { obterUsuarioLogado } from "@/lib/authSistema";
import { prisma } from "@/lib/prisma";

export async function resolverOperadorPadrao(_userName?: unknown) {
  try {
    const usuario = await obterUsuarioLogado();
    const nomeUsuario = usuario?.name?.trim() || usuario?.username?.trim();

    if (nomeUsuario) {
      return nomeUsuario;
    }
  } catch {
    // Fora de um request HTTP, cai no operador padrão configurado.
  }

  const configuracoes = await prisma.companySettings.findFirst({
    select: {
      defaultOperator: true,
    },
  });

  return configuracoes?.defaultOperator?.trim() || "Sistema";
}
