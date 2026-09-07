import { NextResponse } from "next/server";
import { SystemUserRole, SystemUserStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { criarHashSenha } from "@/lib/authSistema";
import {
  email,
  emailValido,
  exigirGerenciarUsuarios,
  formatarUsuarioSistema,
  participacaoLucroParaSalvar,
  participacaoLucroPdvParaSalvar,
  permissoesParaSalvar,
  respostaErro,
  roleValida,
  selectUsuarioSistema,
  statusValido,
  texto,
} from "@/lib/server/usuariosSistemaCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function existeOutroAdminAtivo(id: string) {
  const total = await prisma.systemUser.count({
    where: {
      id: {
        not: id,
      },
      role: SystemUserRole.ADMIN,
      status: SystemUserStatus.ATIVO,
    },
  });

  return total > 0;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    
    const acesso = await exigirGerenciarUsuarios();

    if (!acesso.ok) {
      return acesso.response;
    }

    if (acesso.usuario.role !== SystemUserRole.ADMIN) {
      return respostaErro("Apenas administradores podem gerenciar usuários.", 403);
    }

    const { id } = await context.params;
    const body = await request.json().catch(() => null);

    if (!id) {
      return respostaErro("ID do usuario nao informado.");
    }

    const name = texto(body?.name);
    const userEmail = email(body?.email);
    const role = roleValida(body?.role) || SystemUserRole.ATENDENTE;
    const status = statusValido(body?.status) || SystemUserStatus.ATIVO;
    const novaSenha = texto(body?.password);
    const permissions = permissoesParaSalvar(body?.permissions, role);
    const profitShare = participacaoLucroParaSalvar(body, role);
    const pdvProfitShare = participacaoLucroPdvParaSalvar(body, role);

    if (!profitShare) {
      return respostaErro(
        "Informe um percentual de participação no lucro maior que 0 e até 100."
      );
    }

    if (!pdvProfitShare) {
      return respostaErro(
        "Informe um percentual de participação no lucro do PDV maior que 0 e até 100."
      );
    }

    if (!name) {
      return respostaErro("Informe o nome do usuario.");
    }

    if (userEmail && !emailValido(userEmail)) {
      return respostaErro("Informe um e-mail valido.");
    }

    if (role !== SystemUserRole.ADMIN && permissions.length === 0) {
      return respostaErro("Marque pelo menos uma permissao para o usuario.");
    }

    const usuarioAtual = await prisma.systemUser.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!usuarioAtual) {
      return respostaErro("Usuario nao encontrado.", 404);
    }

    const editandoProprioUsuario = acesso.usuario.id === id;

    if (editandoProprioUsuario && status !== SystemUserStatus.ATIVO) {
      return respostaErro(
        "Voce nao pode bloquear ou inativar seu proprio usuario."
      );
    }

    if (editandoProprioUsuario && role !== SystemUserRole.ADMIN) {
      return respostaErro(
        "Voce nao pode remover seu proprio perfil de administrador."
      );
    }

    if (
      editandoProprioUsuario &&
      role !== SystemUserRole.ADMIN &&
      !permissions.includes("usuarios.gerenciar")
    ) {
      return respostaErro(
        "Voce nao pode remover sua propria permissao de gerenciar usuarios."
      );
    }

    const removendoAdminAtivo =
      usuarioAtual.role === SystemUserRole.ADMIN &&
      usuarioAtual.status === SystemUserStatus.ATIVO &&
      (role !== SystemUserRole.ADMIN || status !== SystemUserStatus.ATIVO);

    if (removendoAdminAtivo) {
      const temOutroAdminAtivo = await existeOutroAdminAtivo(id);

      if (!temOutroAdminAtivo) {
        return respostaErro(
          "Nao e permitido deixar o sistema sem administrador ativo."
        );
      }
    }

    if (userEmail) {
      const emailDuplicado = await prisma.systemUser.findFirst({
        where: {
          id: {
            not: id,
          },
          email: userEmail,
        },
        select: {
          id: true,
        },
      });

      if (emailDuplicado) {
        return respostaErro("Ja existe outro usuario com esse e-mail.");
      }
    }

    const data: Prisma.SystemUserUpdateInput = {
      name,
      email: userEmail,
      role,
      status,
      profitShareEnabled: profitShare.enabled,
      profitSharePercent: profitShare.percent,
      pdvProfitShareEnabled: pdvProfitShare.enabled,
      pdvProfitSharePercent: pdvProfitShare.percent,
      permissions: {
        deleteMany: {},
        create: permissions.map((key) => ({
          key,
        })),
      },
    };

    if (novaSenha) {
      if (novaSenha.length < 6) {
        return respostaErro("A nova senha precisa ter pelo menos 6 caracteres.");
      }

      data.passwordHash = criarHashSenha(novaSenha);
    }

    const usuario = await prisma.systemUser.update({
      where: {
        id,
      },
      data,
      select: selectUsuarioSistema,
    });

    return NextResponse.json({
      message: "Usuario atualizado com sucesso.",
      usuario: formatarUsuarioSistema(usuario),
    });
  } catch (error) {
    console.error("Erro ao atualizar usuario:", error);

    return NextResponse.json(
      {
        message: "Erro ao atualizar usuario.",
      },
      { status: 500 }
    );
  }
}
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirGerenciarUsuarios();

    if (!acesso.ok) {
      return acesso.response;
    }

    if (acesso.usuario.role !== SystemUserRole.ADMIN) {
      return respostaErro(
        "Apenas administradores podem excluir usuários.",
        403
      );
    }

    const { id } = await context.params;

    if (!id) {
      return respostaErro("ID do usuário não informado.");
    }

    if (acesso.usuario.id === id) {
      return respostaErro("Você não pode excluir seu próprio usuário.");
    }

    const usuarioAtual = await prisma.systemUser.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
      },
    });

    if (!usuarioAtual) {
      return respostaErro("Usuário não encontrado.", 404);
    }

    const removendoAdminAtivo =
      usuarioAtual.role === SystemUserRole.ADMIN &&
      usuarioAtual.status === SystemUserStatus.ATIVO;

    if (removendoAdminAtivo) {
      const temOutroAdminAtivo = await existeOutroAdminAtivo(id);

      if (!temOutroAdminAtivo) {
        return respostaErro(
          "Não é permitido deixar o sistema sem administrador ativo."
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.systemUser.update({
        where: {
          id,
        },
        data: {
          permissions: {
            deleteMany: {},
          },
        },
        select: {
          id: true,
        },
      });

      await tx.systemUser.delete({
        where: {
          id,
        },
      });
    });

    return NextResponse.json({
      message: "Usuário excluído com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);

    return NextResponse.json(
      {
        message: "Erro ao excluir usuário.",
      },
      { status: 500 }
    );
  }
}