import { NextResponse } from "next/server";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirAdministradorApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numeroSeguro(valor: unknown) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function pagamentoValido(valor: unknown): PaymentMethod {
  const recebido = String(valor || "").trim();

  if (Object.values(PaymentMethod).includes(recebido as PaymentMethod)) {
    if (recebido !== PaymentMethod.AGUARDANDO_PAGAMENTO) {
      return recebido as PaymentMethod;
    }
  }

  return PaymentMethod.PIX;
}

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
