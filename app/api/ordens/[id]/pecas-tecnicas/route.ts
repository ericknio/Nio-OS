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
