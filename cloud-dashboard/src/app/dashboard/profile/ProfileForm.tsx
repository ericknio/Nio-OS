/**
 * @file ProfileForm.tsx
 * @description Componente de formulário de autoatendimento para o perfil do operador autenticado.
 * Agrupa dois formulários independentes protegidos: alteração de login/e-mail (com exigência da senha atual
 * para autorização prévia) e alteração de senha de acesso (com validação de senha atual, nova senha e confirmação),
 * ambos equipados com botões de alternância de visibilidade de senha e limpeza automática dos campos após sucesso.
 *
 * @module CloudDashboard/Components/ProfileForm
 */

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { changePasswordAction, updateEmailAction } from "@/app/actions/profile";

/**
 * Renderiza o painel com os formulários de atualização de credenciais do perfil do usuário.
 * 
 * Funcionalidades:
 * - Formulário 1 (Alterar Login): Invoca `updateEmailAction`, exige confirmação com senha atual e reseta após sucesso.
 * - Formulário 2 (Alterar Senha): Invoca `changePasswordAction`, valida tamanho mínimo de 6 caracteres e reseta após sucesso.
 * - Alternadores independentes de exibição de senha para cada campo sensível.
 * - Mensagens de feedback semânticas (sucesso em verde e erro em vermelho).
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {string} props.currentEmail - Login/e-mail atualmente utilizado pelo usuário autenticado.
 * @returns {JSX.Element} Conjunto de formulários de gerenciamento de perfil.
 */
export default function ProfileForm({ currentEmail }: { currentEmail: string }) {
  // Password toggles
  const [showEmailConfirmPass, setShowEmailConfirmPass] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // Estado para alteração de senha
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePasswordAction,
    null
  );
  const passwordFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (passwordState?.success) {
      passwordFormRef.current?.reset();
    }
  }, [passwordState?.success]);

  // Estado para alteração de login
  const [emailState, emailAction, emailPending] = useActionState(
    updateEmailAction,
    null
  );
  const emailFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (emailState?.success) {
      emailFormRef.current?.reset();
    }
  }, [emailState?.success]);

  return (
    <div className="space-y-6 w-full max-w-lg">
      {/* 1. Formulário de Alteração de Login */}
      <form
        ref={emailFormRef}
        action={emailAction}
        className="flex flex-col gap-4 bg-[#111] p-5 sm:p-6 rounded-2xl border border-gray-800 shadow-xl"
      >
        <div>
          <h3 className="text-lg font-bold text-white">Alterar Login de Acesso</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Atualize o identificador utilizado para acessar este painel.
          </p>
        </div>

        {emailState?.error && (
          <div className="p-3.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{emailState.error}</span>
          </div>
        )}

        {emailState?.success && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{emailState.message}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">
            Novo Login
          </label>
          <input
            type="text"
            name="newEmail"
            placeholder={`Atual: ${currentEmail}`}
            required
            minLength={3}
            autoComplete="username"
            className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">
            Senha Atual (para confirmar alteração)
          </label>
          <div className="relative">
            <input
              type={showEmailConfirmPass ? "text" : "password"}
              name="currentPasswordForEmail"
              placeholder="Digite sua senha atual"
              required
              autoComplete="current-password"
              className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowEmailConfirmPass(!showEmailConfirmPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
              tabIndex={-1}
              aria-label={showEmailConfirmPass ? "Ocultar senha" : "Exibir senha"}
            >
              {showEmailConfirmPass ? (
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

        <button
          type="submit"
          disabled={emailPending}
          className="mt-2 min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {emailPending ? "Atualizando login..." : "Salvar Novo Login"}
        </button>
      </form>

      {/* 2. Formulário de Alteração de Senha */}
      <form
        ref={passwordFormRef}
        action={passwordAction}
        className="flex flex-col gap-4 bg-[#111] p-5 sm:p-6 rounded-2xl border border-gray-800 shadow-xl"
      >
        <div>
          <h3 className="text-lg font-bold text-white">Alterar Senha de Acesso</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Defina uma nova senha segura (mínimo 6 caracteres).
          </p>
        </div>

        {passwordState?.error && (
          <div className="p-3.5 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{passwordState.error}</span>
          </div>
        )}

        {passwordState?.success && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{passwordState.message}</span>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">
            Senha Atual
          </label>
          <div className="relative">
            <input
              type={showCurrentPass ? "text" : "password"}
              name="currentPassword"
              placeholder="Digite sua senha atual"
              required
              autoComplete="current-password"
              className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPass(!showCurrentPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
              tabIndex={-1}
              aria-label={showCurrentPass ? "Ocultar senha" : "Exibir senha"}
            >
              {showCurrentPass ? (
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
            Nova Senha
          </label>
          <div className="relative">
            <input
              type={showNewPass ? "text" : "password"}
              name="newPassword"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              required
              autoComplete="new-password"
              className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowNewPass(!showNewPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
              tabIndex={-1}
              aria-label={showNewPass ? "Ocultar senha" : "Exibir senha"}
            >
              {showNewPass ? (
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
            Confirmar Nova Senha
          </label>
          <div className="relative">
            <input
              type={showConfirmPass ? "text" : "password"}
              name="confirmPassword"
              placeholder="Repita a nova senha"
              minLength={6}
              required
              autoComplete="new-password"
              className="w-full min-h-[48px] pl-3.5 pr-12 py-2.5 rounded-xl bg-[#1a1a1a] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPass(!showConfirmPass)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-200 transition-colors"
              tabIndex={-1}
              aria-label={showConfirmPass ? "Ocultar senha" : "Exibir senha"}
            >
              {showConfirmPass ? (
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

        <button
          type="submit"
          disabled={passwordPending}
          className="mt-2 min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/30 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          {passwordPending ? "Salvando nova senha..." : "Atualizar Senha"}
        </button>
      </form>
    </div>
  );
}
