/**
 * @file route.ts
 * @description Endpoint de gerenciamento individual de operadores e usuários do sistema (`/api/usuarios-sistema/[id]`).
 * Suporta operações de atualização cadastral/permissões (`PATCH`) e exclusão definitiva (`DELETE`).
 *
 * Travas de Segurança e Integridade Arquitetural:
 * 1. Autorização Estrita: Acesso exclusivo para administradores (`SystemUserRole.ADMIN`).
 * 2. Prevenção de Auto-Bloqueio (Lock-out):
 *    - O administrador conectado não pode inativar nem rebaixar seu próprio usuário.
 *    - Não é permitido inativar, despromover ou excluir o último administrador ativo da empresa.
 * 3. Sanitização & Validação: Validação de e-mail único, complexidade mínima de senha e limites de participação nos lucros.
 * 4. Consistência Relacional: Remoção em cascata transacional de permissões associadas antes da exclusão física.
 */

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

/**
 * Contexto da rota com o identificador único do usuário nos parâmetros dinâmicos.
 */
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Verifica no banco de dados se há ao menos outro usuário ativo com perfil de administrador
 * além do usuário cujo ID foi fornecido. Previne que o sistema fique sem gestão.
 *
 * @param id - Identificador do usuário que está sendo modificado ou excluído
 * @returns True se houver pelo menos mais um admin ativo; false caso contrário
 */
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

/**
 * Handler PATCH para atualização parcial ou total dos dados, credenciais e permissões de um usuário.
 *
 * Regras de Validação:
 * - Exige papel ADMIN autenticado.
 * - Impede auto-inativação ou remoção de privilégios do próprio administrador logado.
 * - Impede remover o último administrador ativo da aplicação.
 * - Valida unicidade de e-mail e formato válido.
 * - Criptografa nova senha via bcrypt se fornecida (mínimo de 6 dígitos).
 * - Atualiza permissões granulares e percentuais de participação nos lucros (OS e PDV).
 *
 * @param request - Requisição HTTP com o payload JSON de atualização
 * @param context - Contexto contendo o parâmetro dinâmico `id`
 * @returns JSON com os dados do usuário atualizado formatado
 */
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

/**
 * Handler DELETE para exclusão definitiva de um usuário do sistema.
 *
 * Regras de Segurança:
 * 1. Acesso restrito a administradores ativos.
 * 2. Bloqueia auto-exclusão: o administrador autenticado não pode se auto-remover.
 * 3. Garante a sobrevivência administrativa: impede a exclusão se for o único administrador ativo restante.
 * 4. Transação Atômica: Remove previamente os registros filhos de permissões vinculados ao usuário
 *    e em seguida remove a conta do banco.
 *
 * @param _request - Requisição HTTP recebida
 * @param context - Contexto contendo o parâmetro dinâmico `id` do usuário
 * @returns JSON confirmando a exclusão ou mensagem de erro
 */
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