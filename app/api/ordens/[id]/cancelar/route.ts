import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import { requireIdempotencyKey } from "@/lib/estoqueTecnico/validation";
import { cancelServiceOrderAndReleaseReservedTechnicalParts } from "@/lib/estoqueTecnico";
import { toFutureHttpError } from "@/lib/estoqueTecnico/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

const STATUS_CANCELAVEIS = new Set<string>([
  OrderStatus.RECEBIDO,
  OrderStatus.EM_ANALISE,
  OrderStatus.AGUARDANDO_PECA,
  OrderStatus.EM_REPARO,
  OrderStatus.PRONTO,
  OrderStatus.ENTREGUE,
]);

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

function ocultarDadosPagamentoDaOrdem(ordem: any, mostrarPagamentos: boolean) {
  if (mostrarPagamentos) return ordem;

  return {
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
}

function respostaJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function respostaErroEstoque(error: unknown) {
  const mapped = toFutureHttpError(error);
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
  };

  if (mapped.body.retryable) {
    headers["Retry-After"] = "1";
  }

  return NextResponse.json(mapped.body, {
    status: mapped.status,
    headers,
  });
}

function validarPayloadCancelamento(body: Record<string, unknown>) {
  const permitidos = new Set([
    "motivo",
    "expectedCurrentStatus",
    "confirmation",
    "returnConsumedParts",
  ]);

  if (Object.keys(body).some((key) => !permitidos.has(key))) {
    return "O payload contém campos não permitidos para cancelar a OS.";
  }

  if (typeof body.motivo !== "string") {
    return "Informe o motivo do cancelamento.";
  }

  const motivo = body.motivo.trim();

  if (!motivo) {
    return "Informe o motivo do cancelamento.";
  }

  if (motivo.length < 10) {
    return "Descreva melhor o motivo do cancelamento.";
  }

  if (motivo.length > 1000) {
    return "O motivo do cancelamento deve ter no máximo 1000 caracteres.";
  }

  if (
    typeof body.expectedCurrentStatus !== "string" ||
    !STATUS_CANCELAVEIS.has(body.expectedCurrentStatus)
  ) {
    return "Informe o status atual esperado da OS.";
  }

  if (body.confirmation !== true) {
    return "Confirme o cancelamento da OS.";
  }

  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.cancelar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const contentType = String(
      request.headers.get("content-type") || "",
    ).toLowerCase();

    if (!contentType.startsWith("application/json")) {
      return respostaJson(
        {
          code: "VALIDATION_ERROR",
          message: "Content-Type application/json é obrigatório.",
        },
        422,
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respostaJson(
        {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos para cancelar a OS.",
        },
        422,
      );
    }

    const payloadError = validarPayloadCancelamento(body);

    if (payloadError) {
      return respostaJson(
        {
          code: "VALIDATION_ERROR",
          message: payloadError,
        },
        422,
      );
    }

    let idempotencyKey: string;

    try {
      idempotencyKey = requireIdempotencyKey(
        request.headers.get("Idempotency-Key"),
      );
    } catch (error) {
      const mapped = toFutureHttpError(error);

      return NextResponse.json(mapped.body, {
        status: 422,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const { id } = await context.params;
    const userName = nomeOperador(acesso.usuario);
    const motivo = String(body.motivo).trim();
    const expectedCurrentStatus = String(body.expectedCurrentStatus);

    const returnConsumedParts =
      body.returnConsumedParts !== undefined
        ? Boolean(body.returnConsumedParts)
        : true;

    let result;

    try {
      result = cancelServiceOrderAndReleaseReservedTechnicalParts(
        id,
        {
          expectedCurrentStatus,
          confirmation: true,
          reason: motivo,
          returnConsumedParts,
        },
        {
          operatorId: acesso.usuario.id || null,
          operatorName: userName,
          canViewFinancialData:
            usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario),
          idempotencyKey,
        },
      );
    } catch (error) {
      return respostaErroEstoque(error);
    }

    // O commit técnico já ocorreu. Esta leitura serve apenas para preservar
    // o contrato histórico da rota; falha aqui nunca deve ser reportada como rollback.
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
          ocultarDadosPagamentoDaOrdem(
            ordemCompleta,
            podeVerDadosPagamento(acesso.usuario),
          ),
          { headers: { "Cache-Control": "no-store" } },
        );
      }
    } catch {
      // O cancelamento já foi confirmado na transação SQLite.
    }

    return NextResponse.json(
      {
        ...result,
        reloadOrder: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return respostaJson(
      {
        code: "INTERNAL_ERROR",
        message: "Erro ao cancelar ordem de serviço.",
      },
      500,
    );
  }
}
