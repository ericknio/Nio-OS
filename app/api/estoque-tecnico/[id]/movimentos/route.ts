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
