import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import { toFutureHttpError } from "@/lib/estoqueTecnico/errors";
import { reverseConsumedTechnicalPartManually } from "@/lib/estoqueTecnico/orderReversalService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

function json(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(extraHeaders || {}),
    },
  });
}

function origemPermitida(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);

    if (originUrl.origin === requestUrl.origin) return true;

    const hostHeader = (
      request.headers.get("x-forwarded-host") || request.headers.get("host")
    )
      ?.trim()
      .toLowerCase();
    if (hostHeader && originUrl.host.toLowerCase() === hostHeader) {
      return true;
    }

    const isOriginLocal =
      originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
    const isRequestLocal =
      requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
    if (isOriginLocal && isRequestLocal) {
      return true;
    }

    const isOriginLan =
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(originUrl.hostname);
    const isRequestLan =
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(requestUrl.hostname) ||
      isRequestLocal;
    if (isOriginLan && isRequestLan) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("Idempotency-Key")?.trim() || "";
  return UUID_PATTERN.test(value) ? value : null;
}

function validarPayload(body: Record<string, unknown>) {
  const allowed = new Set([
    "technicalPartVersion",
    "expectedQuantity",
    "physicalReturnConfirmed",
    "confirmation",
    "reason",
  ]);

  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return "O payload contém campos não permitidos para estorno.";
  }

  if (
    !Number.isInteger(body.technicalPartVersion) ||
    Number(body.technicalPartVersion) < 0
  ) {
    return "A versão da peça técnica é inválida.";
  }

  if (
    !Number.isInteger(body.expectedQuantity) ||
    Number(body.expectedQuantity) <= 0
  ) {
    return "A quantidade esperada é inválida.";
  }

  if (body.physicalReturnConfirmed !== true) {
    return "Confirme que a peça retornou fisicamente ao estoque.";
  }

  if (body.confirmation !== true) {
    return "Confirme o estorno manual da peça.";
  }

  if (typeof body.reason !== "string") {
    return "Informe o motivo do estorno.";
  }

  const reason = body.reason.trim();
  if (reason.length < 10) return "Descreva melhor o motivo do estorno.";
  if (reason.length > 1000) {
    return "O motivo deve ter no máximo 1000 caracteres.";
  }

  return null;
}

function estoqueError(error: unknown) {
  const mapped = toFutureHttpError(error);
  return json(
    mapped.body,
    mapped.status,
    mapped.body.retryable ? { "Retry-After": "1" } : undefined,
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");
    if (!acesso.ok) return acesso.response;

    if (!origemPermitida(request)) {
      return json(
        {
          code: "PERMISSION_DENIED",
          message: "Origem da requisição não permitida.",
        },
        403,
      );
    }

    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: "Content-Type application/json é obrigatório.",
        },
        422,
      );
    }

    const key = idempotencyKey(request);
    if (!key) {
      return json(
        {
          code: "IDEMPOTENCY_KEY_INVALID",
          message: "Idempotency-Key UUID válido é obrigatório.",
        },
        422,
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos para estornar a peça.",
        },
        422,
      );
    }

    const validationMessage = validarPayload(body);
    if (validationMessage) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: validationMessage,
        },
        422,
      );
    }

    const { id, itemId } = await context.params;

    // Segurança de recurso: itemId precisa pertencer à OS presente na própria URL.
    // A mutação real continua sendo executada exclusivamente pelo core transacional.
    const scopedItem = await prisma.serviceOrderPart.findFirst({
      where: {
        id: itemId,
        serviceOrderId: id,
      },
      select: {
        id: true,
      },
    });

    if (!scopedItem) {
      return json(
        {
          code: "SERVICE_ORDER_PART_NOT_FOUND",
          message: "O item técnico não foi encontrado nesta OS.",
        },
        404,
      );
    }

    try {
      const result = reverseConsumedTechnicalPartManually(
        itemId,
        {
          technicalPartVersion: Number(body.technicalPartVersion),
          expectedQuantity: Number(body.expectedQuantity),
          physicalReturnConfirmed: true,
          confirmation: true,
          reason: String(body.reason).trim(),
        },
        {
          operatorId: acesso.usuario.id || null,
          operatorName: nomeOperador(acesso.usuario),
          canViewFinancialData:
            usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario),
          idempotencyKey: key,
        },
      );

      return json(result);
    } catch (error) {
      return estoqueError(error);
    }
  } catch {
    return json(
      {
        code: "INTERNAL_ERROR",
        message: "Erro ao estornar peça técnica.",
      },
      500,
    );
  }
}
