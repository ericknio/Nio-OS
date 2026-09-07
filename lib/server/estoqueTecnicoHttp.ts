import { NextResponse } from "next/server";
import {
  toFutureHttpError,
} from "@/lib/estoqueTecnico";
import {
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import {
  requireIdempotencyKey,
} from "@/lib/estoqueTecnico/validation";
import {
  stockError,
  validationError,
} from "@/lib/estoqueTecnico/errors";

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

export function jsonNoStore(
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

export function stockHttpError(error: unknown) {
  const mapped = toFutureHttpError(error);
  return jsonNoStore(
    mapped.body,
    mapped.status,
    mapped.body.retryable ? { "Retry-After": "1" } : undefined,
  );
}

export function sameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);

    // 1. Origem idêntica
    if (originUrl.origin === requestUrl.origin) return true;

    // 2. Bate com o header Host / X-Forwarded-Host
    const hostHeader = (
      request.headers.get("x-forwarded-host") || request.headers.get("host")
    )
      ?.trim()
      .toLowerCase();
    if (hostHeader && originUrl.host.toLowerCase() === hostHeader) {
      return true;
    }

    // 3. Ambas origens são loopback local (127.0.0.1 ou localhost)
    const isOriginLocal =
      originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
    const isRequestLocal =
      requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
    if (isOriginLocal && isRequestLocal) {
      return true;
    }

    // 4. IP de rede local privada (LAN)
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

export function requireSameOrigin(request: Request): void {
  if (!sameOriginOrNoOrigin(request)) {
    throw stockError(
      "PERMISSION_DENIED",
      403,
      "Origem da requisição não permitida.",
    );
  }
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw validationError("Content-Type application/json é obrigatório.");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError("Informe um objeto JSON válido.");
  }

  return body as Record<string, unknown>;
}

export function operatorName(
  usuario: UsuarioSessao | null | undefined,
): string {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

export function canViewFinancialData(
  usuario: UsuarioSessao | null | undefined,
): boolean {
  return usuarioPodeVerDadosFinanceirosSensiveis(usuario);
}

export function commandContext(
  request: Request,
  usuario: UsuarioSessao,
) {
  return {
    operatorId: usuario.id || null,
    operatorName: operatorName(usuario),
    canViewFinancialData: canViewFinancialData(usuario),
    idempotencyKey: requireIdempotencyKey(
      request.headers.get("Idempotency-Key"),
    ),
  };
}

export function dispatchBody(
  body: Record<string, unknown>,
): { operation: string; command: unknown } {
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !keys.includes("operation") ||
    !keys.includes("command") ||
    typeof body.operation !== "string" ||
    typeof body.command !== "object" ||
    body.command === null ||
    Array.isArray(body.command)
  ) {
    throw validationError(
      "Informe somente operation e command com valores válidos.",
    );
  }

  return {
    operation: body.operation,
    command: body.command,
  };
}

export function assertQueryKeys(
  params: URLSearchParams,
  allowed: readonly string[],
): void {
  const allowlist = new Set(allowed);
  for (const key of params.keys()) {
    if (!allowlist.has(key)) {
      throw validationError("O parâmetro informado não é permitido.", {
        field: key,
      });
    }
  }
}

export function queryBoolean(
  params: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw validationError("Informe true ou false.", { field: key });
}

export function queryInteger(
  params: URLSearchParams,
  key: string,
): number | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  if (!/^[0-9]+$/.test(value)) {
    throw validationError("Informe um número inteiro válido.", { field: key });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw validationError("Informe um número inteiro válido.", { field: key });
  }
  return parsed;
}

export function queryString(
  params: URLSearchParams,
  key: string,
): string | undefined {
  const value = params.get(key);
  return value === null ? undefined : value;
}
