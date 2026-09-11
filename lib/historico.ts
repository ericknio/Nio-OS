/**
 * @file lib/historico.ts
 * @description Módulo utilitário para registro de auditoria e trilha histórica de Ordens de Serviço.
 * 
 * Permite registrar alterações de status, pagamentos, inclusão/remoção de peças e
 * cancelamentos, criando uma linha do tempo imutável em `HistoricoOrdem`.
 */

import { prisma } from "@/lib/prisma";

type RegistrarHistoricoParams = {
  ordemId: string;
  acao: string;
  descricao?: string;
};

/**
 * Registra um novo evento no histórico cronológico de uma Ordem de Serviço.
 * A falha no registro de histórico é tratada de forma silenciosa para não quebrar a transação principal.
 * 
 * @param params.ordemId ID da Ordem de Serviço afetada.
 * @param params.acao Nome ou categoria da ação realizada (ex: "STATUS_ALTERADO", "PAGAMENTO_REGISTRADO").
 * @param params.descricao Detalhes adicionais legíveis sobre o evento (opcional).
 */
export async function registrarHistoricoOrdem({
  ordemId,
  acao,
  descricao,
}: RegistrarHistoricoParams) {
  try {
    await prisma.historicoOrdem.create({
      data: {
        ordemId,
        acao,
        descricao,
      },
    });
  } catch (error) {
    console.error("Erro ao registrar histórico da OS:", error);
  }
}