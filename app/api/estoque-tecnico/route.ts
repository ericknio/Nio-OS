/**
 * @file app/api/estoque-tecnico/route.ts
 * @description Rota para consulta e cadastro de peças no Estoque Técnico do Nio-OS.
 * 
 * Permite filtrar peças por categoria, marca, estoque baixo, indisponíveis ou ativas,
 * além de criar novas peças com controle rigoroso de custo, preço padrão e segurança CSRF/Same-Origin.
 */

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

/**
 * Endpoint GET /api/estoque-tecnico
 * 
 * Lista as peças técnicas disponíveis no estoque com paginação e múltiplos filtros.
 * Oculta dados de custo de compra caso o usuário não tenha permissão financeira.
 *
 * @param request - Requisição HTTP contendo filtros (?q=...&category=...&brand=...&page=...)
 * @returns Lista paginada de peças técnicas em JSON
 */
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

/**
 * Endpoint POST /api/estoque-tecnico
 * 
 * Cadastra uma nova peça técnica no estoque da assistência técnica.
 * Exige permissão 'estoque.ajustar', validação de origem Same-Origin e suporte à idempotência.
 *
 * @param request - Requisição HTTP com os dados da peça (nome, SKU, quantidade, custo, preço de venda)
 * @returns Objeto da peça criada (HTTP 201) ou resposta idempotente (HTTP 200)
 */
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
