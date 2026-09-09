/**
 * @file app/api/ordens/[id]/status/route.ts
 * @description Transição controlada de status da Ordem de Serviço (PATCH).
 * 
 * Regras principais:
 * - Mudança para PRONTO: consome peças técnicas do estoque e grava o percentual de comissão do técnico.
 * - Mudanças intermediárias: atualiza o status (Recebido, Em análise, Aguardando peça, Em reparo) e registra auditoria.
 * - Idempotência: exige chave de idempotência para evitar dupla baixa de estoque.
 */

import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import { requireIdempotencyKey } from "@/lib/estoqueTecnico/validation";
import {
  markServiceOrderReadyAndConsumeTechnicalParts,
} from "@/lib/estoqueTecnico";
import { toFutureHttpError } from "@/lib/estoqueTecnico/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

const statusPermitidos: OrderStatus[] = [
  OrderStatus.RECEBIDO,
  OrderStatus.EM_ANALISE,
  OrderStatus.AGUARDANDO_PECA,
  OrderStatus.EM_REPARO,
];

const nomesStatus: Record<string, string> = {
  RECEBIDO: "Recebido",
  EM_ANALISE: "Em análise",
  AGUARDANDO_PECA: "Aguardando peça",
  EM_REPARO: "Em reparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

function podeVerDadosPagamento(usuario: UsuarioSessao | null | undefined) {
  if (!usuario) return false;

  return usuarioTemPermissao(usuario, [
    "pagamentos.ver",
    "pagamentos.registrar",
    "relatorios.financeiro",
  ]);
}

function sanitizarOrdemStatus(
  ordem: any,
  mostrarPagamentos: boolean,
  mostrarFinanceiroSensivel: boolean,
) {
  const base = mostrarPagamentos
    ? ordem
    : {
        ...ordem,
        paidAmount: null,
        paymentPercent: null,
        paymentReceivedAt: null,
        paymentMethod: null,
        payments: [],
        finalization: ordem.finalization
          ? {
              ...ordem.finalization,
              finalAmount: null,
              paymentMethod: null,
            }
          : null,
      };

  if (mostrarFinanceiroSensivel) return base;

  return {
    ...base,
    technicianProfitPercentSnapshot: null,
  };
}

function respostaErroEstoque(error: unknown) {
  const mapped = toFutureHttpError(error);
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (mapped.body.retryable) headers["Retry-After"] = "1";
  return NextResponse.json(mapped.body, { status: mapped.status, headers });
}

function validarComandoPronto(body: Record<string, unknown>) {
  const permitidos = new Set([
    "status",
    "expectedCurrentStatus",
    "confirmation",
    "technicianUserId",
  ]);
  if (Object.keys(body).some((key) => !permitidos.has(key))) {
    return "O payload contém campos não permitidos para concluir a OS.";
  }
  if (body.status !== OrderStatus.PRONTO) return "O status de destino deve ser PRONTO.";
  const statusesOrigem: string[] = [
    OrderStatus.RECEBIDO,
    OrderStatus.EM_ANALISE,
    OrderStatus.AGUARDANDO_PECA,
    OrderStatus.EM_REPARO,
  ];
  if (
    typeof body.expectedCurrentStatus !== "string" ||
    !statusesOrigem.includes(body.expectedCurrentStatus)
  ) {
    return "Informe o status atual esperado da OS.";
  }
  if (body.confirmation !== true) return "Confirme a conclusão do reparo.";
  if (
    typeof body.technicianUserId !== "string" ||
    !body.technicianUserId.trim()
  ) {
    return "Selecione o técnico responsável pelo serviço.";
  }
  return null;
}

/**
 * Endpoint PATCH /api/ordens/[id]/status
 * 
 * Altera o status operacional da Ordem de Serviço.
 * Se o novo status for PRONTO, consome as peças técnicas alocadas do estoque,
 * valida a chave de idempotência e salva o snapshot de lucro do técnico.
 *
 * @param request - Requisição HTTP com novo status e confirmação
 * @param context - Contexto dinâmico com o ID da O.S.
 * @returns Objeto da OS com status atualizado
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para alterar status." },
        { status: 400 }
      );
    }

    const statusSolicitado = String(body.status || "").trim().toUpperCase();

    const permissaoStatus =
      statusSolicitado === OrderStatus.PRONTO
        ? "ordens.marcar_pronto"
        : "ordens.alterar_status";

    const acesso = await exigirPermissaoApi(permissaoStatus);

    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const novoStatus = statusSolicitado as OrderStatus;
    const userName = nomeOperador(acesso.usuario);

    if (statusSolicitado === OrderStatus.PRONTO) {
      if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
        return NextResponse.json(
          { code: "VALIDATION_ERROR", message: "Content-Type application/json é obrigatório." },
          { status: 422, headers: { "Cache-Control": "no-store" } },
        );
      }
      const payloadError = validarComandoPronto(body);
      if (payloadError) {
        return NextResponse.json(
          { code: "VALIDATION_ERROR", message: payloadError },
          { status: 422, headers: { "Cache-Control": "no-store" } },
        );
      }
      let idempotencyKey: string;
      try {
        idempotencyKey = requireIdempotencyKey(request.headers.get("Idempotency-Key"));
      } catch (error) {
        const mapped = toFutureHttpError(error);
        return NextResponse.json(
          { ...mapped.body, code: mapped.body.code },
          { status: 422, headers: { "Cache-Control": "no-store" } },
        );
      }
      try {
        const result = markServiceOrderReadyAndConsumeTechnicalParts(
          id,
          {
            expectedCurrentStatus: body.expectedCurrentStatus,
            confirmation: true,
            technicianUserId: String(body.technicianUserId).trim(),
          },
          {
            operatorId: acesso.usuario.id || null,
            operatorName: userName,
            canViewFinancialData: usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario),
            idempotencyKey,
          },
        );

        // Leitura complementar somente após o commit para manter o contrato
        // histórico da rota; falhas aqui não desfazem o consumo confirmado.
        try {
          const ordemCompleta = await prisma.serviceOrder.findUnique({
            where: { id },
            include: {
              customer: true,
              histories: { orderBy: { createdAt: "desc" } },
              finalization: true,
              attachments: true,
              payments: { orderBy: { createdAt: "desc" } },
            },
          });
          if (ordemCompleta) {
            return NextResponse.json(
              sanitizarOrdemStatus(
                ordemCompleta,
                podeVerDadosPagamento(acesso.usuario),
                usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario),
              ),
            );
          }
        } catch {
          // O commit já ocorreu; retornar o resumo seguro abaixo.
        }
        return NextResponse.json({
          ...result,
          reloadOrder: true,
        });
      } catch (error) {
        return respostaErroEstoque(error);
      }
    }

    if (!statusPermitidos.includes(novoStatus)) {
      return NextResponse.json(
        {
          message:
            "Status inválido para alteração rápida. Para cancelar, use a tela de cancelamento. Para entregar, use a finalização.",
        },
        { status: 400 }
      );
    }

    const ordemAtualizada = await prisma.$transaction(async (tx) => {
      const ordemExistente = await tx.serviceOrder.findUnique({
        where: { id },
        include: { finalization: true },
      });

      if (!ordemExistente) {
        throw new Error("ORDEM_NAO_ENCONTRADA");
      }

      if (ordemExistente.status === OrderStatus.CANCELADO) {
        throw new Error("ORDEM_CANCELADA");
      }

      if (
        ordemExistente.status === OrderStatus.ENTREGUE ||
        ordemExistente.finalization
      ) {
        throw new Error("ORDEM_FINALIZADA");
      }

      if (ordemExistente.status === novoStatus) {
        throw new Error("MESMO_STATUS");
      }

      const statusAnterior = ordemExistente.status;

      const descriptionStatus = `Status alterado de ${
        nomesStatus[statusAnterior] || statusAnterior
      } para ${nomesStatus[novoStatus] || novoStatus}.`;

      const atualizacao = await tx.serviceOrder.updateMany({
        where: { id, status: statusAnterior },
        data: { status: novoStatus },
      });

      if (atualizacao.count === 0) {
        throw new Error("CONCORRENCIA_DETECTADA");
      }

      await tx.orderHistory.create({
        data: {
          serviceOrderId: id,
          userName,
          action: "ALTERACAO_STATUS",
          description: descriptionStatus,
        },
      });

      return await tx.serviceOrder.findUnique({
        where: { id },
        include: {
          customer: true,
          histories: { orderBy: { createdAt: "desc" } },
          finalization: true,
          attachments: true,
          payments: { orderBy: { createdAt: "desc" } },
        },
      });
    });

    if (!ordemAtualizada) {
      return NextResponse.json(
        { message: "Ordem não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      sanitizarOrdemStatus(
        ordemAtualizada,
        podeVerDadosPagamento(acesso.usuario),
        usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario),
      )
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORDEM_NAO_ENCONTRADA") {
        return NextResponse.json(
          { message: "Ordem não encontrada." },
          { status: 404 }
        );
      }
      if (error.message === "ORDEM_CANCELADA") {
        return NextResponse.json(
          {
            message:
              "Não é possível alterar status de uma OS cancelada. Reabra a OS primeiro.",
          },
          { status: 400 }
        );
      }
      if (error.message === "ORDEM_FINALIZADA") {
        return NextResponse.json(
          {
            message:
              "Não é possível alterar status de uma OS finalizada/entregue. Reabra a OS primeiro.",
          },
          { status: 400 }
        );
      }
      if (error.message === "MESMO_STATUS") {
        return NextResponse.json(
          { message: "Escolha um status diferente do atual." },
          { status: 400 }
        );
      }
      if (error.message === "CONCORRENCIA_DETECTADA") {
        return NextResponse.json(
          {
            message:
              "O status desta OS foi alterado simultaneamente por outro usuário. Recarregue a página.",
          },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { message: "Erro ao alterar status da OS." },
      { status: 500 }
    );
  }
}

