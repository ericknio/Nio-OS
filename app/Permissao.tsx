/**
 * @file app/Permissao.tsx
 * @description Sistema de autorização reativo no cliente (React Hooks & Componentes).
 * 
 * Implementa cache em memória com padrão Observer para sincronizar o estado do usuário logado
 * entre todos os componentes sem renderizações desnecessárias.
 * Fornece o hook `useUsuarioPermissoes` e o componente `<Permissao>` para controle visual.
 */

import { ReactNode, useEffect, useState, useCallback } from "react";

/**
 * Estrutura do operador logado retornada pela API /api/auth/me.
 */
type UsuarioLogado = {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  role: string;
  status: string;
  permissions?: string[];
};

type MeResponse = {
  autenticado: boolean;
  usuario: UsuarioLogado | null;
};

type PermissaoProps = {
  precisa: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
};

// Cache singleton em memória para evitar requisições repetidas ao trocar de aba
let usuarioCache: UsuarioLogado | null = null;
let carregadoCache = false;
let promiseUsuario: Promise<UsuarioLogado | null> | null = null;

// Lista de ouvintes reativos inscritos
const ouvintes = new Set<(usuario: UsuarioLogado | null) => void>();

/**
 * Notifica todos os componentes inscritos sobre mudanças na sessão do usuário.
 */
function emitirAtualizacao(usuario: UsuarioLogado | null) {
  usuarioCache = usuario;
  carregadoCache = true;

  ouvintes.forEach((ouvinte) => ouvinte(usuario));
}

/**
 * Consulta os dados do operador logado no backend via /api/auth/me.
 * Deduplica chamadas simultâneas reaproveitando a mesma Promise.
 */
async function buscarUsuarioLogado() {
  if (promiseUsuario) return promiseUsuario;

  promiseUsuario = fetch("/api/auth/me", {
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
    },
  })
    .then(async (response) => {
      const data = (await response.json().catch(() => null)) as
        | MeResponse
        | null;

      if (!response.ok || !data?.autenticado || !data.usuario) {
        return null;
      }

      return data.usuario;
    })
    .catch(() => null)
    .finally(() => {
      promiseUsuario = null;
    });

  const usuario = await promiseUsuario;

  emitirAtualizacao(usuario);

  return usuario;
}

/**
 * Limpa o cache de usuário (utilizado no logout do operador).
 */
export function limparCacheUsuarioPermissoes() {
  emitirAtualizacao(null);
}

/**
 * Força a renovação dos dados e permissões do usuário conectado.
 */
export function atualizarCacheUsuarioPermissoes() {
  carregadoCache = false;
  return buscarUsuarioLogado();
}

/**
 * Avalia se o usuário fornecido possui a permissão requerida.
 * Administradores ativos possuem aprovação irrestrita.
 *
 * @param usuario - Objeto do usuário
 * @param permissao - Código da permissão ou array de opções válidas
 * @returns true se autorizado; false caso contrário
 */
export function temPermissao(
  usuario: UsuarioLogado | null,
  permissao: string | string[]
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
 * Hook do React para verificar permissões de forma declarativa e reativa em componentes funcionais.
 *
 * @returns Objeto com { usuario, carregando, tem(permissao) }
 * @example
 * const { tem, carregando } = useUsuarioPermissoes();
 * if (tem("ordens.criar")) { ... }
 */
export function useUsuarioPermissoes() {
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(usuarioCache);
  const [carregando, setCarregando] = useState(!carregadoCache);

  useEffect(() => {
    let ativo = true;

    function atualizar(novoUsuario: UsuarioLogado | null) {
      if (!ativo) return;

      setUsuario(novoUsuario);
      setCarregando(false);
    }

    ouvintes.add(atualizar);

    if (carregadoCache) {
      atualizar(usuarioCache);
    } else {
      setCarregando(true);

      buscarUsuarioLogado().then((novoUsuario) => {
        atualizar(novoUsuario);
      });
    }

    return () => {
      ativo = false;
      ouvintes.delete(atualizar);
    };
  }, []);

  const tem = useCallback(
    (permissao: string | string[]) => temPermissao(usuario, permissao),
    [usuario]
  );

  return {
    usuario,
    carregando,
    tem,
  };
}

/**
 * Componente declarativo que renderiza seus filhos somente se o usuário logado
 * possuir a permissão especificada.
 *
 * @param props.precisa - Permissão requerida (string ou array)
 * @param props.children - Elementos a exibir quando autorizado
 * @param props.fallback - Elemento opcional a exibir quando não autorizado
 */
export default function Permissao({
  precisa,
  children,
  fallback = null,
}: PermissaoProps) {
  const { usuario, carregando } = useUsuarioPermissoes();

  if (carregando) return null;

  if (!temPermissao(usuario, precisa)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
