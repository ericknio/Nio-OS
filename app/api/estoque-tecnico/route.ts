import {
  createTechnicalPart,
  listTechnicalParts,
} from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  assertQueryKeys,
  canViewFinancialData,
  commandContext,
  jsonNoStore,
  queryBoolean,
  queryInteger,
  queryString,
  readJsonObject,
  requireSameOrigin,
  stockHttpError,
} from "@/lib/server/estoqueTecnicoHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ver");
    if (!acesso.ok) return acesso.response;

    const params = new URL(request.url).searchParams;
    assertQueryKeys(params, [
      "q",
      "active",
      "unlimited",
      "outOfStock",
      "belowMin",
      "category",
      "brand",
      "page",
      "pageSize",
      "sort",
    ]);
    const result = listTechnicalParts(
      {
        q: queryString(params, "q"),
        active: queryBoolean(params, "active"),
        unlimited: queryBoolean(params, "unlimited"),
        outOfStock: queryBoolean(params, "outOfStock"),
        belowMin: queryBoolean(params, "belowMin"),
        category: queryString(params, "category"),
        brand: queryString(params, "brand"),
        page: queryInteger(params, "page"),
        pageSize: queryInteger(params, "pageSize"),
        sort: queryString(params, "sort"),
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

export async function POST(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ajustar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const body = await readJsonObject(request);
    const result = createTechnicalPart(
      body,
      commandContext(request, acesso.usuario),
    );

    return jsonNoStore(result, result.idempotentReplay ? 200 : 201);
  } catch (error) {
    return stockHttpError(error);
  }
}
