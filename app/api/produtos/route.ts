import { NextResponse } from "next/server";
import { type Prisma, ProductSaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function textoOuNulo(valor: unknown) {
  const limpo = texto(valor);
  return limpo || null;
}

function numero(valor: unknown, fallback = 0) {
  const n = Number(valor);

  if (!Number.isFinite(n) || n < 0) return fallback;

  return n;
}

function inteiro(valor: unknown, fallback = 0) {
  return Math.max(0, Math.floor(numero(valor, fallback)));
}

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

function formatarProduto(produto: any, soldQuantity = 0) {
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

    soldQuantity,
  };
}

function protegerProduto(produto: any, financeiroSensivelLiberado: boolean) {
  const valorEstoqueVenda = produto.unlimitedStock
    ? null
    : numero(produto.salePrice) * produto.stockQuantity;
  const valorEstoqueCusto = produto.unlimitedStock
    ? null
    : numero(produto.costPrice) * produto.stockQuantity;

  if (financeiroSensivelLiberado) {
    return {
      ...produto,
      valorEstoqueVenda,
      valorEstoqueCusto,
    };
  }

  const {
    costPrice: _costPrice,
    taxPercent: _taxPercent,
    taxAmount: _taxAmount,
    profitAmount: _profitAmount,
    marginPercent: _marginPercent,
    ...seguro
  } = produto;

  return {
    ...seguro,
    costPrice: null,
    taxPercent: null,
    taxAmount: null,
    profitAmount: null,
    marginPercent: null,
    valorEstoqueVenda,
    valorEstoqueCusto: null,
  };
}

async function mapaVendidos() {
  const vendidos = await prisma.productSaleItem.groupBy({
    by: ["productId"],
    where: {
      productId: {
        not: null,
      },
      sale: {
        status: ProductSaleStatus.CONCLUIDA,
      },
    },
    _sum: {
      quantity: true,
    },
  });

  return new Map(
    vendidos.map((item) => [item.productId || "", item._sum.quantity || 0])
  );
}

