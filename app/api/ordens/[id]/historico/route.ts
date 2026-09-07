import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const acesso = await exigirPermissaoApi("ordens.ver");

    if (!acesso.ok) {
      return acesso.response;
    }

    const { id } = await params;

    const historico = await prisma.historicoOrdem.findMany({
      where: {
        ordemId: id,
      },
      orderBy: {
        criadoEm: "desc",
      },
    });

    return Response.json(historico);
  } catch (error) {
    console.error("Erro ao buscar histórico da OS:", error);

    return Response.json(
      {
        error: "Erro ao buscar histórico da OS.",
      },
      {
        status: 500,
      }
    );
  }
}
