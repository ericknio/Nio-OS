/**
 * @file route.ts
 * @description Endpoint para consulta e despacho administrativo de uma Peça Técnica (`/api/estoque-tecnico/[id]`).
 * Permite obter dados cadastrais e de estoque com mascaramento financeiro (GET),
 * e executar mutações de ciclo de vida (atualização de metadados, inativação, reativação, controle de saldo) via PATCH.
 */

import {
  changeTechnicalPartToControlled,
  changeTechnicalPartToUnlimited,
  deactivateTechnicalPart,
  getTechnicalPartById,
  reactivateTechnicalPart,
  updateTechnicalPartMetadata,
} from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  canViewFinancialData,
  commandContext,
  dispatchBody,
  jsonNoStore,
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
 * Manipulador GET para obter os detalhes de uma peça técnica específica.
 * Exige permissão `estoque.ver`. Aplica filtro de visibilidade financeira (custos/margem).
 * @param _request - Requisição HTTP
 * @param context - Contexto contendo `params.id` da peça técnica
 * @returns Resposta JSON com dados da peça técnica
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ver");
    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const part = getTechnicalPartById(id, {
      canViewFinancialData: canViewFinancialData(acesso.usuario),
    });

    return jsonNoStore(part);
  } catch (error) {
    return stockHttpError(error);
  }
}

/**
 * Manipulador PATCH para despachar operações administrativas na peça técnica.
 * Suporta as operações: `UPDATE_METADATA`, `DEACTIVATE`, `REACTIVATE`, `TO_CONTROLLED` e `TO_UNLIMITED`.
 * Exige permissão `estoque.ajustar` e validação CSRF (Same-Origin).
 * @param request - Requisição HTTP com JSON contento `operation` e `command`
 * @param context - Contexto contendo `params.id` da peça técnica
 * @returns Resposta JSON com a peça técnica atualizada
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ajustar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const { id } = await context.params;
    const { operation, command } = dispatchBody(await readJsonObject(request));
    const ctx = commandContext(request, acesso.usuario);

    const handlers = {
      UPDATE_METADATA: () => updateTechnicalPartMetadata(id, command, ctx),
      DEACTIVATE: () => deactivateTechnicalPart(id, command, ctx),
      REACTIVATE: () => reactivateTechnicalPart(id, command, ctx),
      TO_CONTROLLED: () => changeTechnicalPartToControlled(id, command, ctx),
      TO_UNLIMITED: () => changeTechnicalPartToUnlimited(id, command, ctx),
    } as const;

    const handler = handlers[operation as keyof typeof handlers];
    if (!handler) {
      throw validationError("A operação administrativa é inválida.", {
        field: "operation",
      });
    }

    return jsonNoStore(handler());
  } catch (error) {
    return stockHttpError(error);
  }
}
