/**
 * @file permissaoApi.ts
 * @description Middleware e guardiões de segurança para proteção de rotas de API (Next.js Route Handlers).
 * 
 * Intercepta requisições HTTP e valida se o usuário conectado possui a sessão ativa
 * e as permissões necessárias (RBAC) para executar a operação ou visualizar dados confidenciais.
 */

import { NextResponse } from "next/server";
import { obterUsuarioLogado } from "@/lib/authSistema";

/**
 * Representa uma permissão individual ou uma lista onde ao menos uma satisfaz a condição.
 */
type PermissaoNecessaria = string | string[];

/**
 * Permissão necessária para visualizar dados confidenciais de lucratividade e custo de peças.
 */
export const PERMISSAO_DADOS_FINANCEIROS_SENSIVEIS =
  "relatorios.financeiro" as const;

/**
 * Estrutura do operador autenticado com sua lista de permissões ativas.
 */
type UsuarioComPermissoes = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  permissions?: string[];
};

/**
 * Gera uma resposta padronizada em formato JSON com cabeçalho de no-cache.
 *
 * @param message - Mensagem explicativa do erro ou status
 * @param status - Código de status HTTP (ex: 401, 403)
 * @param extra - Propriedades adicionais a incluir no payload JSON
 * @returns Instância de NextResponse configurada
 */
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

/**
 * Avalia se o usuário fornecido possui a permissão exigida.
 * Administradores com status ATIVO possuem aprovação imediata para qualquer permissão.
 *
 * @param usuario - Objeto do usuário logado
 * @param permissao - Código da permissão ou array de permissões alternativas
 * @returns true se autorizado; false se desautorizado, inativo ou nulo
 */
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

/**
 * Verifica se o usuário tem autorização para visualizar dados financeiros sensíveis
 * (custos de compra de peças, margens brutas e lucros líquidos de Ordens de Serviço).
 *
 * @param usuario - Objeto do usuário autenticado
 * @returns true se tiver permissão de relatórios financeiros ou for administrador
 */
export function usuarioPodeVerDadosFinanceirosSensiveis(
  usuario: UsuarioComPermissoes | null | undefined
) {
  return usuarioTemPermissao(
    usuario,
    PERMISSAO_DADOS_FINANCEIROS_SENSIVEIS
  );
}

/**
 * Guardião de API: Intercepta a rota e bloqueia requisições sem autenticação (401)
 * ou sem a permissão necessária (403).
 *
 * @param permissao - Código da permissão requerida para a rota
 * @returns Objeto com { ok: true, usuario } ou { ok: false, response } para retorno imediato da rota
 * @example
 * const auth = await exigirPermissaoApi("ordens.criar");
 * if (!auth.ok) return auth.response;
 */
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

/**
 * Guardião estrito de API: Exige que o usuário seja especificamente um ADMINISTRADOR ativo.
 * Utilizado em rotas críticas como gerenciamento de usuários, limpeza de banco e configurações gerais.
 *
 * @returns Objeto com { ok: true, usuario } ou { ok: false, response } com status 401/403
 */
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
