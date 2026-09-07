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

function releaseBody(value: unknown) {
  const body = requirePlainRecord(value);
  assertAllowedKeys(body, ["technicalPartVersion", "expectedQuantity", "reason"]);
  return {
    technicalPartVersion: requireVersion(body.technicalPartVersion, "technicalPartVersion"),
    expectedQuantity: requirePositiveInteger(body.expectedQuantity, "expectedQuantity"),
    reason: requireNonEmptyString(body.reason, "reason", 1000),
  };
}

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
