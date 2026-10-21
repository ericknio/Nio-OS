/**
 * @file ResellerManagerClient.tsx
 * @description Componente interativo (Client Component) para gerenciamento completo de um parceiro revendedor.
 * Permite transferência e estorno atômico de créditos com atalhos de volume (1, 5, 10, 20, 50, 100 créditos),
 * alteração de login administrativo, redefinição de senha de acesso, alternância de bloqueio (ativar/bloquear)
 * e expurgo definitivo da conta com estorno de créditos remanescentes para o criador.
 *
 * @module CloudDashboard/Components/ResellerManagerClient
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  manageCreditsAction,
  deleteResellerAction,
  resetResellerPasswordAction,
  toggleResellerStatusAction,
  updateResellerLoginAction,
} from "@/app/actions/resellers";

/**
 * Renderiza os controles de ação administrativa sobre a conta de um revendedor parceiro.
 * 
 * Funcionalidades:
 * - Gestão de créditos: Adicionar/transferir ou recolher/estornar créditos via `manageCreditsAction`.
 * - Alteração de login e redefinição de senha com tratamento de mensagens e spinners de carregamento.
 * - Bloqueio e desbloqueio operacional com `toggleResellerStatusAction`.
 * - Exclusão permanente do revendedor com política de reembolso de créditos para o criador.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {string} props.resellerId - Identificador único (UUID) do revendedor parceiro.
 * @param {string} props.currentStatus - Status operacional atual (`ACTIVE` ou `DISABLED`).
 * @param {string} [props.currentLogin] - Identificador de login atual do revendedor.
 * @param {boolean} [props.isCreatorReseller=false] - Indica se o operador logado é um revendedor criador do parceiro.
 * @param {number} [props.creatorCredits=0] - Saldo de créditos do revendedor criador para cálculo de limites.
 * @returns {JSX.Element} Painel administrativo com formulários de gestão de parceiros.
 */
