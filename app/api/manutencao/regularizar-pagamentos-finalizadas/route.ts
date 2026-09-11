/**
 * @file route.ts
 * @description Endpoint de manutenção administrativa para regularização de pagamentos em OS finalizadas (`/api/manutencao/regularizar-pagamentos-finalizadas`).
 * Identifica e regulariza inconsistências históricas em Ordens de Serviço com status `ENTREGUE`
 * cujo `paymentPercent < 100%` ou `paidAmount < finalAmount` (legados anteriores ao fechamento com quitação obrigatória).
 * Exige perfil de Administrador (`exigirAdministradorApi`).
 */

import { NextResponse } from "next/server";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirAdministradorApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Converte valor em número finito seguro, retornando 0 como fallback.
 * @param valor - Valor a converter
 * @returns Número seguro
 */
function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Valida se a forma de pagamento é aceita pelo enum do Prisma, evitando 'AGUARDANDO_PAGAMENTO'.
 * @param valor - Valor bruto da forma de pagamento
 * @returns Instância válida de PaymentMethod (padrão PIX)
 */
function pagamentoValido(valor: unknown): PaymentMethod {
  const recebido = String(valor || "").trim();

  if (Object.values(PaymentMethod).includes(recebido as PaymentMethod)) {
    if (recebido !== PaymentMethod.AGUARDANDO_PAGAMENTO) {
      return recebido as PaymentMethod;
    }
  }

  return PaymentMethod.PIX;
}

/**
 * Consulta no banco todas as OS entregues com divergência de quitação financeira.
 * @returns Array de Ordens de Serviço pendentes de regularização
 */
async function buscarOrdensParaRegularizar() {
  const ordens = await prisma.serviceOrder.findMany({
    where: {
      status: OrderStatus.ENTREGUE,
    },
    include: {
      customer: true,
      finalization: true,
      payments: true,
    },
    orderBy: {
      osNumber: "asc",
    },
  });

  return ordens.filter((ordem) => {
    if (!ordem.finalization) return false;

    const valorFinal = numeroSeguro(
      ordem.finalization.finalAmount || ordem.totalAmount
    );

    const valorPago = numeroSeguro(ordem.paidAmount);
    const percentualPago = numeroSeguro(ordem.paymentPercent);

    if (valorFinal <= 0) return false;

    return percentualPago < 100 || valorPago < valorFinal;
  });
}

/**
 * Manipulador GET para pré-visualizar quais OS entregues possuem pendência de regularização de pagamento.
 * Exige privilégios de Administrador.
 * @returns Resposta JSON com contagem total e lista de OS a regularizar
 */
export async function GET() {
  try {
    const acesso = await exigirAdministradorApi();

    if (!acesso.ok) {
      return acesso.response;
    }

    const ordens = await buscarOrdensParaRegularizar();

    return NextResponse.json({
      total: ordens.length,
      ordens: ordens.map((ordem) => ({
        id: ordem.id,
        osNumber: ordem.osNumber,
        cliente: ordem.customer?.name || "-",
        valorFinal: numeroSeguro(
          ordem.finalization?.finalAmount || ordem.totalAmount
        ),
        valorPagoAtual: numeroSeguro(ordem.paidAmount),
        percentualAtual: numeroSeguro(ordem.paymentPercent),
        formaPagamento:
          ordem.finalization?.paymentMethod || ordem.paymentMethod || "PIX",
      })),
    });
  } catch (error) {
    console.error("Erro ao buscar OS para regularizar:", error);

    return NextResponse.json(
      { message: "Erro ao buscar OS para regularizar." },
      { status: 500 }
    );
  }
}

/**
 * Manipulador POST para executar a regularização em lote dos pagamentos das OS entregues.
 * Atualiza `paidAmount = finalAmount`, `paymentPercent = 100`, cria o registro em `serviceOrderPayment`
 * e insere registro na trilha de auditoria (`REGULARIZACAO_PAGAMENTO`).
 * Exige perfil de Administrador.
 * @returns Resposta JSON confirmando o total de ordens regularizadas e relação de IDs
 */
export async function POST() {
  try {
    const acesso = await exigirAdministradorApi();

    if (!acesso.ok) {
      return acesso.response;
    }

    const ordens = await buscarOrdensParaRegularizar();

    const resultado = await prisma.$transaction(async (tx) => {
      const regularizadas = [];

      for (const ordem of ordens) {
        const valorFinal = numeroSeguro(
          ordem.finalization?.finalAmount || ordem.totalAmount
        );

        const formaPagamento = pagamentoValido(
          ordem.finalization?.paymentMethod || ordem.paymentMethod
        );

        const ordemAtualizada = await tx.serviceOrder.update({
          where: {
            id: ordem.id,
          },
          data: {
            totalAmount: valorFinal,
            paidAmount: valorFinal,
            paymentPercent: 100,
            paymentReceivedAt: new Date(),
            paymentMethod: formaPagamento,

            payments: {
              create: {
                amount: valorFinal,
                percent: 100,
                paymentMethod: formaPagamento,
                note: "Pagamento regularizado automaticamente para OS antiga já finalizada.",
              },
            },

            histories: {
              create: {
                userName: "Sistema",
                action: "REGULARIZACAO_PAGAMENTO",
                description:
                  "Pagamento de 100% regularizado automaticamente para OS antiga já finalizada.",
              },
            },
          },
        });

        regularizadas.push({
          id: ordemAtualizada.id,
          osNumber: ordemAtualizada.osNumber,
          valor: valorFinal,
          paymentMethod: formaPagamento,
        });
      }

      return regularizadas;
    });

    return NextResponse.json({
      message: "Pagamentos regularizados com sucesso.",
      total: resultado.length,
      regularizadas: resultado,
    });
  } catch (error) {
    console.error("Erro ao regularizar pagamentos:", error);

    return NextResponse.json(
      { message: "Erro ao regularizar pagamentos." },
      { status: 500 }
    );
  }
}
