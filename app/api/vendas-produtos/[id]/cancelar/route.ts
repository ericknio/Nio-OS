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

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function nomeOperador(usuario: UsuarioSessao) {
  return usuario.name?.trim() || usuario.username?.trim() || "Sistema";
}

function inteiro(valor: unknown) {
  const n = Number(valor ?? 0);

  if (!Number.isFinite(n)) return 0;

  return Math.max(0, Math.floor(n));
}

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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
