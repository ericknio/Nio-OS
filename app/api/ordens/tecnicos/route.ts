/**
 * @file route.ts
 * @description Endpoint de consulta dos técnicos ativos no Nio-OS.
 * Fornece a lista de colaboradores com cargo TECNICO para seleção do responsável
 * pela bancada, orçamentos e comissionamento de mão de obra nas Ordens de Serviço.
 */

import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cabeçalho para prevenção de cache em requisições de lista de técnicos. */
const noStore = { "Cache-Control": "no-store" };

/**
 * Retorna a listagem de técnicos com status ATIVO ordenados alfabeticamente.
 * Exige uma das permissões operacionais: 'ordens.marcar_pronto', 'ordens.criar', 'ordens.editar' ou 'ordens.ver'.
 * 
 * @returns JSON com array de técnicos contendo ID, nome e percentual de participação/comissão
 */
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
