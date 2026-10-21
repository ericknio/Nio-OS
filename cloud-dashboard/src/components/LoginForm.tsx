/**
 * @file LoginForm.tsx
 * @description Componente de formulário interativo de login para o Cloud Dashboard.
 * Gerencia a entrada de credenciais administrativas (usuário/e-mail e senha) com alternância visual
 * de senha, tratamento acessível de mensagens de erro (role="alert") e transições animadas de loading.
 *
 * @module CloudDashboard/Components/LoginForm
 */

"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions/auth";

/**
 * Renderiza o formulário de login administrativo do Cloud Dashboard.
 * 
 * Funcionalidades:
 * - Submissão integrada à Server Action `loginAction` via hook `useActionState`.
 * - Exibição de alertas de erro com ícones semânticos e texto acessível para leitores de tela.
 * - Botão para revelar/ocultar senha com troca de ícones SVG.
 * - Botão de submissão estilizado com gradiente e spinner de carregamento ativado durante a requisição.
 * 
 * @returns {JSX.Element} Formulário de autenticação administrativa.
 */
export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4 w-full">
      {state?.error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-red-500/15 text-red-300 border border-red-500/40 text-sm flex items-start gap-2.5 leading-snug"
        >
          <svg
            className="w-5 h-5 text-red-400 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      {/* Campo Login */}
      <div className="flex flex-col gap-1.5 text-left">
        <label
          htmlFor="login"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider"
        >
          Usuário ou E-mail
        </label>
        <div className="relative">
          <input
            id="login"
            type="text"
            name="login"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            placeholder="Digite seu login"
            required
            className="w-full h-12 px-4 rounded-xl bg-[#141a29] border border-gray-700/70 text-white placeholder-gray-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Campo Senha com botão de visualização */}
      <div className="flex flex-col gap-1.5 text-left">
        <label
          htmlFor="password"
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider"
        >
          Senha de Acesso
        </label>
        <div className="relative flex items-center">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            className="w-full h-12 pl-4 pr-12 rounded-xl bg-[#141a29] border border-gray-700/70 text-white placeholder-gray-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Ocultar senha" : "Ver senha"}
            className="absolute right-2 p-2 text-gray-400 hover:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Botão de Entrar */}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {pending ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Verificando credenciais...</span>
          </>
        ) : (
          <span>Entrar no Painel</span>
        )}
      </button>
    </form>
  );
}
