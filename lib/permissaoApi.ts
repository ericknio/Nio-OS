// lib/permissaoApi.ts
import { NextResponse } from "next/server";
import { obterUsuarioLogado } from "@/lib/authSistema";

type PermissaoNecessaria = string | string[];

export const PERMISSAO_DADOS_FINANCEIROS_SENSIVEIS =
  "relatorios.financeiro" as const;

type UsuarioComPermissoes = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  permissions?: string[];
};

function respostaJson(message: string, status: number, extra?: object) {
  return NextResponse.json(
    {
      message,
      ...(extra || {}),
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export function usuarioTemPermissao(
  usuario: UsuarioComPermissoes | null | undefined,
  permissao: PermissaoNecessaria
) {
  if (!usuario) return false;
  if (usuario.status !== "ATIVO") return false;
  if (usuario.role === "ADMIN") return true;

  const permissoes = Array.isArray(usuario.permissions)
    ? usuario.permissions
    : [];

  if (Array.isArray(permissao)) {
    return permissao.some((item) => permissoes.includes(item));
  }

  return permissoes.includes(permissao);
}

export function usuarioPodeVerDadosFinanceirosSensiveis(
  usuario: UsuarioComPermissoes | null | undefined
) {
  return usuarioTemPermissao(
    usuario,
    PERMISSAO_DADOS_FINANCEIROS_SENSIVEIS
  );
}

export async function exigirPermissaoApi(permissao: PermissaoNecessaria) {
  const usuario = await obterUsuarioLogado();

  if (!usuario) {
    return {
      ok: false as const,
      usuario: null,
      response: respostaJson("Usuário não autenticado.", 401),
    };
  }

  if (!usuarioTemPermissao(usuario, permissao)) {
    return {
      ok: false as const,
      usuario,
      response: respostaJson(
        "Você não tem permissão para acessar este recurso.",
        403,
        {
          permissaoNecessaria: permissao,
        }
      ),
    };
  }

  return {
    ok: true as const,
    usuario,
  };
}

export async function exigirAdministradorApi() {
  const usuario = await obterUsuarioLogado();

  if (!usuario) {
    return {
      ok: false as const,
      usuario: null,
      response: respostaJson("Usuário não autenticado.", 401),
    };
  }

  if (usuario.status !== "ATIVO" || usuario.role !== "ADMIN") {
    return {
      ok: false as const,
      usuario,
      response: respostaJson(
        "Apenas administradores podem acessar este recurso.",
        403
      ),
    };
  }

  return {
    ok: true as const,
    usuario,
  };
}
