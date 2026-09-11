/**
 * @file route.ts
 * @description Endpoint de histórico de movimentações e lançamentos físicos de estoque (`/api/estoque-tecnico/[id]/movimentos`).
 * Permite listar a trilha auditável de entradas, saídas, reservas e estornos de uma peça (GET),
 * e registrar novas movimentações manuais (entradas de compra, ajustes positivos e negativos) via POST.
 */

import {
  listTechnicalPartMovements,
  registerNegativeAdjustment,
  registerPositiveAdjustment,
  registerTechnicalPartEntry,
} from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  assertQueryKeys,
  canViewFinancialData,
  commandContext,
  dispatchBody,
  jsonNoStore,
  queryInteger,
  readJsonObject,
  requireSameOrigin,
  stockHttpError,
} from "@/lib/server/estoqueTecnicoHttp";
import { validationError } from "@/lib/estoqueTecnico/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Manipulador GET para listar as movimentações de estoque de uma peça técnica.
 * Suporta paginação (`page`, `pageSize`) e ofuscação de custos caso o usuário não possua permissão financeira.
 * @param request - Requisição HTTP com query params opcionais
 * @param context - Contexto contendo `params.id` da peça técnica
 * @returns Resposta JSON paginada com histórico de movimentos
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ver");
    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    assertQueryKeys(params, ["page", "pageSize"]);
    const result = listTechnicalPartMovements(
      id,
      {
        page: queryInteger(params, "page"),
        pageSize: queryInteger(params, "pageSize"),
      },
      {
        canViewFinancialData: canViewFinancialData(acesso.usuario),
      },
    );

    return jsonNoStore(result);
  } catch (error) {
    return stockHttpError(error);
  }
}

/**
 * Manipulador POST para registrar movimentações manuais de estoque na peça técnica.
 * Suporta as operações: `ENTRY` (entrada de nova compra/lote), `POSITIVE_ADJUSTMENT` (ajuste inventário +)
 * e `NEGATIVE_ADJUSTMENT` (ajuste inventário -/perda).
 * Exige permissão `estoque.ajustar` e validação CSRF (Same-Origin).
 * @param request - Requisição HTTP contendo JSON com `operation` e `command`
 * @param context - Contexto contendo `params.id` da peça técnica
 * @returns Resposta JSON com a movimentação registrada
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ajustar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const { id } = await context.params;
    const { operation, command } = dispatchBody(await readJsonObject(request));
    const ctx = commandContext(request, acesso.usuario);

    const handlers = {
      ENTRY: () => registerTechnicalPartEntry(id, command, ctx),
      POSITIVE_ADJUSTMENT: () => registerPositiveAdjustment(id, command, ctx),
      NEGATIVE_ADJUSTMENT: () => registerNegativeAdjustment(id, command, ctx),
    } as const;

    const handler = handlers[operation as keyof typeof handlers];
    if (!handler) {
      throw validationError("A operação de estoque é inválida.", {
        field: "operation",
      });
    }

    return jsonNoStore(handler());
  } catch (error) {
    return stockHttpError(error);
  }
}
