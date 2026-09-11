/**
 * @file route.ts
 * @description Endpoint de consolidação financeira geral da empresa (`/api/financeiro-geral`).
 * Unifica recebimentos e estornos de Ordens de Serviço com o faturamento de Vendas Balcão (PDV),
 * calculando ticket médio, distribuição por meio de pagamento (PIX, Dinheiro, Cartão),
 * margens de lucro/custo (RBAC) e extrato cronológico unificado no período selecionado.
 */

import { NextResponse } from "next/server";
import { ProductSaleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
} from "@/lib/permissaoApi";
import { moduloProdutosEstaAtivo } from "@/lib/moduloProdutos";
import { reconciliarEstornosOrdensCanceladas } from "@/lib/reconciliarEstornos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Converte valor desconhecido em número finito seguro, retornando 0 como fallback.
 * @param valor - Valor a converter
 * @returns Número seguro
 */
function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converte valor em string sem espaços laterais.
 * @param valor - Valor a converter
 * @returns String tratada
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Retorna a data do primeiro dia do mês atual às 00:00:00.
 * @returns Data do início do mês
 */
function inicioMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);
}

/**
 * Retorna a data do último dia do mês atual às 23:59:59.999.
 * @returns Data do fim do mês
 */
function fimMesAtual() {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Faz parsing seguro de uma string no formato AAAA-MM-DD para Date local evitando deslocamento de fuso.
 * @param data - String de data no formato AAAA-MM-DD
 * @returns Instância válida de Date ou null se o formato/valores forem inválidos
 */
function criarDataLocalSegura(data: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);

  if (!match) return null;

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const d = new Date(ano, mes - 1, dia);

  if (
    d.getFullYear() !== ano ||
    d.getMonth() !== mes - 1 ||
    d.getDate() !== dia
  ) {
    return null;
  }

  return d;
}

/**
 * Retorna uma cópia da data ajustada para o primeiro milissegundo do dia (00:00:00.000).
 * @param data - Data base
 * @returns Data ajustada para 00:00:00.000
 */
function inicioDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Retorna uma cópia da data ajustada para o último milissegundo do dia (23:59:59.999).
 * @param data - Data base
 * @returns Data ajustada para 23:59:59.999
 */
function fimDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Converte um objeto Date em formato de string para inputs HTML (AAAA-MM-DD).
 * @param data - Objeto Date
 * @returns String formatada AAAA-MM-DD
 */
function formatarDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

/**
 * Retorna o nome amigável em português para o código da forma de pagamento.
 * @param forma - Código da forma de pagamento
 * @returns Nome legível
 */
function nomeFormaPagamento(forma: string) {
  const nomes: Record<string, string> = {
    PIX: "PIX",
    DINHEIRO: "Dinheiro",
    CARTAO: "Cartão",
    PARCELADO: "Parcelado",
    AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  };

  return nomes[forma] || forma || "-";
}

/**
 * Manipulador GET para consulta do relatório financeiro geral consolidado.
 * Suporta filtragem por período (`dataInicio`, `dataFim`).
 * Exige permissão `relatorios.ver` ou `relatorios.financeiro`.
 * @param request - Requisição HTTP contendo query params
 * @returns Resposta JSON com resumo financeiro, agregações e extrato unificado
 */
