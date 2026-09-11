/**
 * @file route.ts
 * @description Endpoint para listagem e filtragem de lançamentos financeiros de Ordens de Serviço (`/api/pagamentos`).
 * Retorna o extrato de recebimentos e estornos vinculados às OS em um intervalo de datas e/ou forma de pagamento,
 * calculando o total líquido arrecadado, ticket médio, quantitativo de estornos e totais agrupados por modalidade (PIX, Dinheiro, Cartão, Parcelado).
 */

import { NextResponse } from "next/server";
import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { reconciliarEstornosOrdensCanceladas } from "@/lib/reconciliarEstornos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Relação de formas de pagamento suportadas pelo filtro da API.
 */
const FORMAS_PAGAMENTO_VALIDAS = [
  PaymentMethod.PIX,
  PaymentMethod.DINHEIRO,
  PaymentMethod.CARTAO,
  PaymentMethod.PARCELADO,
] as const;

type FormaPagamentoFiltro = (typeof FORMAS_PAGAMENTO_VALIDAS)[number];

/**
 * Valida se a forma de pagamento informada na query string é suportada pelo sistema.
 * @param valor - String recebida no parâmetro `forma`
 * @returns FormaPagamentoFiltro válida, null se ausente/'TODAS', ou 'INVALIDA' se incorreta
 */
function formaPagamentoValida(
  valor: string | null
): FormaPagamentoFiltro | "INVALIDA" | null {
  if (!valor || valor === "TODAS") return null;

  const forma = valor.toUpperCase();

  return (FORMAS_PAGAMENTO_VALIDAS as readonly string[]).includes(forma)
    ? (forma as FormaPagamentoFiltro)
    : "INVALIDA";
}

/**
 * Converte string de data no formato AAAA-MM-DD em objeto Date local sem desvio de timezone.
 * @param data - String no formato AAAA-MM-DD
 * @returns Instância de Date ou null se inválida
 */
function criarDataLocalSegura(data: string | null) {
  if (!data) return null;

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
 * Ajusta o horário do objeto Date para o primeiro milissegundo do dia (00:00:00.000).
 * @param data - Instância de Date
 * @returns Nova Date ajustada para 00:00:00.000
 */
function inicioDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Ajusta o horário do objeto Date para o último milissegundo do dia (23:59:59.999).
 * @param data - Instância de Date
 * @returns Nova Date ajustada para 23:59:59.999
 */
function fimDoDia(data: Date) {
  const d = new Date(data);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Manipulador GET para consultar o extrato filtrado de pagamentos de Ordens de Serviço.
 * Exige permissão `pagamentos.ver` ou `relatorios.financeiro`.
 * @param request - Requisição HTTP contendo query params (`inicio`, `fim`, `forma`)
 * @returns Resposta JSON com resumo consolidado e lista de pagamentos
 */
export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi(["pagamentos.ver", "relatorios.financeiro"]);

    if (!acesso.ok) {
      return acesso.response;
    }

    const { searchParams } = new URL(request.url);

    const hoje = new Date();

    const inicioParam = searchParams.get("inicio");
    const fimParam = searchParams.get("fim");
    const formaParam = searchParams.get("forma");

    const inicioInformado = criarDataLocalSegura(inicioParam);
    const fimInformado = criarDataLocalSegura(fimParam);
    const formaPagamento = formaPagamentoValida(formaParam);

    if (inicioParam && !inicioInformado) {
      return NextResponse.json(
        { message: "Data inicial inválida." },
        { status: 400 }
      );
    }

    if (fimParam && !fimInformado) {
      return NextResponse.json(
        { message: "Data final inválida." },
        { status: 400 }
      );
    }

    if (formaPagamento === "INVALIDA") {
      return NextResponse.json(
        { message: "Forma de pagamento inválida." },
        { status: 400 }
      );
    }

    const dataInicial = inicioInformado
      ? inicioDoDia(inicioInformado)
      : new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0, 0);

    const dataFinal = fimInformado
      ? fimDoDia(fimInformado)
      : new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);

    if (dataFinal < dataInicial) {
      return NextResponse.json(
        { message: "A data final não pode ser menor que a data inicial." },
        { status: 400 }
      );
    }

    const where: Prisma.ServiceOrderPaymentWhereInput = {
      createdAt: {
        gte: dataInicial,
        lte: dataFinal,
      },
    };

    if (formaPagamento) {
      where.paymentMethod = formaPagamento;
    }

    await reconciliarEstornosOrdensCanceladas();

    const pagamentos = await prisma.serviceOrderPayment.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        amount: true,
        percent: true,
        paymentMethod: true,
        note: true,
        userName: true,
        createdAt: true,
        serviceOrder: {
          select: {
            id: true,
            osNumber: true,
            status: true,
            totalAmount: true,
            customer: {
              select: {
                name: true,
                whatsapp: true,
              },
            },
          },
        },
      },
    });

    const totalRecebido = pagamentos.reduce((total, pagamento) => {
      return total + Number(pagamento.amount || 0);
    }, 0);

    const totalPorForma = pagamentos.reduce<Record<string, number>>(
      (acc, pagamento) => {
        const forma = pagamento.paymentMethod || "NAO_INFORMADO";
        acc[forma] = (acc[forma] || 0) + Number(pagamento.amount || 0);
        return acc;
      },
      {}
    );

    const pagamentosPositivos = pagamentos.filter(
      (p) => Number(p.amount || 0) > 0
    );
    const estornos = pagamentos.filter((p) => Number(p.amount || 0) < 0);
    const totalPagamentos = pagamentosPositivos.length;
    const totalEstornos = estornos.length;
    const ticketMedio =
      totalPagamentos > 0 ? Math.max(0, totalRecebido / totalPagamentos) : 0;

    return NextResponse.json({
      resumo: {
        totalRecebido,
        totalPagamentos,
        totalEstornos,
        ticketMedio,
        dataInicial: dataInicial.toISOString(),
        dataFinal: dataFinal.toISOString(),
        formaPagamento: formaPagamento || "TODAS",
        totalPorForma,
      },
      pagamentos,
    });
  } catch (error) {
    console.error("Erro ao buscar pagamentos:", error);

    return NextResponse.json(
      { message: "Erro ao buscar pagamentos." },
      { status: 500 }
    );
  }
}