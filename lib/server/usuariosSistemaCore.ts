import { NextResponse } from "next/server";
import {
  SystemUserRole,
  SystemUserStatus,
  type SystemUser,
} from "@prisma/client";
import { obterUsuarioLogado } from "@/lib/authSistema";
import {
  normalizarPermissoes,
  TODAS_PERMISSOES,
} from "@/lib/permissoesSistema";

export const selectUsuarioSistema = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  status: true,
  profitShareEnabled: true,
  profitSharePercent: true,
  pdvProfitShareEnabled: true,
  pdvProfitSharePercent: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  permissions: {
    select: {
      key: true,
    },
  },
} as const;

type UsuarioComPermissoes = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
  permissions?: string[];
};

type UsuarioFormatavel = Pick<
  SystemUser,
  | "id"
  | "name"
  | "username"
  | "email"
  | "role"
  | "status"
  | "profitShareEnabled"
  | "profitSharePercent"
  | "pdvProfitShareEnabled"
  | "pdvProfitSharePercent"
  | "lastLoginAt"
  | "createdAt"
  | "updatedAt"
> & {
  permissions: {
    key: string;
  }[];
};

export function texto(valor: unknown) {
  return String(valor || "").trim();
}

export function email(valor: unknown) {
  const limpo = texto(valor).toLowerCase();
  return limpo || null;
}

export function login(valor: unknown) {
  return texto(valor).toLowerCase();
}

export function emailValido(valor: string | null) {
  if (!valor) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export function loginValido(valor: string) {
  return /^[a-z0-9._@-]+$/.test(valor);
}

export function roleValida(valor: unknown): SystemUserRole | null {
  const role = texto(valor).toUpperCase();

  if (role === SystemUserRole.ADMIN) return SystemUserRole.ADMIN;
  if (role === SystemUserRole.ATENDENTE) return SystemUserRole.ATENDENTE;
  if (role === SystemUserRole.TECNICO) return SystemUserRole.TECNICO;
  if (role === SystemUserRole.FINANCEIRO) return SystemUserRole.FINANCEIRO;

  return null;
}

export function statusValido(valor: unknown): SystemUserStatus | null {
  const status = texto(valor).toUpperCase();

  if (status === SystemUserStatus.ATIVO) return SystemUserStatus.ATIVO;
  if (status === SystemUserStatus.INATIVO) return SystemUserStatus.INATIVO;
  if (status === SystemUserStatus.BLOQUEADO) return SystemUserStatus.BLOQUEADO;

  return null;
}

export type ProfitShareConfig = {
  enabled: boolean;
  percent: number;
};

export function participacaoLucroParaSalvar(
  valor: unknown,
  role: SystemUserRole,
): ProfitShareConfig | null {
  if (role !== SystemUserRole.TECNICO) {
    return { enabled: false, percent: 0 };
  }

  const body =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};

  const enabled = body.profitShareEnabled === true;
  if (!enabled) return { enabled: false, percent: 0 };

  const recebido = Number(body.profitSharePercent);
  if (!Number.isFinite(recebido) || recebido <= 0 || recebido > 100) {
    return null;
  }

  return {
    enabled: true,
    percent: Math.round(recebido * 100) / 100,
  };
}

export function participacaoLucroPdvParaSalvar(
  valor: unknown,
  role: SystemUserRole,
): ProfitShareConfig | null {
  if (role !== SystemUserRole.ATENDENTE) {
    return { enabled: false, percent: 0 };
  }

  const body =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};

  const enabled = body.pdvProfitShareEnabled === true;
  if (!enabled) return { enabled: false, percent: 0 };

  const recebido = Number(body.pdvProfitSharePercent);
  if (!Number.isFinite(recebido) || recebido <= 0 || recebido > 100) {
    return null;
  }

  return {
    enabled: true,
    percent: Math.round(recebido * 100) / 100,
  };
}

export function permissoesParaSalvar(valor: unknown, role: SystemUserRole) {
  if (role === SystemUserRole.ADMIN) {
    return [...TODAS_PERMISSOES];
  }

  return normalizarPermissoes(valor, role);
}

export function formatarUsuarioSistema(usuario: UsuarioFormatavel) {
  const {
    permissions,
    profitSharePercent,
    pdvProfitSharePercent,
    ...dados
  } = usuario;

  const permissoes =
    dados.role === SystemUserRole.ADMIN
      ? [...TODAS_PERMISSOES]
      : permissions.map((item) => item.key);

  const tecnico = dados.role === SystemUserRole.TECNICO;
  const profitShareEnabled = tecnico && Boolean(dados.profitShareEnabled);

  const atendente = dados.role === SystemUserRole.ATENDENTE;
  const pdvProfitShareEnabled =
    atendente && Boolean(dados.pdvProfitShareEnabled);

  return {
    ...dados,
    profitShareEnabled,
    profitSharePercent: profitShareEnabled ? Number(profitSharePercent || 0) : 0,
    pdvProfitShareEnabled,
    pdvProfitSharePercent: pdvProfitShareEnabled
      ? Number(pdvProfitSharePercent || 0)
      : 0,
    permissions: permissoes,
  };
}

export function usuarioPodeGerenciarUsuarios(
  usuario: UsuarioComPermissoes | null
) {
  if (!usuario) return false;

  if (usuario.role === SystemUserRole.ADMIN) return true;

  const permissoes = Array.isArray(usuario.permissions)
    ? usuario.permissions
    : [];

  return permissoes.includes("usuarios.gerenciar");
}

export async function exigirGerenciarUsuarios() {
  const usuario = await obterUsuarioLogado();

  if (!usuario) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          message: "Usuario nao autenticado.",
        },
        { status: 401 }
      ),
    };
  }

  if (!usuarioPodeGerenciarUsuarios(usuario)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          message: "Voce nao tem permissao para gerenciar usuarios.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    usuario,
  };
}

export function respostaErro(message: string, status = 400) {
  return NextResponse.json(
    {
      message,
    },
    {
      status,
    }
  );
}