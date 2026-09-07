import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function texto(valor: unknown) {
  return String(valor || "").trim();
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi("produtos.excluir");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const confirmacao = texto(body.confirmacao).toUpperCase();

    if (confirmacao !== "EXCLUIR") {
      return NextResponse.json(
        {
          message:
            "Confirmação inválida. Digite EXCLUIR para remover definitivamente.",
        },
        { status: 400 }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const produto = await tx.product.findUnique({
        where: {
          id,
        },
        include: {
          saleItems: {
            select: {
              id: true,
              saleId: true,
            },
          },
        },
      });

      if (!produto) {
        throw new Error("PRODUTO_NAO_ENCONTRADO");
      }

      const saleIds = Array.from(
        new Set(produto.saleItems.map((item) => item.saleId).filter(Boolean))
      );

      const itensRemovidos = await tx.productSaleItem.deleteMany({
        where: {
          productId: id,
        },
      });

      let vendasApagadas = 0;
      let vendasRecalculadas = 0;

      for (const saleId of saleIds) {
        const itensRestantes = await tx.productSaleItem.findMany({
          where: {
            saleId,
          },
        });

        if (itensRestantes.length === 0) {
          await tx.productSale.delete({
            where: {
              id: saleId,
            },
          });

          vendasApagadas += 1;
          continue;
        }

        const subtotalAmount = itensRestantes.reduce(
          (total, item) => total + numero(item.subtotalAmount),
          0
        );

        const taxAmount = itensRestantes.reduce(
          (total, item) => total + numero(item.taxAmount),
          0
        );

        const costAmount = itensRestantes.reduce(
          (total, item) => total + numero(item.costAmount),
          0
        );

        const totalItens = itensRestantes.reduce(
          (total, item) => total + numero(item.totalAmount),
          0
        );

        const vendaAtual = await tx.productSale.findUnique({
          where: {
            id: saleId,
          },
        });

        const discount = numero(vendaAtual?.discount);
        const totalAmount = Math.max(0, totalItens - discount);
        const profitAmount = totalAmount - costAmount - taxAmount;

        await tx.productSale.update({
          where: {
            id: saleId,
          },
          data: {
            subtotalAmount,
            taxAmount,
            costAmount,
            profitAmount,
            totalAmount,
          },
        });

        vendasRecalculadas += 1;
      }

      await tx.product.delete({
        where: {
          id,
        },
      });

      return {
        produto: {
          id: produto.id,
          name: produto.name,
        },
        itensRemovidos: itensRemovidos.count,
        vendasApagadas,
        vendasRecalculadas,
      };
    });

    return NextResponse.json({
      message: "Produto excluído definitivamente.",
      ...resultado,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUTO_NAO_ENCONTRADO") {
      return NextResponse.json(
        { message: "Produto não encontrado." },
        { status: 404 }
      );
    }

    console.error("Erro ao excluir produto definitivamente:", error);

    return NextResponse.json(
      { message: "Erro ao excluir produto definitivamente." },
      { status: 500 }
    );
  }
}