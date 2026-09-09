/**
 * @file app/api/usuarios-sistema/route.ts
 * @description Gestão de usuários e operadores do sistema Nio-OS (Listagem e Cadastro).
 * 
 * Exclusivo para administradores: gerencia login, hash de senha com bcrypt,
 * atribuição de cargos (Admin, Técnico, Atendente, Financeiro), permissões atômicas
 * e percentuais de comissão/participação nos lucros para técnicos e atendentes.
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
  login,
  loginValido,
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
 * Endpoint GET /api/usuarios-sistema
 * 
 * Lista todos os operadores do sistema com filtros opcionais por busca, cargo ou status.
 * Exige perfil de Administrador com status ATIVO.
 *
 * @param request - Requisição HTTP contendo query params (?busca=...&role=...&status=...)
 * @returns Lista de usuários com senhas omitidas
 */
export async function GET(request: Request) {
  try {
    const acesso = await exigirGerenciarUsuarios();

    if (!acesso.ok) {
      return acesso.response;
    }

    if (acesso.usuario.role !== SystemUserRole.ADMIN) {
      return respostaErro("Apenas administradores podem gerenciar usuários.", 403);
    }

    const { searchParams } = new URL(request.url);

    const busca = texto(searchParams.get("busca"));
    const roleParam = texto(searchParams.get("role"));
    const statusParam = texto(searchParams.get("status"));

    const where: Prisma.SystemUserWhereInput = {};

    if (busca) {
      where.OR = [
        {
          name: {
            contains: busca,
          },
        },
        {
          username: {
            contains: busca.toLowerCase(),
          },
        },
        {
          email: {
            contains: busca.toLowerCase(),
          },
        },
      ];
    }

    if (roleParam && roleParam !== "TODOS") {
      const role = roleValida(roleParam);

      if (!role) {
        return respostaErro("Perfil de usuario invalido.");
      }

      where.role = role;
    }

    if (statusParam && statusParam !== "TODOS") {
      const status = statusValido(statusParam);

      if (!status) {
        return respostaErro("Status de usuario invalido.");
      }

      where.status = status;
    }

    const usuarios = await prisma.systemUser.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: selectUsuarioSistema,
    });

    return NextResponse.json({
      usuarios: usuarios.map(formatarUsuarioSistema),
    });
  } catch (error) {
    console.error("Erro ao listar usuarios:", error);

    return NextResponse.json(
      {
        message: "Erro ao listar usuarios.",
      },
      { status: 500 }
    );
  }
}

/**
 * Endpoint POST /api/usuarios-sistema
 * 
 * Cadastra um novo operador ou funcionário no sistema local.
 * Criptografa a senha com hash seguro (bcrypt), define permissões atômicas baseadas
 * no cargo e configura o percentual de comissão sobre serviços (técnicos) ou vendas (atendentes).
 *
 * @param request - Requisição HTTP com os dados do usuário (nome, login, senha, cargo, comissões)
 * @returns Dados do usuário criado com HTTP 201
 */
export async function POST(request: Request) {
  try {
    const acesso = await exigirGerenciarUsuarios();

    if (!acesso.ok) {
      return acesso.response;
    }

    if (acesso.usuario.role !== SystemUserRole.ADMIN) {
      return respostaErro("Apenas administradores podem gerenciar usuários.", 403);
    }

    const body = await request.json().catch(() => null);

    const name = texto(body?.name);
    const username = login(body?.username);
    const userEmail = email(body?.email);
    const password = texto(body?.password);
    const role = roleValida(body?.role) || SystemUserRole.ATENDENTE;
    const status = statusValido(body?.status) || SystemUserStatus.ATIVO;
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

    if (!username || username.length < 3) {
      return respostaErro("O login precisa ter pelo menos 3 caracteres.");
    }

    if (!loginValido(username)) {
      return respostaErro(
        "Use apenas letras, numeros, ponto, traco ou underline no login."
      );
    }

    if (!password || password.length < 6) {
      return respostaErro("A senha precisa ter pelo menos 6 caracteres.");
    }

    if (userEmail && !emailValido(userEmail)) {
      return respostaErro("Informe um e-mail valido.");
    }

    if (role !== SystemUserRole.ADMIN && permissions.length === 0) {
      return respostaErro("Marque pelo menos uma permissao para o usuario.");
    }

    const usuarioExistente = await prisma.systemUser.findFirst({
      where: {
        OR: [
          {
            username,
          },
          ...(userEmail
            ? [
                {
                  email: userEmail,
                },
              ]
            : []),
        ],
      },
      select: {
        username: true,
        email: true,
      },
    });

    if (usuarioExistente) {
      return respostaErro(
        usuarioExistente.username === username
          ? "Ja existe um usuario com esse login."
          : "Ja existe um usuario com esse e-mail."
      );
    }

    const usuario = await prisma.systemUser.create({
      data: {
        name,
        username,
        email: userEmail,
        passwordHash: criarHashSenha(password),
        role,
        status,
        profitShareEnabled: profitShare.enabled,
        profitSharePercent: profitShare.percent,
        pdvProfitShareEnabled: pdvProfitShare.enabled,
        pdvProfitSharePercent: pdvProfitShare.percent,
        permissions: {
          create: permissions.map((key) => ({
            key,
          })),
        },
      },
      select: selectUsuarioSistema,
    });

    return NextResponse.json(
      {
        message: "Usuario criado com sucesso.",
        usuario: formatarUsuarioSistema(usuario),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar usuario:", error);

    return NextResponse.json(
      {
        message: "Erro ao criar usuario.",
      },
      { status: 500 }
    );
  }
}