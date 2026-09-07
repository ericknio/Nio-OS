import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const acesso = await exigirPermissaoApi([
    "ordens.marcar_pronto",
    "ordens.criar",
    "ordens.editar",
    "ordens.ver",
  ]);
  if (!acesso.ok) return acesso.response;

  try {
    const tecnicos = await prisma.systemUser.findMany({
      where: {
        role: SystemUserRole.TECNICO,
        status: SystemUserStatus.ATIVO,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        profitShareEnabled: true,
        profitSharePercent: true,
      },
    });

    return NextResponse.json({ tecnicos }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { message: "Não foi possível carregar os técnicos." },
      { status: 500, headers: noStore }
    );
  }
}