async function montarRanking(financeiroSensivelLiberado: boolean) {
  const vendidosMap = await mapaVendidos();

  const produtos = await prisma.product.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const produtosComVenda = produtos.map((produto) =>
    formatarProduto(produto, vendidosMap.get(produto.id) || 0)
  );

  const maisVendidos = [...produtosComVenda]
    .filter((produto) => produto.soldQuantity > 0)
    .sort((a, b) => b.soldQuantity - a.soldQuantity)
    .slice(0, 5)
    .map((produto) => protegerProduto(produto, financeiroSensivelLiberado));

  const menosVendidos = [...produtosComVenda]
    .sort((a, b) => a.soldQuantity - b.soldQuantity)
    .slice(0, 5)
    .map((produto) => protegerProduto(produto, financeiroSensivelLiberado));

  return {
    maisVendidos,
    menosVendidos,
  };
}

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);

    const busca = texto(searchParams.get("busca"));
    const status = texto(searchParams.get("status") || "ATIVOS").toUpperCase();
    const estoque = texto(searchParams.get("estoque") || "TODOS").toUpperCase();
    const categoria = texto(searchParams.get("categoria"));

    const where: Prisma.ProductWhereInput = {};

    if (busca) {
      where.OR = [
        {
          name: {
            contains: busca,
          },
        },
        {
          sku: {
            contains: busca,
          },
        },
        {
          category: {
            contains: busca,
          },
        },
        {
          description: {
            contains: busca,
          },
        },
      ];
    }

    if (categoria) {
      where.category = {
        contains: categoria,
      };
    }

    if (status === "ATIVOS") {
      where.isActive = true;
    }

    if (status === "INATIVOS") {
      where.isActive = false;
    }

    if (estoque === "ILIMITADO") {
      where.stockQuantity = null;
    }

    if (estoque === "SEM_ESTOQUE") {
      where.stockQuantity = 0;
    }

    if (estoque === "CONTROLADO") {
      where.stockQuantity = { not: null };
    }

    const vendidosMap = await mapaVendidos();

    const produtosBanco = await prisma.product.findMany({
      where,
      orderBy: {
        name: "asc",
      },
      take: 500,
    });

    let produtosCalculados = produtosBanco.map((produto) =>
      formatarProduto(produto, vendidosMap.get(produto.id) || 0)
    );

    if (estoque === "BAIXO") {
      produtosCalculados = produtosCalculados.filter(
        (produto) => produto.lowStock
      );
    }

    if (estoque === "ILIMITADO") {
      produtosCalculados = produtosCalculados.filter(
        (produto) => produto.unlimitedStock
      );
    }

    if (estoque === "CONTROLADO") {
      produtosCalculados = produtosCalculados.filter(
        (produto) => !produto.unlimitedStock
      );
    }

    if (estoque === "SEM_ESTOQUE") {
      produtosCalculados = produtosCalculados.filter(
        (produto) => produto.stockQuantity === 0
      );
    }

    const produtosAtivos = produtosCalculados.filter(
      (produto) => produto.isActive
    );

    const estoqueBaixo = produtosAtivos.filter((produto) => produto.lowStock);

    const estoqueIlimitado = produtosAtivos.filter(
      (produto) => produto.unlimitedStock
    );

    const semEstoque = produtosAtivos.filter(
      (produto) => produto.stockQuantity === 0
    );

    const valorEstoqueVenda = produtosAtivos.reduce((total, produto) => {
      if (produto.unlimitedStock) return total;
      return total + produto.salePrice * produto.stockQuantity;
    }, 0);

    const valorEstoqueCusto = financeiroSensivelLiberado
      ? produtosAtivos.reduce((total, produto) => {
          if (produto.unlimitedStock) return total;
          return total + produto.costPrice * produto.stockQuantity;
        }, 0)
      : null;

    const lucroPotencial = financeiroSensivelLiberado
      ? produtosAtivos.reduce((total, produto) => {
          if (produto.unlimitedStock) return total;
          return total + produto.profitAmount * produto.stockQuantity;
        }, 0)
      : null;

    const ranking = await montarRanking(financeiroSensivelLiberado);

    return NextResponse.json({
      resumo: {
        total: produtosCalculados.length,
        ativos: produtosAtivos.length,
        inativos: produtosCalculados.filter((produto) => !produto.isActive)
          .length,
        estoqueBaixo: estoqueBaixo.length,
        estoqueIlimitado: estoqueIlimitado.length,
        semEstoque: semEstoque.length,
        valorEstoque: valorEstoqueVenda,
        valorEstoqueVenda,
        valorEstoqueCusto,
        lucroPotencial,
      },
      produtos: produtosCalculados.map((produto) =>
        protegerProduto(produto, financeiroSensivelLiberado)
      ),
      maisVendidos: ranking.maisVendidos,
      menosVendidos: ranking.menosVendidos,
    });
  } catch (error) {
    console.error("Erro ao listar produtos:", error);

    return NextResponse.json(
      { message: "Erro ao listar produtos." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi("produtos.criar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { message: "Dados inválidos para cadastrar produto." },
        { status: 400 }
      );
    }

    const name = texto(body.name);
    const sku = textoOuNulo(body.sku);
    const category = textoOuNulo(body.category);
    const description = textoOuNulo(body.description);
    const imageUrl = textoOuNulo(body.imageUrl);

    const salePrice = numero(body.salePrice);
    const costPrice = financeiroSensivelLiberado ? numero(body.costPrice) : 0;
    const taxPercent = financeiroSensivelLiberado
      ? numero(body.taxPercent)
      : 0;

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
          sku,
        },
        select: {
          id: true,
        },
      });

      if (skuExistente) {
        return NextResponse.json(
          { message: "Já existe um produto com esse código/SKU." },
          { status: 400 }
        );
      }
    }

    const produto = await prisma.product.create({
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
        isActive: true,
      },
    });

    return NextResponse.json(
      {
        message: "Produto cadastrado com sucesso.",
        produto: protegerProduto(
          formatarProduto(produto),
          financeiroSensivelLiberado
        ),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao cadastrar produto:", error);

    return NextResponse.json(
      { message: "Erro ao cadastrar produto." },
      { status: 500 }
    );
  }
}
