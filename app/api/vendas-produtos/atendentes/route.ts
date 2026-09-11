/**
 * @file route.ts
 * @description Endpoint para listagem resumida de atendentes ativos para seleção no ponto de venda (PDV).
 *
 * Exige a permissão `vendas.registrar` e retorna a lista de operadores com papel `ATENDENTE` e status `ATIVO`
 * ordenados alfabeticamente para seleção rápida durante o atendimento ao cliente.
 */

import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cabeçalhos HTTP para desativar cacheamento de resposta.
 */
const noStore = { "Cache-Control": "no-store" };

/**
 * Handler GET para listar atendentes ativos aptos a receber atribuição de vendas e comissionamento no PDV.
 *
 * @returns JSON contendo a lista de atendentes (id, name, username)
 */
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

