/**
 * @file app/UsuarioLogadoBox.tsx
 * @description Widget de perfil do operador logado exibido na barra lateral.
 * 
 * Exibe o avatar estilizado com a inicial do operador, nome, username e botão de logout.
 * Ao clicar em sair, limpa o cache local de permissões, invalida o cookie de sessão no backend
 * e redireciona para a tela de login.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  limparCacheUsuarioPermissoes,
  useUsuarioPermissoes,
} from "./Permissao";

/**
 * Retorna a primeira letra do nome do operador em maiúscula para compor o avatar visual.
 *
 * @param nome - Nome completo do operador
 * @returns Letra inicial maiúscula ou "U" como fallback
 */
function inicialNome(nome?: string | null) {
  const limpo = String(nome || "").trim();

  if (!limpo) return "U";

  return limpo.charAt(0).toUpperCase();
}

/**
 * Componente UsuarioLogadoBox.
 * 
 * Renderiza o card do usuário logado na parte inferior da sidebar com atalho para 'Minha Conta' e botão de logout.
 */
export default function UsuarioLogadoBox() {
  const router = useRouter();
  const { usuario, carregando } = useUsuarioPermissoes();

  /**
   * Encerra a sessão do operador: limpa cache em memória e chama a rota de logout.
   */
  async function sair() {
    limparCacheUsuarioPermissoes();

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch (error) {
      console.error("Erro ao sair:", error);
    } finally {
      router.replace("/login");
    }
  }

  if (carregando) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-400 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-800">
        Carregando...
      </div>
    );
  }

  if (!usuario) {
    return (
      <Link
        href="/login"
        className="block rounded-xl bg-blue-600 px-3 py-2 text-center text-xs font-black text-white hover:bg-blue-700"
      >
        Entrar
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white dark:bg-slate-800/80 p-2 ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-sm">
      <Link
        href="/minha-conta"
        title="Minha conta"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-slate-100/80 dark:hover:bg-slate-700/50 group"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-sm ring-2 ring-white/20 dark:ring-slate-700/60 group-hover:scale-105 transition-transform duration-150">
          {inicialNome(usuario.name)}
        </div>

        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {usuario.name}
          </p>

          <p className="truncate text-[10px] font-medium text-slate-400 dark:text-slate-400">
            @{usuario.username}
          </p>
        </div>
      </Link>

      <button
        type="button"
        onClick={sair}
        title="Sair do sistema"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all duration-150 active:scale-95"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