export default function ResellerManagerClient({
  resellerId,
  currentStatus,
  currentLogin,
  isCreatorReseller = false,
  creatorCredits = 0,
}: {
  resellerId: string;
  currentStatus: string;
  currentLogin?: string;
  isCreatorReseller?: boolean;
  creatorCredits?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creditAmount, setCreditAmount] = useState(1);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const clearMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleManageCredits = (isAdd: boolean) => {
    clearMessages();
    startTransition(async () => {
      const res = await manageCreditsAction(resellerId, creditAmount, isAdd);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message || "Créditos atualizados com sucesso!");
        router.refresh();
      }
    });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    startTransition(async () => {
      const res = await resetResellerPasswordAction(resellerId, newPassword);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message || "Senha atualizada com sucesso!");
        setNewPassword("");
      }
    });
  };

  const handleUpdateLogin = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    startTransition(async () => {
      const res = await updateResellerLoginAction(resellerId, newLogin);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message || "Login atualizado com sucesso!");
        setNewLogin("");
        router.refresh();
      }
    });
  };

  const handleToggleStatus = () => {
    clearMessages();
    startTransition(async () => {
      const res = await toggleResellerStatusAction(resellerId);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message || "Status atualizado com sucesso!");
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    const confirmMessage = isCreatorReseller
      ? "TEM CERTEZA? Isso excluirá o revendedor parceiro e seus acessos. Os créditos remanescentes dele serão devolvidos para o seu saldo."
      : "TEM CERTEZA ABSOLUTA?\n\nIsso excluirá o revendedor E TODOS OS SEUS CLIENTES E LICENÇAS permanentemente!";

    if (!confirm(confirmMessage)) {
      return;
    }

    clearMessages();
    startTransition(async () => {
      const res = await deleteResellerAction(resellerId);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.push("/dashboard/resellers");
      }
    });
  };

  const presets = [1, 5, 10, 20, 50, 100];

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="bg-red-500/15 border border-red-500/30 text-red-400 px-4 py-3.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-4 py-3.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. Gerenciar Créditos */}
      <div className="space-y-3">
        <label className="block text-sm font-bold text-white">
          {isCreatorReseller ? "Transferir ou Recolher Créditos" : "Adicionar ou Remover Créditos"}
        </label>
        <p className="text-xs text-gray-400">
          {isCreatorReseller
            ? `Você possui ${creatorCredits} créditos disponíveis. Ao adicionar créditos a este parceiro, eles sairão do seu saldo. Ao remover, retornarão para sua conta.`
            : "Cada 1 crédito permite ao revendedor criar ou renovar 1 mês de licença para seus clientes."}
        </p>

        {/* Botões de atalho rápido */}
        <div className="flex flex-wrap gap-2 pt-1">
          {presets.map((val) => (
            <button
              key={val}
              type="button"
              disabled={isPending}
              onClick={() => setCreditAmount(val)}
              className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition ${
                creditAmount === val
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-[#1a1a1a] border-gray-800 text-gray-300 hover:bg-gray-800"
              }`}
            >
              {val} {val === 1 ? "crédito" : "créditos"}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <input
            type="number"
            min="1"
            value={creditAmount}
            onChange={(e) => setCreditAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={isPending}
            className="w-full sm:w-32 min-h-[48px] bg-[#1a1a1a] border border-gray-700 text-white font-bold text-center rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm"
          />

          <button
            type="button"
            onClick={() => handleManageCredits(true)}
            disabled={isPending}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 cursor-pointer"
          >
            + Adicionar {creditAmount} {creditAmount === 1 ? "Crédito" : "Créditos"}
          </button>

          <button
            type="button"
            onClick={() => handleManageCredits(false)}
            disabled={isPending}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 active:bg-amber-600/40 border border-amber-600/40 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            - Remover {creditAmount} {creditAmount === 1 ? "Crédito" : "Créditos"}
          </button>
        </div>
      </div>

      {/* 2. Alterar Login do Revendedor */}
      <div className="pt-6 border-t border-gray-800 space-y-2.5">
        <label className="block text-sm font-bold text-white">
          Alterar Login do Revendedor
        </label>
        <p className="text-xs text-gray-400">
          Altere o identificador de login utilizado por este revendedor para acessar o painel.
        </p>

        <form onSubmit={handleUpdateLogin} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            placeholder={currentLogin ? `Atual: ${currentLogin}` : "Novo login do revendedor"}
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            disabled={isPending}
            minLength={3}
            required
            className="flex-1 min-h-[48px] bg-[#1a1a1a] border border-gray-700 text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm"
          />
          <button
            type="submit"
            disabled={isPending || !newLogin.trim() || newLogin.trim() === currentLogin}
            className="min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-lg shadow-blue-900/20"
          >
            Salvar Login
          </button>
        </form>
      </div>

      {/* 3. Redefinir Senha do Revendedor */}
      <div className="pt-6 border-t border-gray-800 space-y-2.5">
        <label className="block text-sm font-bold text-white">
          Redefinir Senha do Revendedor
        </label>
        <p className="text-xs text-gray-400">
          Defina uma nova senha para este revendedor caso ele tenha esquecido o acesso.
        </p>

        <form onSubmit={handleResetPassword} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Nova senha (mín. 6 dígitos)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isPending}
              minLength={6}
              required
              className="w-full min-h-[48px] pl-4 pr-12 py-2.5 bg-[#1a1a1a] border border-gray-700 text-white rounded-xl text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
          <button
            type="submit"
            disabled={isPending || !newPassword}
            className="min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-lg shadow-blue-900/20"
          >
            Salvar Senha
          </button>
        </form>
      </div>

      {/* 4. Status e Zona de Perigo */}
      <div className="pt-6 border-t border-gray-800 space-y-3">
        <label className="block text-sm font-bold text-white">
          Controle de Acesso
        </label>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={isPending}
            className={`flex-1 min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 border cursor-pointer ${
              currentStatus === "ACTIVE"
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
            }`}
          >
            {currentStatus === "ACTIVE" ? "Bloquear Acesso do Revendedor" : "Desbloquear / Ativar Revendedor"}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="min-h-[48px] px-5 py-2.5 bg-red-600/15 text-red-400 hover:bg-red-600/25 active:bg-red-600/35 border border-red-500/30 rounded-xl font-bold text-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            Excluir Revendedor
          </button>
        </div>
      </div>
    </div>
  );
}
