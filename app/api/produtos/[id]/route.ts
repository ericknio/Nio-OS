/**
 * @file route.ts
 * @description Endpoint de gerenciamento individual de Produto (`/api/produtos/[id]`).
 * Suporta consulta detalhada com histórico de movimentações e vendas (GET),
 * atualização cadastral com validação de SKU e alternância de controle de estoque (PUT),
 * e inativação lógica (soft delete) do produto no catálogo (DELETE).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Converte valor em string sem espaços laterais.
 * @param valor - Valor a converter
 * @returns String limpa
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Converte valor em string limpa ou null se vazia.
 * @param valor - Valor a converter
 * @returns String preenchida ou null
 */
function textoOuNulo(valor: unknown) {
  const limpo = texto(valor);
  return limpo || null;
}

/**
 * Converte valor em número finito positivo ou zero.
 * @param valor - Valor a converter
 * @param fallback - Valor padrão se inválido
 * @returns Número seguro
 */
function numero(valor: unknown, fallback = 0) {
  const n = Number(valor);

  if (!Number.isFinite(n) || n < 0) return fallback;

  return n;
}

/**
 * Converte valor em inteiro positivo (arredondado para baixo).
 * @param valor - Valor a converter
 * @param fallback - Fallback padrão
 * @returns Inteiro seguro
 */
function inteiro(valor: unknown, fallback = 0) {
  return Math.max(0, Math.floor(numero(valor, fallback)));
}

/**
 * Calcula impostos, margens de lucro e status de estoque de um produto.
 * @param produto - Objeto com preços e estoque
 * @returns Objeto com valores financeiros e flags calculadas
 */
function calcularProduto(produto: {
  salePrice: unknown;
  costPrice: unknown;
  taxPercent: unknown;
  stockQuantity: number | null;
  minStock: number;
}) {
  const salePrice = numero(produto.salePrice);
  const costPrice = numero(produto.costPrice);
  const taxPercent = numero(produto.taxPercent);

  const taxAmount = salePrice * (taxPercent / 100);
  const profitAmount = salePrice - costPrice - taxAmount;
  const marginPercent = salePrice > 0 ? (profitAmount / salePrice) * 100 : 0;

  const unlimitedStock = produto.stockQuantity === null;
  const lowStock =
    !unlimitedStock &&
    produto.minStock > 0 &&
    produto.stockQuantity !== null &&
    produto.stockQuantity < produto.minStock;

  return {
    salePrice,
    costPrice,
    taxPercent,
    taxAmount,
    profitAmount,
    marginPercent,
    unlimitedStock,
    lowStock,
  };
}

/**
 * Enriquece os dados do produto com os cálculos financeiros e flags de estoque.
 * @param produto - Registro do produto
 * @returns Produto formatado
 */
function formatarProduto(produto: any) {
  const calculos = calcularProduto(produto);

  return {
    ...produto,

    salePrice: calculos.salePrice,
    costPrice: calculos.costPrice,
    taxPercent: calculos.taxPercent,

    taxAmount: calculos.taxAmount,
    profitAmount: calculos.profitAmount,
    marginPercent: calculos.marginPercent,

    unlimitedStock: calculos.unlimitedStock,
    isUnlimited: calculos.unlimitedStock,
    lowStock: calculos.lowStock,
  };
}

/**
 * Ofusca custos e margens caso o usuário autenticado não possua privilégios financeiros.
 * @param produto - Produto bruto
 * @param financeiroSensivelLiberado - Indicador de permissão do usuário
 * @returns Produto com campos de custo protegidos
 */
function protegerProduto(produto: any, financeiroSensivelLiberado: boolean) {
  const formatado = formatarProduto(produto);
  const valorEstoqueVenda = formatado.unlimitedStock
    ? null
    : numero(formatado.salePrice) * formatado.stockQuantity;
  const valorEstoqueCusto = formatado.unlimitedStock
    ? null
    : numero(formatado.costPrice) * formatado.stockQuantity;

  if (financeiroSensivelLiberado) {
    return {
      ...formatado,
      valorEstoqueVenda,
      valorEstoqueCusto,
    };
  }

  return {
    ...formatado,

    costPrice: null,
    taxPercent: null,
    taxAmount: null,
    profitAmount: null,
    marginPercent: null,
    valorEstoqueVenda,
    valorEstoqueCusto: null,

    saleItems: Array.isArray(formatado.saleItems)
      ? formatado.saleItems.map((item: any) => ({
          ...item,

          unitCost: null,
          taxPercent: null,
          taxAmount: null,
          costAmount: null,
          profitAmount: null,

          sale: item.sale
            ? {
                ...item.sale,
                totalAmount: item.sale.totalAmount,
              }
            : null,
        }))
      : [],
  };
}

