/**
 * @file route.ts
 * @description Endpoint de integração da Ordem de Serviço com o Estoque Técnico (`/api/ordens/[id]/pecas-tecnicas`).
 * Permite buscar peças disponíveis para vincular à OS (GET) com flag de já vinculada (`alreadyActive`),
 * e realizar a reserva formal com controle de versão otimista e idempotência (POST).
 */

import {
  getTechnicalPartById,
  listTechnicalParts,
  listTechnicalPartsForOrder,
  reserveTechnicalPartForOrder,
} from "@/lib/estoqueTecnico";
import { validationError } from "@/lib/estoqueTecnico/errors";
import {
  assertAllowedKeys,
  requireBoolean,
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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Valida e sanitiza o payload JSON de reserva de peça técnica para a OS.
 * @param value - Objeto bruto recebido na requisição
 * @returns Objeto com technicalPartId, technicalPartVersion, quantity e confirmReplaceLegacyPartsCost
 */
function reserveBody(value: unknown) {
  const body = requirePlainRecord(value);
  assertAllowedKeys(body, [
    "technicalPartId",
    "technicalPartVersion",
    "quantity",
    "confirmReplaceLegacyPartsCost",
  ]);
  return {
    technicalPartId: requireNonEmptyString(body.technicalPartId, "technicalPartId", 191),
    technicalPartVersion: requireVersion(body.technicalPartVersion, "technicalPartVersion"),
    quantity: requirePositiveInteger(body.quantity, "quantity"),
    confirmReplaceLegacyPartsCost:
      body.confirmReplaceLegacyPartsCost === undefined
        ? false
        : requireBoolean(body.confirmReplaceLegacyPartsCost, "confirmReplaceLegacyPartsCost"),
  };
}

/**
 * Manipulador GET para consultar peças técnicas disponíveis para vincular a uma OS específica.
 * @param request - Requisição HTTP com parâmetro de busca opcional `?q=`
 * @param context - Contexto da rota contendo `params.id` (ID da Ordem de Serviço)
 * @returns Resposta JSON contendo lista de peças com indicador `alreadyActive`
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");
    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) {
      if (key !== "q") {
        throw validationError("O parâmetro informado não é permitido.", { field: key });
      }
    }

    const vinculadas = listTechnicalPartsForOrder(id, {
      canViewFinancialData: false,
      states: ["RESERVED", "CONSUMED"],
    });
    const ativas = new Set(vinculadas.items.map((item) => item.technicalPartId));
    const q = params.get("q")?.trim();
    const result = listTechnicalParts(
      {
        ...(q ? { q } : {}),
        active: true,
        page: 1,
        pageSize: 20,
        sort: "name_asc",
      },
      { canViewFinancialData: false },
    );

    return jsonNoStore({
      items: result.items.map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          id: String(item.id),
          name: String(item.name),
          sku: item.sku === null ? null : String(item.sku || ""),
          defaultSalePrice: Number(item.defaultSalePrice || 0),
          quantityOnHand: item.quantityOnHand === null ? null : Number(item.quantityOnHand),
          quantityReserved: Number(item.quantityReserved || 0),
          quantityAvailable: item.quantityAvailable === null ? null : Number(item.quantityAvailable || 0),
          version: Number(item.version || 0),
          alreadyActive: ativas.has(String(item.id)),
        };
      }),
    });
  } catch (error) {
    return stockHttpError(error);
  }
}

/**
 * Manipulador POST para reservar uma peça técnica no estoque e vinculá-la à Ordem de Serviço.
 * Exige permissão `ordens.editar` e validação CSRF (Same-Origin).
 * Suporta idempotência e controle de concorrência por versão otimista.
 * @param request - Requisição HTTP contendo JSON de reserva (ID da peça, versão, quantidade)
 * @param context - Contexto da rota contendo `params.id` (ID da Ordem de Serviço)
 * @returns Resposta JSON com dados da reserva (Status 201 criado ou 200 replay idempotente)
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const { id } = await context.params;
    const input = reserveBody(await readJsonObject(request));
    const part = getTechnicalPartById(input.technicalPartId, {
      canViewFinancialData: false,
    }) as Record<string, unknown>;

    const result = reserveTechnicalPartForOrder(
      id,
      {
        ...input,
        unitPrice: Number(part.defaultSalePrice || 0),
      },
      commandContext(request, acesso.usuario),
    );

    return jsonNoStore(result, result.idempotentReplay ? 200 : 201);
  } catch (error) {
    return stockHttpError(error);
  }
}
