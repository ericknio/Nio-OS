/**
 * @file route.ts
 * @description Endpoint para cancelamento transacional e estorno de vendas de balcão (PDV).
 *
 * Regras de Negócio e Concorrência:
 * 1. Módulo & Permissão: Requer módulo de produtos ativo e permissão `vendas.cancelar`.
 * 2. Prevenção de Duplo Cancelamento (Idempotência/Lock Otimista):
 *    - Atualiza a venda condicionalmente de `CONCLUIDA` para `CANCELADA` via `updateMany`. Se `count !== 1`, aborta imediatamente.
 *    - Verifica se já existem movimentações do tipo `CANCELAMENTO_VENDA`.
 * 3. Reversão Inteligente de Estoque:
 *    - Para itens com controle físico ativo (`stockQuantity !== null`), devolve o saldo via incremento atômico (`increment`).
 *    - Trata adequadamente itens originalmente ilimitados ou produtos migrados para modo ilimitado sem quebrar o inventário.
 *    - Registra rastreabilidade detalhada na tabela `StockMovement` com tipo `CANCELAMENTO_VENDA`, motivos e operador responsável.
 * 4. Sanitização RBAC: Mascara dados de custos e lucros da resposta se o usuário não tiver permissão financeira.
 */

import { NextResponse } from "next/server";
import { ProductSaleStatus, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tipagem do usuário autenticado no sistema.
 */
type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

/**
 * Contexto da rota contendo o ID da venda nos parâmetros dinâmicos.
 */
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Sanitiza valores de entrada convertendo-os em string sem espaços laterais.
 *
 * @param valor - Valor a ser sanitizado
 * @returns String tratada
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Retorna o nome amigável do operador para auditoria no log de cancelamento.
 *
 * @param usuario - Objeto do usuário logado
 * @returns Nome do operador ou "Sistema"
 */
function nomeOperador(usuario: UsuarioSessao) {
  return usuario.name?.trim() || usuario.username?.trim() || "Sistema";
}

/**
 * Converte um valor arbitrário em número inteiro não-negativo.
 *
 * @param valor - Dado de entrada
 * @returns Inteiro >= 0
 */
function inteiro(valor: unknown) {
  const n = Number(valor ?? 0);

  if (!Number.isFinite(n)) return 0;

  return Math.max(0, Math.floor(n));
}

/**
 * Converte um valor arbitrário em número finito com fallback para 0.
 *
 * @param valor - Valor a converter
 * @returns Número válido ou 0
 */
function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Mascara campos financeiros sensíveis (impostos, custos e lucros) da venda cancelada
 * caso o operador logado não possua autorização de visualização financeira.
 *
 * @param venda - Objeto da venda retornado pelo Prisma
 * @param financeiroSensivelLiberado - Se o usuário tem permissão financeira
 * @returns Objeto protegido para retorno na resposta HTTP
 */
function protegerVenda(venda: any, financeiroSensivelLiberado: boolean) {
  if (financeiroSensivelLiberado) {
    return {
      ...venda,
      subtotalAmount: numero(venda.subtotalAmount),
      discount: numero(venda.discount),
      taxAmount: numero(venda.taxAmount),
      costAmount: numero(venda.costAmount),
      profitAmount: numero(venda.profitAmount),
      totalAmount: numero(venda.totalAmount),
      items: Array.isArray(venda.items)
        ? venda.items.map((item: any) => ({
            ...item,
            unitPrice: numero(item.unitPrice),
            unitCost: numero(item.unitCost),
            taxPercent: numero(item.taxPercent),
            subtotalAmount: numero(item.subtotalAmount),
            taxAmount: numero(item.taxAmount),
            costAmount: numero(item.costAmount),
            profitAmount: numero(item.profitAmount),
            totalAmount: numero(item.totalAmount),
          }))
        : [],
    };
  }

  return {
    ...venda,
    subtotalAmount: numero(venda.subtotalAmount),
    discount: numero(venda.discount),
    taxAmount: null,
    costAmount: null,
    profitAmount: null,
    totalAmount: numero(venda.totalAmount),
    items: Array.isArray(venda.items)
      ? venda.items.map((item: any) => ({
          ...item,
          unitPrice: numero(item.unitPrice),
          unitCost: null,
          taxPercent: null,
          subtotalAmount: numero(item.subtotalAmount),
          taxAmount: null,
          costAmount: null,
          profitAmount: null,
          totalAmount: numero(item.totalAmount),
        }))
      : [],
  };
}

/**
 * Handler POST para cancelamento atômico de uma venda de produtos e devolução de estoque.
 *
 * @param request - Requisição HTTP com JSON contendo `reason` ou `motivo`
 * @param context - Contexto com o parâmetro dinâmico `id` da venda
 * @returns JSON com a confirmação de cancelamento e a quantidade de itens estornados
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi("vendas.cancelar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const motivo = texto(body.reason || body.motivo);
    const operador = nomeOperador(acesso.usuario);

    if (!motivo) {
      return NextResponse.json(
        { message: "Informe o motivo do cancelamento." },
        { status: 400 }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const venda = await tx.productSale.findUnique({
        where: {
          id,
        },
        include: {
          items: true,
          stockMovements: {
            where: {
              type: {
                in: [
                  StockMovementType.VENDA,
                  StockMovementType.CANCELAMENTO_VENDA,
                ],
              },
            },
          },
        },
      });

      if (!venda) {
        throw new Error("VENDA_NAO_ENCONTRADA");
      }

      if (venda.status === ProductSaleStatus.CANCELADA) {
        throw new Error("VENDA_JA_CANCELADA");
      }

      const movimentosVenda = venda.stockMovements.filter(
        (movimento) => movimento.type === StockMovementType.VENDA
      );
      const jaTemMovimentoCancelamento = venda.stockMovements.some(
        (movimento) =>
          movimento.type === StockMovementType.CANCELAMENTO_VENDA
      );

      if (jaTemMovimentoCancelamento) {
        throw new Error("VENDA_JA_CANCELADA");
      }

      const reservaCancelamento = await tx.productSale.updateMany({
        where: {
          id: venda.id,
          status: ProductSaleStatus.CONCLUIDA,
        },
        data: {
          status: ProductSaleStatus.CANCELADA,
        },
      });

      if (reservaCancelamento.count !== 1) {
        throw new Error("VENDA_JA_CANCELADA");
      }

      const movimentosEstoque = [];

      for (const movimentoVenda of movimentosVenda) {
        const produto = await tx.product.findUnique({
          where: {
            id: movimentoVenda.productId,
          },
        });

        if (!produto) continue;

        const quantidadeDevolver = Math.abs(inteiro(movimentoVenda.quantity));

        if (quantidadeDevolver <= 0) continue;

        const vendaOriginalmenteIlimitada =
          movimentoVenda.previousStock === null &&
          movimentoVenda.newStock === null;
        const vendaOriginalmenteControlada =
          movimentoVenda.previousStock !== null &&
          movimentoVenda.newStock !== null;

        if (!vendaOriginalmenteIlimitada && !vendaOriginalmenteControlada) {
          throw new Error("INVALID_ORIGINAL_STOCK_MOVEMENT");
        }

        let previousStock: number | null = produto.stockQuantity;
        let newStock: number | null = produto.stockQuantity;
        let observacaoEstoque = "";

        if (vendaOriginalmenteIlimitada) {
          observacaoEstoque =
            "A venda original não movimentou estoque físico; nenhum saldo foi devolvido.";
        } else if (produto.stockQuantity === null) {
          previousStock = null;
          newStock = null;
          observacaoEstoque =
            "A venda original movimentou estoque, mas o produto está atualmente em modo ilimitado; nenhum saldo foi materializado.";
        } else {
          const devolucao = await tx.product.updateMany({
            where: {
              id: produto.id,
              stockQuantity: {
                not: null,
              },
            },
            data: {
              stockQuantity: {
                increment: quantidadeDevolver,
              },
            },
          });

          const produtoDepois = await tx.product.findUnique({
            where: {
              id: produto.id,
            },
            select: {
              stockQuantity: true,
            },
          });

          if (!produtoDepois) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          if (devolucao.count === 0 && produtoDepois.stockQuantity === null) {
            previousStock = null;
            newStock = null;
            observacaoEstoque =
              "A venda original movimentou estoque, mas o produto está atualmente em modo ilimitado; nenhum saldo foi materializado.";
          } else if (
            devolucao.count === 1 &&
            produtoDepois.stockQuantity !== null
          ) {
            newStock = produtoDepois.stockQuantity;
            previousStock = newStock - quantidadeDevolver;
          } else {
            throw new Error("INVALID_CONDITIONAL_STOCK_RETURN");
          }
        }

        const movimentoCancelamento = await tx.stockMovement.create({
          data: {
            productId: produto.id,
            saleId: venda.id,
            type: StockMovementType.CANCELAMENTO_VENDA,
            quantity: quantidadeDevolver,
            previousStock,
            newStock,
            reason: `Cancelamento da venda Nº ${String(
              venda.saleNumber
            ).padStart(3, "0")}. Motivo: ${motivo}. ${observacaoEstoque} Operador: ${operador}`,
            userName: operador,
          },
        });

        movimentosEstoque.push(movimentoCancelamento);
      }

      const vendaCancelada = await tx.productSale.update({
        where: {
          id: venda.id,
        },
        data: {
          note: venda.note
            ? `${venda.note}\n\nCancelada por ${operador}. Motivo: ${motivo}`
            : `Cancelada por ${operador}. Motivo: ${motivo}`,
        },
        include: {
          customer: true,
          items: true,
        },
      });

      return {
        venda: vendaCancelada,
        estoqueDevolvido: movimentosEstoque.length,
      };
    });

    return NextResponse.json({
      message: "Venda cancelada com sucesso.",
      venda: protegerVenda(resultado.venda, financeiroSensivelLiberado),
      estoqueDevolvido: resultado.estoqueDevolvido,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "VENDA_NAO_ENCONTRADA") {
        return NextResponse.json(
          { message: "Venda não encontrada." },
          { status: 404 }
        );
      }

      if (error.message === "VENDA_JA_CANCELADA") {
        return NextResponse.json(
          { message: "Esta venda já está cancelada." },
          { status: 400 }
        );
      }
    }

    console.error("Erro ao cancelar venda de produto:", error);

    return NextResponse.json(
      { message: "Erro ao cancelar venda de produto." },
      { status: 500 }
    );
  }
}
