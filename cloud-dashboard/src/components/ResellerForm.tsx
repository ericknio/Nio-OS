/**
 * @file ResellerForm.tsx
 * @description Componente de formulário para cadastramento de novos revendedores parceiros no Cloud Dashboard.
 * Aplica regras de negócio dinâmicas de acordo com o perfil do operador: administradores `MASTER` podem definir
 * créditos iniciais livremente, enquanto usuários `RESELLER` exigem saldo mínimo de 10 créditos para transferência
 * obrigatória, com alertas visuais preventivos contra saldo insuficiente.
 *
 * @module CloudDashboard/Components/ResellerForm
 */

"use client";

import { useActionState, useState } from "react";
import { createResellerAction } from "@/app/actions/resellers";

/**
 * Renderiza o formulário de criação de revendedores com validação de crédito e regras de perfil.
 * 
 * Funcionalidades:
 * - Submissão através da Server Action `createResellerAction`.
 * - Alertas visuais contextuais para revendedores sobre a exigência mínima de 10 créditos.
 * - Desabilitação proativa do botão de envio caso o revendedor não possua o saldo mínimo exigido.
 * - Suporte a revelação/ocultação de senha e prevenção de submissão duplicada durante o carregamento.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {string} [props.userRole="MASTER"] - Papel do usuário logado (`MASTER` ou `RESELLER`).
 * @param {number} [props.availableCredits=0] - Saldo de créditos disponível do usuário atual.
 * @returns {JSX.Element} Formulário estilizado de criação de revendedor.
 */
export default function ResellerForm({
  userRole = "MASTER",
  availableCredits = 0,
}: {
  userRole?: string;
  availableCredits?: number;
}) {
  const [state, formAction, pending] = useActionState(createResellerAction, null);
  const [showPassword, setShowPassword] = useState(false);

  const isReseller = userRole === "RESELLER";
  const hasInsufficientCredits = isReseller && availableCredits < 10;

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

      {isReseller && (
        <div className={`p-4 rounded-xl border text-sm space-y-1 ${
          hasInsufficientCredits
            ? "bg-red-500/10 border-red-500/30 text-red-300"
            : "bg-blue-500/10 border-blue-500/30 text-blue-300"
        }`}>
          <div className="flex items-center justify-between font-bold">
            <span>Regra de Criação de Parceiros:</span>
            <span className="font-mono">{availableCredits} créditos disponíveis</span>
          </div>
          <p className="text-xs opacity-90">
            {hasInsufficientCredits
              ? "Você precisa ter no mínimo 10 créditos em conta para cadastrar um novo revendedor parceiro."
              : "É obrigatório transferir no mínimo 10 créditos do seu saldo para inicializar a conta do novo revendedor."}
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
          Login do Revendedor
        </label>
        <input
          type="text"
          name="login"
          placeholder="Ex: revenda_sul ou erick_parceiro"
          required
          minLength={3}
          autoComplete="username"
          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          Identificador exclusivo do revendedor para acessar este painel.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
          Senha de Acesso
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

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-1.5">
          {isReseller ? "Créditos a Transferir (Mínimo 10)" : "Créditos Iniciais"}
        </label>
        <input
          type="number"
          name="credits"
          defaultValue={isReseller ? "10" : "0"}
          min={isReseller ? "10" : "0"}
          max={isReseller ? availableCredits : undefined}
          required
          className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm font-semibold"
        />
        <p className="text-xs text-gray-500 mt-1">
          {isReseller
            ? "Mínimo 10 créditos. Este montante será descontado dos seus créditos disponíveis."
            : "Quantidade de licenças mensais disponibilizadas para este revendedor repassar."}
        </p>
      </div>

      <button
        type="submit"
        disabled={pending || hasInsufficientCredits}
        className="mt-2 min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
      >
        {pending ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Cadastrando revendedor...
          </>
        ) : hasInsufficientCredits ? (
          "Saldo Insuficiente (Mín. 10 créditos)"
        ) : isReseller ? (
          "Criar Revendedor e Transferir Créditos"
        ) : (
          "Criar Revendedor"
        )}
      </button>
    </form>
  );
}
