// app/api/ordens/atrasadas/route.ts
// v1.1.0 - Mantém proteção server-side e sanitização financeira.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inicioDoDia(data: Date) {
  const novaData = new Date(data);
  novaData.setHours(0, 0, 0, 0);
  return novaData;
}

function calcularDiasAtraso(dataPrevisao: Date | string | null) {
  if (!dataPrevisao) return 0;

  const hoje = inicioDoDia(new Date());
  const previsao = inicioDoDia(new Date(dataPrevisao));

  if (Number.isNaN(previsao.getTime())) return 0;

  const umDia = 1000 * 60 * 60 * 24;
  const diferenca = Math.floor((hoje.getTime() - previsao.getTime()) / umDia);

  return Math.max(diferenca, 0);
}

function resumoPorStatus(ordens: { status: string }[]) {
  return {
    recebido: ordens.filter((ordem) => ordem.status === "RECEBIDO").length,
    emAnalise: ordens.filter((ordem) => ordem.status === "EM_ANALISE").length,
    aguardandoPeca: ordens.filter((ordem) => ordem.status === "AGUARDANDO_PECA")
      .length,
    emReparo: ordens.filter((ordem) => ordem.status === "EM_REPARO").length,
  };
}

export async function GET() {
  try {
    const acesso = await exigirPermissaoApi("ordens.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const hoje = inicioDoDia(new Date());

    const ordens = await prisma.serviceOrder.findMany({
      where: {
        expectedDeliveryDate: {
          lt: hoje,
        },
        status: {
          notIn: ["PRONTO", "ENTREGUE", "CANCELADO"],
        },
      },
      select: {
        id: true,
        osNumber: true,

        customer: {
          select: {
            id: true,
            name: true,
            whatsapp: true,
          },
        },

        equipmentType: true,
        equipmentOther: true,
        brand: true,
        model: true,

        status: true,
        totalAmount: true,
        openedAt: true,
        expectedDeliveryDate: true,
      },
      orderBy: {
        expectedDeliveryDate: "asc",
      },
    });

    const ordensFormatadas = ordens.map((ordem) => {
      const diasAtraso = calcularDiasAtraso(ordem.expectedDeliveryDate);

      return {
        id: ordem.id,
        osNumber: ordem.osNumber,

        customer: ordem.customer,
        customerName: ordem.customer?.name || null,
        customerWhatsapp: ordem.customer?.whatsapp || null,

        equipmentType: ordem.equipmentType,
        equipmentOther: ordem.equipmentOther,
        brand: ordem.brand,
        model: ordem.model,

        status: ordem.status,
        totalAmount: ordem.totalAmount,
        openedAt: ordem.openedAt,
        expectedDeliveryDate: ordem.expectedDeliveryDate,

        diasAtraso,
        daysLate: diasAtraso,
      };
    });

    const maiorAtraso = ordensFormatadas.reduce((maior, ordem) => {
      return ordem.diasAtraso > maior ? ordem.diasAtraso : maior;
    }, 0);

    const valorEmAberto = ordens.reduce(
      (total, ordem) => total + Number(ordem.totalAmount || 0),
      0
    );

    return NextResponse.json({
      financeiroLiberado: true,
      resumo: {
        total: ordensFormatadas.length,
        maiorAtraso,
        valorEmAberto,
        ...resumoPorStatus(ordensFormatadas),
      },
      ordens: ordensFormatadas,
    });
  } catch (error) {
    console.error("Erro ao buscar OS atrasadas:", error);

    return NextResponse.json(
      { message: "Erro ao buscar OS atrasadas." },
      { status: 500 }
    );
  }
}
