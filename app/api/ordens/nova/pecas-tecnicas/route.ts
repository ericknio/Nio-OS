/**
 * @file route.ts
 * @description Endpoint para busca e auto-complete de peças do estoque técnico durante a abertura de nova OS.
 * Oculta dados de custos de compra (`canViewFinancialData: false`) e restringe aos itens ativos
 * com saldo em estoque disponível para reserva.
 */

import { listTechnicalParts, StockDomainError, toFutureHttpError } from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retorna as peças técnicas ativas cadastradas no estoque para inclusão na abertura de uma OS.
 * Exige permissão 'ordens.criar'.
 * 
 * @param request - Requisição HTTP com parâmetro de busca opcional `?q=`
 * @returns JSON com array sanitizado de peças (nome, SKU, modelo compatível, preço de venda e saldo disponível)
 */
export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("ordens.criar");
    if (!acesso.ok) return acesso.response;

    const q = new URL(request.url).searchParams.get("q")?.trim() || "";
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

    return NextResponse.json(
      {
        items: result.items.map((raw) => {
          const item = raw as Record<string, unknown>;
          return {
            id: String(item.id),
            name: String(item.name),
            sku: item.sku === null ? null : String(item.sku || ""),
            brand: item.brand === null ? null : String(item.brand || ""),
            compatibleModel:
              item.compatibleModel === null
                ? null
                : String(item.compatibleModel || ""),
            defaultSalePrice: Number(item.defaultSalePrice || 0),
            quantityOnHand:
              item.quantityOnHand === null ? null : Number(item.quantityOnHand),
            quantityReserved: Number(item.quantityReserved || 0),
            quantityAvailable:
              item.quantityAvailable === null
                ? null
                : Number(item.quantityAvailable || 0),
            version: Number(item.version || 0),
          };
        }),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof StockDomainError) {
      const mapped = toFutureHttpError(error);
      return NextResponse.json(mapped.body, {
        status: mapped.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json(
      { message: "Erro ao buscar peças técnicas." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
