import { NextResponse } from "next/server";
import { SystemUserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { permissoesPadraoPorPerfil } from "@/lib/permissoesSistema";
import {
  exigirGerenciarUsuarios,
  respostaErro,
} from "@/lib/server/usuariosSistemaCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const acesso = await exigirGerenciarUsuarios();

    if (!acesso.ok) {
      return acesso.response;
    }

    if (acesso.usuario.role !== SystemUserRole.ADMIN) {
      return respostaErro(
        "Apenas administradores podem reaplicar permissões padrão.",
        403
      );
    }

    const usuarios = await prisma.systemUser.findMany({
      select: {
        id: true,
        role: true,
      },
    });

    const resultado = await prisma.$transaction(async (tx) => {
      let atualizados = 0;

      const resumo: Record<string, number> = {
        ADMIN: 0,
        ATENDENTE: 0,
        TECNICO: 0,
        FINANCEIRO: 0,
        OUTROS: 0,
      };

      for (const usuario of usuarios) {
        const role = String(usuario.role || "").toUpperCase();
        const permissoes = permissoesPadraoPorPerfil(role);

        await tx.systemUser.update({
          where: {
            id: usuario.id,
          },
          data: {
            permissions: {
              deleteMany: {},
              create: permissoes.map((key) => ({
                key,
              })),
            },
          },
          select: {
            id: true,
          },
        });

        atualizados += 1;

        if (resumo[role] !== undefined) {
          resumo[role] += 1;
        } else {
          resumo.OUTROS += 1;
        }
      }

      return {
        atualizados,
        resumo,
      };
    });

    return NextResponse.json({
      message: `Permissões padrão reaplicadas em ${resultado.atualizados} usuário(s).`,
      ...resultado,
    });
  } catch (error) {
    console.error("Erro ao reaplicar permissões padrão:", error);

    return NextResponse.json(
      {
        message: "Erro ao reaplicar permissões padrão.",
      },
      {
        status: 500,
      }
    );
  }
}