import { NextResponse } from "next/server";
import { ProductSaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import { reconciliarEstornosOrdensCanceladas } from "@/lib/reconciliarEstornos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respostaJson(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

function adicionarDias(data: Date, dias: number) {
  const novaData = new Date(data);
  novaData.setDate(novaData.getDate() + dias);
  return novaData;
}

function inicioDoDia(data: Date) {
  const novaData = new Date(data);
  novaData.setHours(0, 0, 0, 0);
  return novaData;
}

function diferencaDias(dataFinal: Date, dataInicial: Date) {
  const umDia = 1000 * 60 * 60 * 24;

  return Math.ceil(
    (inicioDoDia(dataFinal).getTime() - inicioDoDia(dataInicial).getTime()) /
      umDia
  );
}

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(valor: unknown) {
  return Math.max(0, Math.floor(numero(valor)));
}

export async function GET() {
  try {
    const acesso = await exigirPermissaoApi("dashboard.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const usuario = acesso.usuario;

    const configuracoes = await prisma.companySettings.findFirst({
      select: {
        productsModuleEnabled: true,
        osModuleEnabled: true,
      },
    });

    const productsModuleEnabled =
      configuracoes?.productsModuleEnabled !== false;

    const osModuleEnabled = configuracoes?.osModuleEnabled !== false;

    const podeVerOrdens = osModuleEnabled && usuarioTemPermissao(usuario, "ordens.ver");
    const podeCriarOrdens = osModuleEnabled && usuarioTemPermissao(usuario, "ordens.criar");
    const podeVerClientes = usuarioTemPermissao(usuario, "clientes.ver");
    const podeVerGarantias = osModuleEnabled && usuarioTemPermissao(usuario, "garantias.ver");
    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(usuario);
    const podeVerRelatorios = usuarioTemPermissao(usuario, "relatorios.ver");

    const podeVerProdutos =
      productsModuleEnabled && usuarioTemPermissao(usuario, "produtos.ver");

    const podeVerEstoque =
      productsModuleEnabled && usuarioTemPermissao(usuario, "estoque.ver");

    const podeVerVendasProdutos =
      productsModuleEnabled && usuarioTemPermissao(usuario, "vendas.ver");

    const agora = new Date();

    const inicioMes = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      1,
      0,
      0,
      0,
      0
    );

    const fimMes = new Date(
      agora.getFullYear(),
      agora.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );

    const hojeInicio = inicioDoDia(new Date());

    await reconciliarEstornosOrdensCanceladas();

    const [
      osRecebidas,
      osAbertas,
      osConcluidas,
      osEmAnalise,
      osEmReparo,
      aguardandoPeca,
      prontas,
      osAtrasadas,
      ultimasOrdens,
      clientes,
      recebidoPagamentosAggregate,
      recebidoAntigoAggregate,
      ordensComGarantia,
      vendasProdutosMes,
      ultimasVendasProdutos,
      produtosEstoqueBaixoLista,
      produtosAtivos,
    ] = await Promise.all([
      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: "RECEBIDO",
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: {
                notIn: ["PRONTO", "ENTREGUE", "CANCELADO"],
              },
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: "ENTREGUE",
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: "EM_ANALISE",
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: "EM_REPARO",
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: "AGUARDANDO_PECA",
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              status: "PRONTO",
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.count({
            where: {
              expectedDeliveryDate: {
                lt: hojeInicio,
              },
              status: {
                notIn: ["PRONTO", "ENTREGUE", "CANCELADO"],
              },
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.findMany({
            take: 6,
            orderBy: {
              openedAt: "desc",
            },
            select: {
              id: true,
              osNumber: true,
              equipmentType: true,
              equipmentOther: true,
              brand: true,
              model: true,
              status: true,
              openedAt: true,
              totalAmount: true,
              customer: {
                select: {
                  name: true,
                  whatsapp: true,
                },
              },
            },
          })
        : Promise.resolve([]),

      podeVerClientes ? prisma.customer.count() : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrderPayment.aggregate({
            where: {
              createdAt: {
                gte: inicioMes,
                lt: fimMes,
              },
            },
            _sum: {
              amount: true,
            },
          })
        : Promise.resolve(null),

      podeVerOrdens
        ? prisma.serviceOrder.aggregate({
            where: {
              status: {
                not: "CANCELADO",
              },
              paymentReceivedAt: {
                gte: inicioMes,
                lt: fimMes,
              },
              paymentPercent: {
                gt: 0,
              },
              payments: {
                none: {},
              },
            },
            _sum: {
              paidAmount: true,
            },
          })
        : Promise.resolve(null),

      podeVerGarantias
        ? prisma.serviceOrder.findMany({
            where: {
              finalization: {
                isNot: null,
              },
            },
            select: {
              finalization: {
                select: {
                  deliveredAt: true,
                  warrantyDays: true,
                },
              },
            },
          })
        : Promise.resolve([]),

      productsModuleEnabled && podeVerVendasProdutos
        ? prisma.productSale.findMany({
            where: {
              status: ProductSaleStatus.CONCLUIDA,
              soldAt: {
                gte: inicioMes,
                lt: fimMes,
              },
            },
            select: {
              id: true,
              items: {
                select: {
                  quantity: true,
                },
              },
              totalAmount: true,
              ...(financeiroSensivelLiberado
                ? {
                    costAmount: true,
                    taxAmount: true,
                    profitAmount: true,
                  }
                : {}),
            },
          })
        : Promise.resolve([]),

      podeVerVendasProdutos
        ? prisma.productSale.findMany({
            take: 6,
            where: {
              status: ProductSaleStatus.CONCLUIDA,
            },
            orderBy: {
              soldAt: "desc",
            },
            select: {
              id: true,
              saleNumber: true,
              soldAt: true,
              customerName: true,
              paymentMethod: true,
              userName: true,
              totalAmount: true,
              customer: {
                select: {
                  name: true,
                  whatsapp: true,
                },
              },
              items: {
                select: {
                  productName: true,
                  quantity: true,
                  totalAmount: true,
                },
              },
            },
          })
        : Promise.resolve([]),

      podeVerEstoque
        ? prisma.product.findMany({
            where: {
              isActive: true,
              stockQuantity: {
                not: null,
              },
              minStock: {
                gt: 0,
              },
            },
            select: {
              id: true,
              name: true,
              sku: true,
              category: true,
              stockQuantity: true,
              minStock: true,
            },
            orderBy: {
              name: "asc",
            },
          })
        : Promise.resolve([]),

      podeVerProdutos
        ? prisma.product.count({
            where: {
              isActive: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const vendasMes = vendasProdutosMes as Array<{
      totalAmount?: unknown;
      costAmount?: unknown;
      taxAmount?: unknown;
      profitAmount?: unknown;
      items?: Array<{
        quantity?: unknown;
      }>;
    }>;

    const totalRecebidoOSMes = podeVerOrdens
      ? numero(recebidoPagamentosAggregate?._sum.amount) +
        numero(recebidoAntigoAggregate?._sum.paidAmount)
      : null;

    const receitaProdutosMes =
      podeVerVendasProdutos && productsModuleEnabled
        ? vendasMes.reduce(
            (total, venda) => total + numero(venda.totalAmount),
            0
          )
        : null;

    const lucroProdutosMes =
      financeiroSensivelLiberado && productsModuleEnabled
        ? vendasMes.reduce(
            (total, venda) => total + numero(venda.profitAmount),
            0
          )
        : null;

    const custoProdutosMes =
      financeiroSensivelLiberado && productsModuleEnabled
        ? vendasMes.reduce(
            (total, venda) => total + numero(venda.costAmount),
            0
          )
        : null;

    const impostoProdutosMes =
      financeiroSensivelLiberado && productsModuleEnabled
        ? vendasMes.reduce(
            (total, venda) => total + numero(venda.taxAmount),
            0
          )
        : null;

    const totalRecebidoMes = podeVerOrdens || podeVerVendasProdutos
      ? numero(totalRecebidoOSMes) +
        (productsModuleEnabled ? numero(receitaProdutosMes) : 0)
      : null;

    const vendasProdutosQuantidade = podeVerVendasProdutos
      ? vendasMes.length
      : null;

    const itensProdutosVendidosMes = podeVerVendasProdutos
      ? vendasMes.reduce((total, venda) => {
          const itens = Array.isArray(venda.items) ? venda.items : [];

          return (
            total +
            itens.reduce(
              (subtotal, item) => subtotal + inteiro(item.quantity),
              0
            )
          );
        }, 0)
      : null;

    const produtosEstoqueBaixo = podeVerEstoque
      ? produtosEstoqueBaixoLista.filter((produto) => {
          if (produto.stockQuantity === null) return false;

          const estoque = produto.stockQuantity;
          const minimo = inteiro(produto.minStock);

          return minimo > 0 && estoque < minimo;
        })
      : [];

    const hoje = new Date();

    const garantiasCalculadas = ordensComGarantia
      .filter((ordem) => ordem.finalization)
      .map((ordem) => {
        const entregueEm = ordem.finalization?.deliveredAt
          ? new Date(ordem.finalization.deliveredAt)
          : null;

        const garantiaDias = Number(ordem.finalization?.warrantyDays || 0);

        const venceEm =
          entregueEm && garantiaDias > 0
            ? adicionarDias(entregueEm, garantiaDias)
            : null;

        const diasRestantes = venceEm ? diferencaDias(venceEm, hoje) : null;

        let statusGarantia = "SEM_GARANTIA";

        if (venceEm && diasRestantes !== null) {
          if (diasRestantes < 0) {
            statusGarantia = "VENCIDA";
          } else if (diasRestantes <= 7) {
            statusGarantia = "VENCENDO";
          } else {
            statusGarantia = "VIGENTE";
          }
        }

        return {
          statusGarantia,
        };
      });

    const garantiasVencendo = podeVerGarantias
      ? garantiasCalculadas.filter((item) => item.statusGarantia === "VENCENDO")
          .length
      : null;

    const garantiasVencidas = podeVerGarantias
      ? garantiasCalculadas.filter((item) => item.statusGarantia === "VENCIDA")
          .length
      : null;

    const ultimasOrdensSeguras = podeVerOrdens
      ? ultimasOrdens.map((ordem) => ({
          ...ordem,
          totalAmount: ordem.totalAmount,
        }))
      : [];

    const ultimasVendasProdutosSeguras = podeVerVendasProdutos
      ? ultimasVendasProdutos.map((venda) => ({
          ...venda,
          totalAmount: "totalAmount" in venda ? venda.totalAmount : null,
          items: venda.items.map((item) => ({
            ...item,
            totalAmount: "totalAmount" in item ? item.totalAmount : null,
          })),
        }))
      : [];

    return respostaJson({
      productsModuleEnabled,
      osModuleEnabled,

      permissoes: {
        productsModuleEnabled,
        osModuleEnabled,
        podeVerOrdens,
        podeCriarOrdens,
        podeVerClientes,
        podeVerGarantias,
        podeVerProdutos,
        podeVerEstoque,
        podeVerVendasProdutos,
        podeVerFinanceiro: financeiroSensivelLiberado,
        financeiroSensivelLiberado,
        podeVerRelatorios,
      },

      osRecebidas,
      osAbertas,
      osConcluidas,
      osEntregues: osConcluidas,
      osEmAnalise,
      emAnalise: osEmAnalise,
      osEmReparo,
      emReparo: osEmReparo,
      aguardandoPeca,
      prontas,
      osProntas: prontas,
      osAtrasadas,
      clientes,
      garantiasVencendo,
      garantiasVencidas,

      produtosAtivos,
      produtosEstoqueBaixo: produtosEstoqueBaixo.length,
      produtosEstoqueBaixoLista: produtosEstoqueBaixo.slice(0, 8),

      vendasProdutosQuantidade,
      itensProdutosVendidosMes,

      totalRecebidoOSMes,
      receitaProdutosMes,
      lucroProdutosMes,
      custoProdutosMes,
      impostoProdutosMes,
      totalRecebidoMes,

      recebidoMes: totalRecebidoMes,
      recebidoNoMes: totalRecebidoMes,
      totalRecebidoNoMes: totalRecebidoMes,

      ultimasOrdens: ultimasOrdensSeguras,
      ultimasVendasProdutos: ultimasVendasProdutosSeguras,
    });
  } catch (error) {
    console.error("Erro ao carregar painel inicial:", error);

    return respostaJson(
      {
        message: "Erro ao carregar painel inicial.",
      },
      {
        status: 500,
      }
    );
  }
}
