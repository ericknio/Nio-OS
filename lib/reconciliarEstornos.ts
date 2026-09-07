import { prisma } from "./prisma";

export async function reconciliarEstornosOrdensCanceladas(): Promise<{
  reconciliadas: number;
  totalEstornado: number;
}> {
  try {
    const ordensCanceladas = await prisma.serviceOrder.findMany({
      where: {
        status: "CANCELADO",
      },
      include: {
        payments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    let reconciliadas = 0;
    let totalEstornado = 0;

    for (const ordem of ordensCanceladas) {
      const somaPagamentos = ordem.payments.reduce(
        (acc, p) => acc + Number(p.amount || 0),
        0
      );
      const paidAmount = Number(ordem.paidAmount || 0);

      // Se há pagamentos não estornados (soma > 0) ou paidAmount ainda positivo
      const valorParaEstornar =
        somaPagamentos > 0 ? somaPagamentos : paidAmount > 0 ? paidAmount : 0;

      if (valorParaEstornar > 0) {
        const pagamentosPositivos = ordem.payments.filter(
          (p) => Number(p.amount || 0) > 0
        );
        const ultimoPagamento =
          pagamentosPositivos[pagamentosPositivos.length - 1];

        const formaDevolucao =
          ultimoPagamento?.paymentMethod || ordem.paymentMethod || "DINHEIRO";
        const operador =
          ultimoPagamento?.userName && ultimoPagamento.userName !== "Sistema"
            ? ultimoPagamento.userName
            : "Sistema";

        // Usar a data em que a OS foi cancelada (updatedAt) ou agora
        const dataEstorno = ordem.updatedAt || new Date();

        await prisma.$transaction([
          prisma.serviceOrderPayment.create({
            data: {
              serviceOrderId: ordem.id,
              amount: -valorParaEstornar,
              percent: 0,
              paymentMethod: formaDevolucao,
              note: "Estorno / Devolução ao cliente por cancelamento da OS.",
              userName: operador,
              createdAt: dataEstorno,
            },
          }),
          prisma.serviceOrder.update({
            where: { id: ordem.id },
            data: {
              paidAmount: 0,
              paymentPercent: 0,
            },
          }),
          prisma.orderHistory.create({
            data: {
              serviceOrderId: ordem.id,
              userName: operador,
              action: "ESTORNO_PAGAMENTO",
              description: `Estorno de pagamento registrado por cancelamento da OS. Valor devolvido ao cliente no caixa: ${valorParaEstornar.toLocaleString(
                "pt-BR",
                {
                  style: "currency",
                  currency: "BRL",
                }
              )} (${formaDevolucao}).`,
              createdAt: dataEstorno,
            },
          }),
        ]);

        reconciliadas += 1;
        totalEstornado += valorParaEstornar;
      } else if (paidAmount > 0) {
        // Se a soma dos pagamentos já era zero, mas paidAmount da OS ainda não estava zerado
        await prisma.serviceOrder.update({
          where: { id: ordem.id },
          data: {
            paidAmount: 0,
            paymentPercent: 0,
          },
        });
      }
    }

    return { reconciliadas, totalEstornado };
  } catch (error) {
    console.error("Erro ao reconciliar estornos de ordens canceladas:", error);
    return { reconciliadas: 0, totalEstornado: 0 };
  }
}
