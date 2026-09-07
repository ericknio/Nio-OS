import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const acesso = await exigirPermissaoApi("vendas.registrar");
  if (!acesso.ok) return acesso.response;

  try {
    const atendentes = await prisma.systemUser.findMany({
      where: {
        role: SystemUserRole.ATENDENTE,
        status: SystemUserStatus.ATIVO,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
      },
    });

    return NextResponse.json({ atendentes }, { headers: noStore });
  } catch {
    return NextResponse.json(
      { message: "Não foi possível carregar os atendentes." },
      { status: 500, headers: noStore }
    );
  }
}
