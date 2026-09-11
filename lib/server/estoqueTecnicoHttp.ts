/**
 * @file lib/server/estoqueTecnicoHttp.ts
 * @description Adaptador de transporte HTTP e validações de segurança para o Módulo de Estoque Técnico.
 * 
 * Responsabilidades:
 * - Proteção contra CSRF via `requireSameOrigin` com suporte flexível a redes locais (LAN) e loopback.
 * - Leitura estrita de corpos JSON e cabeçalhos de idempotência (`Idempotency-Key`).
 * - Sanitização e validação de parâmetros de consulta (query params com allowlist).
 * - Mapeamento e serialização de erros de domínio para códigos de status HTTP apropriados com `Cache-Control: no-store`.
 */

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

/**
 * Cria uma resposta NextResponse JSON garantindo a desativação de cache do navegador (`Cache-Control: no-store`).
 * 
 * @param body Objeto serializável a ser retornado no corpo.
 * @param status Código de status HTTP (padrão 200).
 * @param extraHeaders Cabeçalhos adicionais opcionais.
 */
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

/**
 * Converte qualquer erro gerado pela camada de domínio do estoque técnico em uma resposta HTTP segura e tipada.
 * Se o erro for temporário/concorrencial (retryable), injeta o cabeçalho `Retry-After: 1`.
 */
export function stockHttpError(error: unknown) {
  const mapped = toFutureHttpError(error);
  return jsonNoStore(
    mapped.body,
    mapped.status,
    mapped.body.retryable ? { "Retry-After": "1" } : undefined,
  );
}

/**
 * Valida se a origem da requisição pertence ao mesmo domínio ou à rede local permitida (LAN / Localhost).
 * Previne ataques de CSRF (Cross-Site Request Forgery) em instalações em rede local de assistência técnica.
 */
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

/**
 * Garante que a requisição seja originada do mesmo host ou LAN confiável, lançando erro 403 caso contrário.
 */
export function requireSameOrigin(request: Request): void {
  if (!sameOriginOrNoOrigin(request)) {
    throw stockError(
      "PERMISSION_DENIED",
      403,
      "Origem da requisição não permitida.",
    );
  }
}

/**
 * Lê e valida que o corpo da requisição HTTP possui formato JSON válido.
 */
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

/**
 * Constrói o contexto de execução de um comando de estoque a partir da requisição e da sessão do usuário.
 * Extrai o ID do operador, nome, permissões financeiras e chave de idempotência do cabeçalho `Idempotency-Key`.
 */
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

/**
 * Valida o envelope padrão de envio de comandos `{ operation, command }`.
 */
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