export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi([
      "relatorios.ver",
      "relatorios.financeiro",
    ]);

    if (!acesso.ok) {
      return acesso.response;
    }
    const financeiroSensivelLiberado =
      usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario);

    const productsModuleEnabled = await moduloProdutosEstaAtivo();
    const { searchParams } = new URL(request.url);

    const dataInicioParam = texto(searchParams.get("dataInicio"));
    const dataFimParam = texto(searchParams.get("dataFim"));

    const inicioInformado = dataInicioParam
      ? criarDataLocalSegura(dataInicioParam)
      : null;

    const fimInformado = dataFimParam ? criarDataLocalSegura(dataFimParam) : null;

    if (dataInicioParam && !inicioInformado) {
      return NextResponse.json(
        { message: "Data inicial inválida." },
        { status: 400 }
      );
    }

    if (dataFimParam && !fimInformado) {
      return NextResponse.json(
        { message: "Data final inválida." },
        { status: 400 }
      );
    }

    const inicio = inicioInformado ? inicioDoDia(inicioInformado) : inicioMesAtual();

    const fim = fimInformado ? fimDoDia(fimInformado) : fimMesAtual();

    if (fim < inicio) {
      return NextResponse.json(
        { message: "A data final não pode ser menor que a data inicial." },
        { status: 400 }
      );
    }

    await reconciliarEstornosOrdensCanceladas();

    const [pagamentosOS, vendasProdutos] = await Promise.all([
      prisma.serviceOrderPayment.findMany({
        where: {
          createdAt: {
            gte: inicio,
            lte: fim,
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          serviceOrder: {
            select: {
              id: true,
              osNumber: true,
              status: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  whatsapp: true,
                },
              },
            },
          },
        },
      }),

      productsModuleEnabled
        ? prisma.productSale.findMany({
            where: {
              status: ProductSaleStatus.CONCLUIDA,
              soldAt: {
                gte: inicio,
                lte: fim,
              },
            },
            orderBy: {
              soldAt: "desc",
            },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  whatsapp: true,
                },
              },
              items: {
                select: {
                  quantity: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const recebidoOS = pagamentosOS.reduce(
      (total, pagamento) => total + numero(pagamento.amount),
      0
    );

    const recebidoProdutos = productsModuleEnabled
      ? vendasProdutos.reduce(
          (total, venda) => total + numero(venda.totalAmount),
          0
        )
      : 0;

    const custoProdutos = productsModuleEnabled
      ? vendasProdutos.reduce(
          (total, venda) => total + numero(venda.costAmount),
          0
        )
      : 0;

    const impostoProdutos = productsModuleEnabled
      ? vendasProdutos.reduce(
          (total, venda) => total + numero(venda.taxAmount),
          0
        )
      : 0;

    const lucroProdutos = productsModuleEnabled
      ? vendasProdutos.reduce(
          (total, venda) => total + numero(venda.profitAmount),
          0
        )
      : 0;

    const itensProdutos = productsModuleEnabled
      ? vendasProdutos.reduce((total, venda) => {
          return (
            total +
            venda.items.reduce(
              (subtotal, item) =>
                subtotal + Math.max(0, Number(item.quantity || 0)),
              0
            )
          );
        }, 0)
      : 0;

    const formasMap = new Map<
      string,
      {
        forma: string;
        label: string;
        total: number;
        os: number;
        produtos: number;
        quantidadeOS: number;
        quantidadeProdutos: number;
      }
    >();

    function adicionarForma(
      formaOriginal: string,
      tipo: "os" | "produtos",
      valor: number
    ) {
      const forma = formaOriginal || "NAO_INFORMADO";

      const atual =
        formasMap.get(forma) ||
        {
          forma,
          label: nomeFormaPagamento(forma),
          total: 0,
          os: 0,
          produtos: 0,
          quantidadeOS: 0,
          quantidadeProdutos: 0,
        };

      atual.total += valor;

      if (tipo === "os") {
        atual.os += valor;
        if (valor > 0) {
          atual.quantidadeOS += 1;
        }
      } else {
        atual.produtos += valor;
        if (valor > 0) {
          atual.quantidadeProdutos += 1;
        }
      }

      formasMap.set(forma, atual);
    }

    for (const pagamento of pagamentosOS) {
      adicionarForma(
        String(pagamento.paymentMethod || ""),
        "os",
        numero(pagamento.amount)
      );
    }

    if (productsModuleEnabled) {
      for (const venda of vendasProdutos) {
        adicionarForma(
          String(venda.paymentMethod || ""),
          "produtos",
          numero(venda.totalAmount)
        );
      }
    }

    const porFormaPagamento = Array.from(formasMap.values()).sort(
      (a, b) => b.total - a.total
    );

    const movimentosOS = pagamentosOS.map((pagamento) => {
      const valor = numero(pagamento.amount);
      const ehEstorno = valor < 0;
      const numeroOS = String(pagamento.serviceOrder?.osNumber || "-").padStart(3, "0");

      return {
        id: pagamento.id,
        tipo: (ehEstorno ? "ESTORNO_OS" : "OS") as "OS" | "ESTORNO_OS",
        data: pagamento.createdAt,
        descricao: ehEstorno
          ? `Devolução / Estorno OS Nº ${numeroOS}`
          : `Pagamento OS Nº ${numeroOS}`,
        cliente: pagamento.serviceOrder?.customer?.name || "Cliente não informado",
        forma: String(pagamento.paymentMethod || ""),
        formaLabel: nomeFormaPagamento(String(pagamento.paymentMethod || "")),
        valor,
        usuario: pagamento.userName || "Sistema",
        note: pagamento.note || null,
      };
    });

    const movimentosProdutos = productsModuleEnabled
      ? vendasProdutos.map((venda) => ({
          id: venda.id,
          tipo: "PRODUTO" as const,
          data: venda.soldAt,
          descricao: `Venda produto Nº ${String(venda.saleNumber).padStart(
            3,
            "0"
          )}`,
          cliente: venda.customer?.name || venda.customerName || "Consumidor",
          forma: String(venda.paymentMethod || ""),
          formaLabel: nomeFormaPagamento(String(venda.paymentMethod || "")),
          valor: numero(venda.totalAmount),
          usuario: venda.userName || "Sistema",
          note: null,
        }))
      : [];

    const movimentos = [...movimentosOS, ...movimentosProdutos]
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
      .slice(0, 80);

    const receitaTotal = recebidoOS + recebidoProdutos;

    const pagamentosPositivosOS = pagamentosOS.filter(
      (p) => numero(p.amount) > 0
    );
    const estornosOS = pagamentosOS.filter((p) => numero(p.amount) < 0);
    const totalEstornosOS = estornosOS.reduce(
      (total, p) => total + Math.abs(numero(p.amount)),
      0
    );

    const quantidadeVendas = productsModuleEnabled ? vendasProdutos.length : 0;
    const quantidadeTransacoesReceita =
      pagamentosPositivosOS.length + quantidadeVendas;

    return NextResponse.json({
      productsModuleEnabled,
      financeiroSensivelLiberado,
      periodo: {
        dataInicio: formatarDataInput(inicio),
        dataFim: formatarDataInput(fim),
      },
      resumo: {
        receitaTotal,
        recebidoOS,
        recebidoProdutos,

        pagamentosOS: pagamentosPositivosOS.length,
        estornosOS: estornosOS.length,
        totalEstornosOS,
        vendasProdutos: quantidadeVendas,
        itensProdutos,

        custoProdutos: financeiroSensivelLiberado ? custoProdutos : null,
        impostoProdutos: financeiroSensivelLiberado ? impostoProdutos : null,
        lucroProdutos: financeiroSensivelLiberado ? lucroProdutos : null,

        ticketMedioGeral:
          quantidadeTransacoesReceita > 0
            ? Math.max(0, receitaTotal / quantidadeTransacoesReceita)
            : 0,

        participacaoOS:
          receitaTotal > 0 ? (Math.max(0, recebidoOS) / receitaTotal) * 100 : 0,

        participacaoProdutos:
          productsModuleEnabled && receitaTotal > 0
            ? (Math.max(0, recebidoProdutos) / receitaTotal) * 100
            : 0,
      },
      porFormaPagamento,
      movimentos,
    });
  } catch (error) {
    console.error("Erro ao gerar financeiro geral:", error);

    return NextResponse.json(
      { message: "Erro ao gerar financeiro geral." },
      { status: 500 }
    );
  }
}
