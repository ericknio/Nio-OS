/**
 * @file lib/operadorSistema.ts
 * @description Resolução inteligente do nome do operador/atendente responsável por ações no sistema.
 * 
 * Ordem de prioridade de resolução:
 * 1. Nome ou username do usuário autenticado no cookie da requisição (`obterUsuarioLogado()`).
 * 2. Operador padrão definido nas configurações da empresa (`CompanySettings.defaultOperator`).
 * 3. Fallback genérico: "Sistema".
 */

import { obterUsuarioLogado } from "@/lib/authSistema";
import { prisma } from "@/lib/prisma";

/**
 * Identifica o nome do operador responsável por registrar vendas, movimentações ou alterações de OS.
 * 
 * @param _userName Parâmetro reservado para compatibilidade retroativa.
 * @returns Nome do operador resolvido.
 */
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
