import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FiltroGarantia =
  | "TODAS"
  | "VIGENTE"
  | "VENCENDO"
  | "VENCIDA"
  | "SEM_GARANTIA";

const FILTROS_PERMITIDOS: FiltroGarantia[] = [
  "TODAS",
  "VIGENTE",
  "VENCENDO",
  "VENCIDA",
  "SEM_GARANTIA",
];

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

function normalizarFiltro(valor: string | null): FiltroGarantia {
  const filtro = String(valor || "TODAS").trim().toUpperCase();

  return FILTROS_PERMITIDOS.includes(filtro as FiltroGarantia)
    ? (filtro as FiltroGarantia)
    : "TODAS";
}

function resolverStatusGarantia({
  venceEm,
  diasRestantes,
}: {
  venceEm: Date | null;
  diasRestantes: number | null;
}): Exclude<FiltroGarantia, "TODAS"> {
  if (!venceEm || diasRestantes === null) return "SEM_GARANTIA";
  if (diasRestantes < 0) return "VENCIDA";
  if (diasRestantes <= 7) return "VENCENDO";

  return "VIGENTE";
}

function montarResumo(
  garantias: {
    statusGarantia: Exclude<FiltroGarantia, "TODAS">;
  }[]
) {
  return {
    total: garantias.length,
    vigentes: garantias.filter((item) => item.statusGarantia === "VIGENTE")
      .length,
    vencendo: garantias.filter((item) => item.statusGarantia === "VENCENDO")
      .length,
    vencidas: garantias.filter((item) => item.statusGarantia === "VENCIDA")
      .length,
    semGarantia: garantias.filter(
      (item) => item.statusGarantia === "SEM_GARANTIA"
    ).length,
  };
}

export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("garantias.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { searchParams } = new URL(request.url);
    const filtro = normalizarFiltro(searchParams.get("filtro"));

    const ordens = await prisma.serviceOrder.findMany({
      where: {
        finalization: {
          isNot: null,
        },
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
        customer: {
          select: {
            id: true,
            name: true,
            whatsapp: true,
          },
        },
        finalization: {
          select: {
            deliveredAt: true,
            warrantyDays: true,
          },
        },
      },
      orderBy: {
        openedAt: "desc",
      },
    });

    const hoje = new Date();

    const todasGarantias = ordens.map((ordem) => {
      const entregueEm = ordem.finalization?.deliveredAt
        ? new Date(ordem.finalization.deliveredAt)
        : null;

      const warrantyDays = Number(ordem.finalization?.warrantyDays || 0);

      const venceEm =
        entregueEm && warrantyDays > 0
          ? adicionarDias(entregueEm, warrantyDays)
          : null;

      const diasRestantes = venceEm ? diferencaDias(venceEm, hoje) : null;

      const statusGarantia = resolverStatusGarantia({
        venceEm,
        diasRestantes,
      });

      return {
        id: ordem.id,
        serviceOrderId: ordem.id,
        orderId: ordem.id,
        osNumber: ordem.osNumber,
        numeroOS: ordem.osNumber,

        customer: ordem.customer,
        customerName: ordem.customer?.name || "-",
        customerWhatsapp: ordem.customer?.whatsapp || null,

        equipmentType: ordem.equipmentType,
        equipmentOther: ordem.equipmentOther,
        brand: ordem.brand,
        model: ordem.model,

        orderStatus: ordem.status,

        entregueEm,
        deliveredAt: entregueEm,

        warrantyDays,
        garantiaDias: warrantyDays,

        venceEm,
        warrantyExpiresAt: venceEm,
        expiresAt: venceEm,

        diasRestantes,
        daysRemaining: diasRestantes,

        statusGarantia,
        warrantyStatus: statusGarantia,
      };
    });

    const garantias =
      filtro === "TODAS"
        ? todasGarantias
        : todasGarantias.filter((item) => item.statusGarantia === filtro);

    return NextResponse.json({
      filtro,
      resumo: montarResumo(garantias),
      resumoGeral: montarResumo(todasGarantias),
      garantias,
    });
  } catch (error) {
    console.error("Erro ao buscar garantias:", error);

    return NextResponse.json(
      { message: "Erro ao buscar garantias." },
      { status: 500 }
    );
  }
}