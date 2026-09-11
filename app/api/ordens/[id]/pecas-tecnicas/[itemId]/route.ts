/**
 * @file route.ts
 * @description Manipulador de operações em itens individuais de peças técnicas vinculadas a uma OS (`/api/ordens/[id]/pecas-tecnicas/[itemId]`).
 * Suporta alteração de quantidade reservada (PATCH) e cancelamento/liberação da reserva de volta ao estoque (DELETE),
 * ambos protegidos por verificação de posse do item, concorrência otimista e validação de origem (Same-Origin).
 */

import {
  changeReservedTechnicalPartQuantity,
  listTechnicalPartsForOrder,
  releaseTechnicalPartFromOrder,
} from "@/lib/estoqueTecnico";
import { stockError } from "@/lib/estoqueTecnico/errors";
import {
  assertAllowedKeys,
  requireNonEmptyString,
  requirePlainRecord,
  requirePositiveInteger,
  requireVersion,
} from "@/lib/estoqueTecnico/validation";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  commandContext,
  jsonNoStore,
  readJsonObject,
  requireSameOrigin,
  stockHttpError,
} from "@/lib/server/estoqueTecnicoHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

/**
 * Garante que o item técnico requisitado realmente pertence à Ordem de Serviço informada na rota.
 * @param serviceOrderId - ID da Ordem de Serviço
 * @param itemId - ID do registro ServiceOrderPart
 * @returns Registro do item técnico caso pertença à OS
 * @throws stockError 404 se o item não pertencer à OS ou não existir
 */
function requireOwnedItem(serviceOrderId: string, itemId: string) {
  const result = listTechnicalPartsForOrder(serviceOrderId, {
    canViewFinancialData: false,
    states: ["RESERVED", "CONSUMED", "RELEASED", "REVERSED"],
  });
  const item = result.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw stockError(
      "SERVICE_ORDER_PART_NOT_FOUND",
      404,
      "O item técnico não foi encontrado nesta ordem de serviço.",
    );
  }
  return item;
}

/**
 * Valida o payload de alteração de quantidade da peça técnica reservada.
 * @param value - Objeto bruto recebido na requisição
 * @returns Objeto sanitizado com technicalPartVersion, expectedQuantity, newQuantity e reason
 */
function changeBody(value: unknown) {
  const body = requirePlainRecord(value);
  assertAllowedKeys(body, [
    "technicalPartVersion",
    "expectedQuantity",
    "newQuantity",
    "reason",
  ]);
  return {
    technicalPartVersion: requireVersion(body.technicalPartVersion, "technicalPartVersion"),
    expectedQuantity: requirePositiveInteger(body.expectedQuantity, "expectedQuantity"),
    newQuantity: requirePositiveInteger(body.newQuantity, "newQuantity"),
    reason: requireNonEmptyString(body.reason, "reason", 1000),
  };
}

/**
 * Valida o payload de liberação/cancelamento da reserva de peça técnica.
 * @param value - Objeto bruto recebido na requisição
 * @returns Objeto sanitizado com technicalPartVersion, expectedQuantity e reason
 */
function releaseBody(value: unknown) {
  const body = requirePlainRecord(value);
  assertAllowedKeys(body, ["technicalPartVersion", "expectedQuantity", "reason"]);
  return {
    technicalPartVersion: requireVersion(body.technicalPartVersion, "technicalPartVersion"),
    expectedQuantity: requirePositiveInteger(body.expectedQuantity, "expectedQuantity"),
    reason: requireNonEmptyString(body.reason, "reason", 1000),
  };
}

/**
 * Manipulador PATCH para alterar a quantidade de uma peça técnica reservada na Ordem de Serviço.
 * Ajusta o saldo físico e reservado de acordo com a variação positiva ou negativa.
 * @param request - Requisição HTTP contendo JSON com nova quantidade e motivo
 * @param context - Contexto contendo `id` da OS e `itemId` do item
 * @returns Resposta JSON com o item atualizado
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");
    if (!acesso.ok) return acesso.response;
    requireSameOrigin(request);

    const { id, itemId } = await context.params;
    requireOwnedItem(id, itemId);
    const result = changeReservedTechnicalPartQuantity(
      itemId,
      changeBody(await readJsonObject(request)),
      commandContext(request, acesso.usuario),
    );
    return jsonNoStore(result);
  } catch (error) {
    return stockHttpError(error);
  }
}

/**
 * Manipulador DELETE para liberar/cancelar uma peça técnica reservada na Ordem de Serviço.
 * Estorna a quantidade reservada de volta ao saldo disponível do estoque técnico.
 * @param request - Requisição HTTP contendo JSON com motivo do cancelamento
 * @param context - Contexto contendo `id` da OS e `itemId` do item
 * @returns Resposta JSON com o item liberado
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");
    if (!acesso.ok) return acesso.response;
    requireSameOrigin(request);

    const { id, itemId } = await context.params;
    requireOwnedItem(id, itemId);
    const result = releaseTechnicalPartFromOrder(
      itemId,
      releaseBody(await readJsonObject(request)),
      commandContext(request, acesso.usuario),
    );
    return jsonNoStore(result);
  } catch (error) {
    return stockHttpError(error);
  }
}
