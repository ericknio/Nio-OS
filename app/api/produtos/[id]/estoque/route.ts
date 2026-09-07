import { NextResponse } from "next/server";
import { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import {
  exigirPermissaoApi,
  usuarioTemPermissao,
  usuarioPodeVerDadosFinanceirosSensiveis,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(valor: unknown) {
  return Math.max(0, Math.floor(numero(valor)));
}

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function nomeOperador(usuario: UsuarioSessao) {
  return usuario.name?.trim() || usuario.username?.trim() || "Sistema";
}

function tipoMovimento(valor: unknown) {
  const tipo = texto(valor).toUpperCase();

  if (
    tipo === StockMovementType.ENTRADA ||
    tipo === StockMovementType.SAIDA ||
    tipo === StockMovementType.AJUSTE
  ) {
    return tipo;
  }

  return null;
}

function protegerProduto(
  produto: Record<string, unknown>,
  financeiroSensivelLiberado: boolean
) {
  const estoqueIlimitado = produto.stockQuantity === null;
  const stockQty = typeof produto.stockQuantity === "number" ? produto.stockQuantity : 0;
  const valorEstoqueVenda = estoqueIlimitado
    ? null
    : numero(produto.salePrice) * stockQty;
  const valorEstoqueCusto = estoqueIlimitado
    ? null
    : numero(produto.costPrice) * stockQty;

  if (financeiroSensivelLiberado) {
    return {
      ...produto,
      isUnlimited: estoqueIlimitado,
      valorEstoqueVenda,
      valorEstoqueCusto,
    };
  }

  return {
    ...produto,
    isUnlimited: estoqueIlimitado,
    costPrice: null,
    taxPercent: null,
    valorEstoqueVenda,
    valorEstoqueCusto: null,
  };
}

function calcularNovoEstoque({
  tipo,
  estoqueAtual,
  quantidade,
}: {
  tipo: StockMovementType;
  estoqueAtual: number;
  quantidade: number;
}) {
  if (tipo === StockMovementType.ENTRADA) {
    return estoqueAtual + quantidade;
  }

  if (tipo === StockMovementType.SAIDA) {
    return estoqueAtual - quantidade;
  }

  return quantidade;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi(["estoque.ver", "produtos.ver"]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const { id } = await context.params;

    const produto = await prisma.product.findUnique({
      where: {
        id,
      },
      include: {
        stockMovements: {
          orderBy: {
            createdAt: "desc",
          },
          take: 80,
        },
      },
    });

    if (!produto) {
      return NextResponse.json(
        { message: "Produto não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      produto: protegerProduto(produto, financeiroSensivelLiberado),
      movimentos: produto.stockMovements,
    });
  } catch (error) {
    console.error("Erro ao buscar estoque do produto:", error);

    return NextResponse.json(
      { message: "Erro ao buscar estoque do produto." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi("estoque.ajustar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));

    const tipo = tipoMovimento(body.type);
    const quantidade = inteiro(body.quantity);
    const motivo = texto(body.reason);
    const userName = nomeOperador(acesso.usuario);

    if (!tipo) {
      return NextResponse.json(
        { message: "Tipo de movimentação inválido." },
        { status: 400 }
      );
    }

    if (quantidade <= 0 && tipo !== StockMovementType.AJUSTE) {
      return NextResponse.json(
        { message: "Informe uma quantidade maior que zero." },
        { status: 400 }
      );
    }

    if (tipo === StockMovementType.AJUSTE && quantidade < 0) {
      return NextResponse.json(
        { message: "A quantidade ajustada não pode ser negativa." },
        { status: 400 }
      );
    }

    if (!motivo) {
      return NextResponse.json(
        { message: "Informe o motivo da movimentação." },
        { status: 400 }
      );
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const produto = await tx.product.findUnique({
        where: {
          id,
        },
      });

      if (!produto) {
        throw new Error("PRODUTO_NAO_ENCONTRADO");
      }

      if (produto.stockQuantity === null) {
        throw new Error("UNLIMITED_STOCK_REJECTS_MOVEMENT");
      }

      const estoqueAtual = produto.stockQuantity;
      const novoEstoque = calcularNovoEstoque({
        tipo,
        estoqueAtual,
        quantidade,
      });

      if (novoEstoque < 0) {
        throw new Error("ESTOQUE_INSUFICIENTE");
      }

      const atualizacao = await tx.product.updateMany({
        where: {
          id,
          stockQuantity: estoqueAtual,
        },
        data: {
          stockQuantity: novoEstoque,
        },
      });

      if (atualizacao.count === 0) {
        throw new Error("CONCORRENCIA_DETECTADA");
      }

      const produtoAtualizado = await tx.product.findUniqueOrThrow({
        where: {
          id,
        },
      });

      const movimento = await tx.stockMovement.create({
        data: {
          productId: produto.id,
          type: tipo,
          quantity:
            tipo === StockMovementType.SAIDA
              ? -quantidade
              : tipo === StockMovementType.AJUSTE
                ? novoEstoque - estoqueAtual
                : quantidade,
          previousStock: estoqueAtual,
          newStock: novoEstoque,
          reason: `${motivo} | Operador: ${userName}`,
          userName,
        },
      });

      return {
        produto: produtoAtualizado,
        movimento,
      };
    });

    return NextResponse.json({
      message: "Estoque atualizado com sucesso.",
      produto: protegerProduto(
        resultado.produto,
        financeiroSensivelLiberado
      ),
      movimento: resultado.movimento,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PRODUTO_NAO_ENCONTRADO") {
        return NextResponse.json(
          { message: "Produto não encontrado." },
          { status: 404 }
        );
      }

      if (error.message === "ESTOQUE_INSUFICIENTE") {
        return NextResponse.json(
          { message: "Estoque insuficiente para saída." },
          { status: 400 }
        );
      }

      if (error.message === "UNLIMITED_STOCK_REJECTS_MOVEMENT") {
        return NextResponse.json(
          {
            code: "UNLIMITED_STOCK_REJECTS_MOVEMENT",
            message:
              "Estoque ilimitado não aceita movimentação física. Converta o produto para estoque controlado antes de movimentar.",
          },
          { status: 409 }
        );
      }

      if (error.message === "CONCORRENCIA_DETECTADA") {
        return NextResponse.json(
          {
            message:
              "O estoque deste produto foi alterado simultaneamente por outro operador. Por favor, recarregue a página.",
          },
          { status: 409 }
        );
      }
    }

    console.error("Erro ao ajustar estoque:", error);

    return NextResponse.json(
      { message: "Erro ao ajustar estoque." },
      { status: 500 }
    );
  }
}
