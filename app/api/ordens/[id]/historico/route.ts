/**
 * @file route.ts
 * @description Endpoint de consulta do histórico cronológico de auditoria de uma Ordem de Serviço (`/api/ordens/[id]/historico`).
 * Retorna todos os eventos registrados (mudanças de status, pagamentos, peças, laudos e impressões),
 * ordenados do mais recente para o mais antigo.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retorna os registros da tabela HistoricoOrdem vinculados ao ID da Ordem de Serviço informada.
 * Exige permissão 'ordens.ver'.
 * 
 * @param request - Objeto da requisição NextRequest
 * @param props.params - Parâmetros da rota contendo `id` da OS
 * @returns JSON com array de eventos do histórico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = await exigirPermissaoApi("ordens.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await params;

    const historico = await prisma.historicoOrdem.findMany({
      where: {
        ordemId: id,
      },
      orderBy: {
        criadoEm: "desc",
      },
    });

    return Response.json(historico);
  } catch (error) {
    console.error("Erro ao buscar histórico da OS:", error);

    return Response.json(
      {
        error: "Erro ao buscar histórico da OS.",
      },
      {
        status: 500,
      }
    );
  }
}
