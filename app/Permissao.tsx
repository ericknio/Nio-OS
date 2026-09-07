import { ReactNode, useEffect, useState, useCallback } from "react";

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

let usuarioCache: UsuarioLogado | null = null;
let carregadoCache = false;
let promiseUsuario: Promise<UsuarioLogado | null> | null = null;

const ouvintes = new Set<(usuario: UsuarioLogado | null) => void>();

function emitirAtualizacao(usuario: UsuarioLogado | null) {
  usuarioCache = usuario;
  carregadoCache = true;

  ouvintes.forEach((ouvinte) => ouvinte(usuario));
}

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

export function limparCacheUsuarioPermissoes() {
  emitirAtualizacao(null);
}

export function atualizarCacheUsuarioPermissoes() {
  carregadoCache = false;
  return buscarUsuarioLogado();
}

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