/**
 * Manipulador GET para obter detalhes completos de um produto, incluindo histórico de estoque e vendas.
 * Exige permissão `produtos.ver`, `estoque.ver` ou `vendas.ver`.
 * @param _request - Requisição HTTP
 * @param context - Contexto contendo `params.id` do produto
 * @returns Resposta JSON com o produto protegido
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi([
      "produtos.ver",
      "estoque.ver",
      "vendas.ver",
    ]);

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
          take: 30,
        },
        saleItems: {
          orderBy: {
            createdAt: "desc",
          },
          take: 30,
          include: {
            sale: {
              select: {
                id: true,
                saleNumber: true,
                soldAt: true,
                status: true,
                paymentMethod: true,
                totalAmount: true,
              },
            },
          },
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
    });
  } catch (error) {
    console.error("Erro ao buscar produto:", error);

    return NextResponse.json(
      { message: "Erro ao buscar produto." },
      { status: 500 }
    );
  }
}

/**
 * Manipulador PUT para atualizar os dados cadastrais, precificação e regras de estoque do produto.
 * Valida se houve mudança no modo de estoque (ilimitado vs controlado) exigindo confirmação explícita.
 * Exige permissão `produtos.editar`.
 * @param request - Requisição HTTP contendo JSON de atualização
 * @param context - Contexto contendo `params.id` do produto
 * @returns Resposta JSON com dados atualizados do produto
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi("produtos.editar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const { id } = await context.params;

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para atualizar produto." },
        { status: 400 }
      );
    }

    const produtoAtual = await prisma.product.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        costPrice: true,
        taxPercent: true,
        stockQuantity: true,
      },
    });

    if (!produtoAtual) {
      return NextResponse.json(
        { message: "Produto não encontrado." },
        { status: 404 }
      );
    }

    const name = texto(body.name);
    const sku = textoOuNulo(body.sku);
    const category = textoOuNulo(body.category);
    const description = textoOuNulo(body.description);
    const imageUrl = textoOuNulo(body.imageUrl);

    const salePrice = numero(body.salePrice);

    const costPrice = financeiroSensivelLiberado
      ? numero(body.costPrice)
      : numero(produtoAtual.costPrice);

    const taxPercent = financeiroSensivelLiberado
      ? numero(body.taxPercent)
      : numero(produtoAtual.taxPercent);

    const unlimitedStock = body.unlimitedStock;
    const temQuantidade = Object.prototype.hasOwnProperty.call(
      body,
      "stockQuantity"
    );

    if (typeof unlimitedStock !== "boolean") {
      return NextResponse.json(
        {
          code: "VALIDATION_ERROR",
          message: "Informe explicitamente se o estoque é ilimitado.",
        },
        { status: 422 }
      );
    }

    if (unlimitedStock && temQuantidade && body.stockQuantity !== undefined) {
      return NextResponse.json(
        {
          code: "VALIDATION_ERROR",
          message: "Produto ilimitado não pode receber quantidade de estoque.",
        },
        { status: 422 }
      );
    }

    if (
      unlimitedStock &&
      produtoAtual.stockQuantity !== null &&
      body.confirmStockModeChange !== true
    ) {
      return NextResponse.json(
        {
          code: "VALIDATION_ERROR",
          message: "Confirme explicitamente a mudança para estoque ilimitado.",
        },
        { status: 422 }
      );
    }

    const quantidadeInformada = Number(body.stockQuantity);

    if (
      !unlimitedStock &&
      (!temQuantidade ||
        !Number.isInteger(quantidadeInformada) ||
        quantidadeInformada < 0)
    ) {
      return NextResponse.json(
        {
          code: "VALIDATION_ERROR",
          message: "Informe uma quantidade inteira maior ou igual a zero.",
        },
        { status: 422 }
      );
    }

    const stockQuantity = unlimitedStock ? null : quantidadeInformada;
    const minStock = inteiro(body.minStock);
    const isActive = body.isActive === false ? false : true;

    if (!name) {
      return NextResponse.json(
        { message: "Informe o nome do produto." },
        { status: 400 }
      );
    }

    if (salePrice <= 0) {
      return NextResponse.json(
        { message: "Informe o valor de venda do produto." },
        { status: 400 }
      );
    }

    if (taxPercent > 100) {
      return NextResponse.json(
        { message: "O imposto não pode ser maior que 100%." },
        { status: 400 }
      );
    }

    if (sku) {
      const skuExistente = await prisma.product.findFirst({
        where: {
          id: {
            not: id,
          },
          sku,
        },
        select: {
          id: true,
        },
      });

      if (skuExistente) {
        return NextResponse.json(
          { message: "Já existe outro produto com esse código/SKU." },
          { status: 400 }
        );
      }
    }

    const produto = await prisma.product.update({
      where: {
        id,
      },
      data: {
        name,
        sku,
        category,
        description,
        imageUrl,
        salePrice,
        costPrice,
        taxPercent,
        stockQuantity,
        minStock,
        isActive,
      },
    });

    return NextResponse.json({
      message:
        produtoAtual.stockQuantity === null !== (stockQuantity === null)
          ? "Produto atualizado com mudança explícita do modo de estoque."
          : "Produto atualizado com sucesso.",
      produto: protegerProduto(produto, financeiroSensivelLiberado),
    });
  } catch (error) {
    console.error("Erro ao atualizar produto:", error);

    return NextResponse.json(
      { message: "Erro ao atualizar produto." },
      { status: 500 }
    );
  }
}

/**
 * Manipulador DELETE para inativação lógica (soft delete) do produto.
 * Define `isActive: false`, preservando o histórico de movimentações e vendas passadas.
 * Exige permissão `produtos.excluir`.
 * @param _request - Requisição HTTP
 * @param context - Contexto contendo `params.id` do produto
 * @returns Resposta JSON com confirmação de inativação
 */
export async function DELETE(_request: Request, context: RouteContext) {
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

    const produto = await prisma.product.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

    if (!produto) {
      return NextResponse.json(
        { message: "Produto não encontrado." },
        { status: 404 }
      );
    }

    await prisma.product.update({
      where: {
        id,
      },
      data: {
        isActive: false,
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({
      message: "Produto inativado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir produto:", error);

    return NextResponse.json(
      { message: "Erro ao excluir produto." },
      { status: 500 }
    );
  }
}
