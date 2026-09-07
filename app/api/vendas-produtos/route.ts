import {
  PaymentMethod,
  ProductSaleStatus,
  StockMovementType,
  type Prisma,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proximoNumeroVendaProduto } from "@/lib/numeroSequencial";
import { exigirModuloProdutosAtivoApi } from "@/lib/moduloProdutos";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

const FORMAS_PAGAMENTO_VALIDAS = [
  PaymentMethod.DINHEIRO,
  PaymentMethod.PIX,
  PaymentMethod.CARTAO,
  PaymentMethod.PARCELADO,
] as const;

type FormaPagamentoVenda = (typeof FORMAS_PAGAMENTO_VALIDAS)[number];

type ItemVendaInput = {
  productId?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
};

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function nomeOperador(usuario: UsuarioSessao) {
  return usuario.name?.trim() || usuario.username?.trim() || "Sistema";
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

function formaPagamentoValida(valor: unknown): FormaPagamentoVenda | null {
  const forma = texto(valor).toUpperCase();

  return (FORMAS_PAGAMENTO_VALIDAS as readonly string[]).includes(forma)
    ? (forma as FormaPagamentoVenda)
    : null;
}

function formatarVenda(
  venda: Record<string, unknown>,
  financeiroSensivelLiberado: boolean
) {
  const items = Array.isArray(venda.items)
    ? (venda.items as Record<string, unknown>[])
    : [];

  return {
    ...venda,

    subtotalAmount: numero(venda.subtotalAmount),
    discount: numero(venda.discount),
    totalAmount: numero(venda.totalAmount),

    taxAmount: financeiroSensivelLiberado ? numero(venda.taxAmount) : null,
    costAmount: financeiroSensivelLiberado ? numero(venda.costAmount) : null,
    profitAmount: financeiroSensivelLiberado ? numero(venda.profitAmount) : null,
    attendantProfitPercentSnapshot: financeiroSensivelLiberado
      ? venda.attendantProfitPercentSnapshot !== null &&
        venda.attendantProfitPercentSnapshot !== undefined
        ? numero(venda.attendantProfitPercentSnapshot)
        : null
      : null,
    attendantProfitShare: financeiroSensivelLiberado
      ? numero(venda.attendantProfitShare)
      : null,

    items: items.map((item) => ({
      ...item,

      unitPrice: numero(item.unitPrice),
      subtotalAmount: numero(item.subtotalAmount),
      totalAmount: numero(item.totalAmount),

      unitCost: financeiroSensivelLiberado ? numero(item.unitCost) : null,
      taxPercent: financeiroSensivelLiberado ? numero(item.taxPercent) : null,
      taxAmount: financeiroSensivelLiberado ? numero(item.taxAmount) : null,
      costAmount: financeiroSensivelLiberado ? numero(item.costAmount) : null,
      profitAmount: financeiroSensivelLiberado ? numero(item.profitAmount) : null,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const bloqueioModuloProdutos = await exigirModuloProdutosAtivoApi();

    if (bloqueioModuloProdutos) {
      return bloqueioModuloProdutos;
    }

    const acesso = await exigirPermissaoApi("vendas.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const { searchParams } = new URL(request.url);

    const busca = texto(searchParams.get("busca"));
    const statusParam = texto(
      searchParams.get("status") || "TODAS"
    ).toUpperCase();
    const formaParam = texto(
      searchParams.get("forma") || "TODAS"
    ).toUpperCase();

    const dataInicio = texto(searchParams.get("dataInicio"));
    const dataFim = texto(searchParams.get("dataFim"));

    const where: Prisma.ProductSaleWhereInput = {};

    if (statusParam === "CONCLUIDA" || statusParam === "CANCELADA") {
      where.status = statusParam as ProductSaleStatus;
    }

    const formaPagamento = formaPagamentoValida(formaParam);

    if (formaPagamento) {
      where.paymentMethod = formaPagamento;
    }

    if (dataInicio || dataFim) {
      where.soldAt = {};

      if (dataInicio) {
        where.soldAt.gte = new Date(`${dataInicio}T00:00:00`);
      }

      if (dataFim) {
        where.soldAt.lte = new Date(`${dataFim}T23:59:59`);
      }
    }

    if (busca) {
      const numeroVenda = Number(busca.replace(/\D/g, ""));

      where.OR = [
        {
          customerName: {
            contains: busca,
          },
        },
        {
          note: {
            contains: busca,
          },
        },
        {
          items: {
            some: {
              productName: {
                contains: busca,
              },
            },
          },
        },
      ];

      if (Number.isFinite(numeroVenda) && numeroVenda > 0) {
        where.OR.push({
          saleNumber: numeroVenda,
        });
      }
    }

    const vendas = await prisma.productSale.findMany({
      where,
      orderBy: {
        soldAt: "desc",
      },
      take: 300,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            whatsapp: true,
          },
        },
        attendantUser: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        items: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    const resumoInterno = vendas.reduce(
      (acc, venda) => {
        if (venda.status === ProductSaleStatus.CANCELADA) {
          acc.canceladas += 1;
          return acc;
        }

        const itens = Array.isArray(venda.items) ? venda.items : [];

        acc.totalVendas += 1;
        acc.quantidadeItens += itens.reduce(
          (total: number, item: { quantity?: unknown }) =>
            total + inteiro(item.quantity),
          0
        );
        acc.totalRecebido += numero(venda.totalAmount);
        acc.totalCusto += numero(venda.costAmount);
        acc.totalImposto += numero(venda.taxAmount);
        acc.totalLucro += numero(venda.profitAmount);
        acc.totalComissaoAtendentes += numero(venda.attendantProfitShare);

        return acc;
      },
      {
        totalVendas: 0,
        canceladas: 0,
        quantidadeItens: 0,
        totalRecebido: 0,
        totalCusto: 0,
        totalImposto: 0,
        totalLucro: 0,
        totalComissaoAtendentes: 0,
      }
    );

    return NextResponse.json({
      resumo: {
        totalVendas: resumoInterno.totalVendas,
        canceladas: resumoInterno.canceladas,
        quantidadeItens: resumoInterno.quantidadeItens,
        totalRecebido: resumoInterno.totalRecebido,
        totalCusto: financeiroSensivelLiberado ? resumoInterno.totalCusto : null,
        totalImposto: financeiroSensivelLiberado ? resumoInterno.totalImposto : null,
        totalLucro: financeiroSensivelLiberado ? resumoInterno.totalLucro : null,
        totalComissaoAtendentes: financeiroSensivelLiberado ? resumoInterno.totalComissaoAtendentes : null,
      },
      financeiroSensivelLiberado,
      vendas: vendas.map((venda) =>
        formatarVenda(venda, financeiroSensivelLiberado)
      ),
    });
  } catch (error) {
    console.error("Erro ao listar vendas de produtos:", error);

    return NextResponse.json(
      { message: "Erro ao listar vendas de produtos." },
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

    const acesso = await exigirPermissaoApi("vendas.registrar");

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
        { message: "Dados inválidos para registrar venda." },
        { status: 400 }
      );
    }

    const itens = Array.isArray(body.items)
      ? (body.items as ItemVendaInput[])
      : [];

    if (itens.length === 0) {
      return NextResponse.json(
        { message: "Adicione pelo menos um produto à venda." },
        { status: 400 }
      );
    }

    const paymentMethod = formaPagamentoValida(body.paymentMethod);

    if (!paymentMethod) {
      return NextResponse.json(
        { message: "Informe uma forma de pagamento válida." },
        { status: 400 }
      );
    }

    const customerId = textoOuNulo(body.customerId);
    const customerNameManual = textoOuNulo(body.customerName);
    const note = textoOuNulo(body.note);
    const userName = nomeOperador(acesso.usuario);
    const attendantUserIdParam = textoOuNulo(body.attendantUserId);

    const produtosIdsPayload = itens.map((item) => texto(item.productId));

    if (produtosIdsPayload.some((id) => !id)) {
      return NextResponse.json(
        { message: "Todos os itens precisam ter um produto válido." },
        { status: 400 }
      );
    }

    const produtosIds = Array.from(new Set(produtosIdsPayload));

    if (produtosIds.length !== produtosIdsPayload.length) {
      return NextResponse.json(
        {
          code: "DUPLICATE_PRODUCT_IN_SALE",
          message: "Um produto não pode aparecer mais de uma vez na mesma venda.",
        },
        { status: 422 }
      );
    }

    const vendaCriada = await prisma.$transaction(async (tx) => {
      const produtos = await tx.product.findMany({
        where: {
          id: {
            in: produtosIds,
          },
        },
      });

      if (produtos.length !== produtosIds.length) {
        throw new Error("Produto não encontrado na venda.");
      }

      const produtosMap = new Map(
        produtos.map((produto) => [produto.id, produto])
      );

      let clienteEncontrado: {
        id: string;
        name: string;
      } | null = null;

      if (customerId) {
        clienteEncontrado = await tx.customer.findUnique({
          where: {
            id: customerId,
          },
          select: {
            id: true,
            name: true,
          },
        });
      }

      let atendenteEncontrado: {
        id: string;
        name: string;
        role: string;
        status: string;
        pdvProfitShareEnabled: boolean;
        pdvProfitSharePercent: unknown;
      } | null = null;

      const targetAttendantId = attendantUserIdParam || acesso.usuario.id;

      if (targetAttendantId) {
        atendenteEncontrado = await tx.systemUser.findUnique({
          where: { id: targetAttendantId },
          select: {
            id: true,
            name: true,
            role: true,
            status: true,
            pdvProfitShareEnabled: true,
            pdvProfitSharePercent: true,
          },
        });
      }

      const itensCalculados = itens.map((item) => {
        const productId = texto(item.productId);
        const produto = produtosMap.get(productId);

        if (!produto) {
          throw new Error("Produto não encontrado na venda.");
        }

        if (!produto.isActive) {
          throw new Error(`Produto inativo: ${produto.name}`);
        }

        const quantity = inteiro(item.quantity);

        if (quantity <= 0) {
          throw new Error(`Informe a quantidade do produto ${produto.name}.`);
        }

        const unitPriceInformado = numero(item.unitPrice);
        const unitPrice =
          unitPriceInformado > 0
            ? unitPriceInformado
            : numero(produto.salePrice);

        const unitCost = numero(produto.costPrice);
        const taxPercent = numero(produto.taxPercent);

        const subtotalAmount = unitPrice * quantity;
        const taxAmount = subtotalAmount * (taxPercent / 100);
        const costAmount = unitCost * quantity;
        const profitAmount = subtotalAmount - taxAmount - costAmount;

        return {
          produto,
          productId,
          productName: produto.name,
          quantity,
          unitPrice,
          unitCost,
          taxPercent,
          subtotalAmount,
          taxAmount,
          costAmount,
          profitAmount,
          totalAmount: subtotalAmount,
        };
      });

      const subtotalAmount = itensCalculados.reduce(
        (total, item) => total + item.subtotalAmount,
        0
      );

      const discount = numero(body.discount);

      if (discount > subtotalAmount) {
        throw new Error("O desconto não pode ser maior que o total da venda.");
      }

      const taxAmount = itensCalculados.reduce(
        (total, item) => total + item.taxAmount,
        0
      );

      const costAmount = itensCalculados.reduce(
        (total, item) => total + item.costAmount,
        0
      );

      const totalAmount = subtotalAmount - discount;
      const profitAmount = totalAmount - taxAmount - costAmount;

      let attendantUserId: string | null = null;
      let attendantProfitPercentSnapshot: number | null = null;
      let attendantProfitShare = 0;

      if (
        atendenteEncontrado &&
        atendenteEncontrado.role === "ATENDENTE" &&
        atendenteEncontrado.status === "ATIVO" &&
        atendenteEncontrado.pdvProfitShareEnabled
      ) {
        const percent = numero(atendenteEncontrado.pdvProfitSharePercent);
        if (percent > 0 && percent <= 100) {
          attendantUserId = atendenteEncontrado.id;
          attendantProfitPercentSnapshot = Math.round(percent * 100) / 100;
          if (profitAmount > 0) {
            attendantProfitShare =
              Math.round(
                (profitAmount * (attendantProfitPercentSnapshot / 100) +
                  Number.EPSILON) *
                100
              ) / 100;
          }
        }
      } else if (atendenteEncontrado) {
        attendantUserId = atendenteEncontrado.id;
      }

      const saleNumber = await proximoNumeroVendaProduto(tx);

      const venda = await tx.productSale.create({
        data: {
          saleNumber,
          customerId: clienteEncontrado?.id || null,
          customerName: clienteEncontrado?.name || customerNameManual || null,

          subtotalAmount,
          discount,
          taxAmount,
          costAmount,
          profitAmount,
          totalAmount,

          attendantUserId,
          attendantProfitPercentSnapshot,
          attendantProfitShare,

          paymentMethod,
          status: ProductSaleStatus.CONCLUIDA,
          note,
          userName,

          items: {
            create: itensCalculados.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,

              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              taxPercent: item.taxPercent,

              subtotalAmount: item.subtotalAmount,
              taxAmount: item.taxAmount,
              costAmount: item.costAmount,
              profitAmount: item.profitAmount,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              whatsapp: true,
            },
          },
          attendantUser: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
          items: true,
        },
      });

      for (const item of itensCalculados) {
        const estoqueAnterior = item.produto.stockQuantity;
        let movimentoPreviousStock: number | null = null;
        let movimentoNewStock: number | null = null;

        if (estoqueAnterior !== null) {
          const reducao = await tx.product.updateMany({
            where: {
              id: item.productId,
              stockQuantity: {
                not: null,
                gte: item.quantity,
              },
            },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });

          const produtoDepois = await tx.product.findUnique({
            where: {
              id: item.productId,
            },
            select: {
              name: true,
              stockQuantity: true,
            },
          });

          if (!produtoDepois) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          if (reducao.count === 0) {
            if (produtoDepois.stockQuantity !== null) {
              throw new Error(
                `ESTOQUE_INSUFICIENTE|${produtoDepois.name}|${produtoDepois.stockQuantity}`
              );
            }
          } else {
            if (reducao.count !== 1 || produtoDepois.stockQuantity === null) {
              throw new Error("INVALID_CONDITIONAL_STOCK_UPDATE");
            }

            movimentoNewStock = produtoDepois.stockQuantity;
            movimentoPreviousStock = movimentoNewStock + item.quantity;
          }
        }

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            saleId: venda.id,
            type: StockMovementType.VENDA,
            quantity: -item.quantity,
            previousStock: movimentoPreviousStock,
            newStock: movimentoNewStock,
            reason: `Venda Nº ${venda.saleNumber}`,
            userName,
          },
        });
      }

      return venda;
    });

    return NextResponse.json(
      {
        message: "Venda registrada com sucesso.",
        venda: formatarVenda(vendaCriada, financeiroSensivelLiberado),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "PRODUCT_NOT_FOUND") {
      return NextResponse.json(
        {
          code: "PRODUCT_NOT_FOUND",
          message: "Um produto da venda não foi encontrado.",
        },
        { status: 404 }
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith("ESTOQUE_INSUFICIENTE|")
    ) {
      const [, produto, disponivel] = error.message.split("|");
      return NextResponse.json(
        {
          code: "INSUFFICIENT_STOCK",
          message: `Estoque insuficiente para ${produto}. Disponível: ${disponivel}.`,
        },
        { status: 409 }
      );
    }

    console.error("Erro ao registrar venda de produtos:", error);

    return NextResponse.json(
      { message: "Erro ao registrar venda de produtos." },
      { status: 500 }
    );
  }
}
