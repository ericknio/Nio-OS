/**
 * @file ClientForm.tsx
 * @description Componente de formulário interativo (Client Component) para cadastramento de novos clientes comerciais.
 * Suporta emissão de licenças regulares com consumo proporcional de créditos ou contas de avaliação (`TRIAL`)
 * gratuitas por 24 horas. Integra validação com `useActionState`, visibilidade dinâmica de senha e sanitização
 * de campos de identificação de login e empresa.
 *
 * @module CloudDashboard/Components/ClientForm
 */

"use client";

import { useActionState, useState } from "react";
import { createClientAction } from "@/app/actions/clients";

/**
 * Renderiza o formulário de cadastro e licenciamento de novos clientes.
 * 
 * Funcionalidades:
 * - Submissão gerenciada via Server Action `createClientAction` com feedback de pendência (`pending`).
 * - Alternância dinâmica para modo Trial (desativa campo de meses e não debita créditos).
 * - Campo de validade inicial (1 a 24 meses) com cálculo de 1 crédito por mês de vigência.
 * - Alternância de visibilidade da senha (mostrar/ocultar) acessível para dispositivos móveis e desktop.
 * 
 * @returns {JSX.Element} Formulário estilizado para criação de contas comerciais de clientes.
 */
export default function ClientForm() {
  const [state, formAction, pending] = useActionState(createClientAction, null);
  const [isTrial, setIsTrial] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 w-full max-w-lg bg-[#111] p-5 sm:p-6 rounded-2xl border border-gray-800 shadow-xl"
    >
      {state?.error && (
        <div className="p-3.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
          Nome da Empresa / Cliente
        </label>
        <input
          type="text"
          name="name"
          placeholder="Ex: Auto Center Dois Irmãos"
          required
          autoComplete="organization"
          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
          Login de Acesso
        </label>
        <input
          type="text"
          name="login"
          placeholder="Ex: autocenter ou ericknio"
          required
          minLength={3}
          autoComplete="username"
          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          Identificador que o cliente digitará no sistema local para conectar.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
          Senha Inicial
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3.5 bg-[#1a1a1a] rounded-xl border border-gray-800 cursor-pointer">
        <input
          type="checkbox"
          id="isTrial"
          name="isTrial"
          value="true"
          checked={isTrial}
          onChange={(e) => setIsTrial(e.target.checked)}
          className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900 cursor-pointer"
        />
        <label htmlFor="isTrial" className="text-sm font-medium text-white cursor-pointer select-none">
          Criar usuário de teste gratuito (1 dia de licença)
        </label>
      </div>

      {!isTrial && (
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">
            Validade Inicial (Meses) — Consome Créditos
          </label>
          <input
            type="number"
            name="months"
            defaultValue="1"
            min="1"
            max="24"
            required={!isTrial}
            className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm font-semibold"
          />
          <p className="text-xs text-gray-500 mt-1">
            Cada 1 mês de licença descontará 1 crédito do seu saldo.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
      >
        {pending ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Criando conta...
          </>
        ) : isTrial ? (
          "Criar Cliente de Teste (Grátis)"
        ) : (
          "Criar Cliente e Ativar Licença"
        )}
      </button>
    </form>
  );
}
