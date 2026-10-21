/**
 * @file ClientManagerClient.tsx
 * @description Componente interativo (Client Component) para gerenciamento operacional de um cliente comercial.
 * Oferece controles para extensão/redução de meses de licença, definição manual de data de vencimento com recálculo
 * automático de créditos, alteração do identificador de login, redefinição de senha e exclusão permanente na zona de perigo.
 *
 * @module CloudDashboard/Components/ClientManagerClient
 */

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteClientAction,
  updateClientLicenseAction,
  resetClientPasswordAction,
  updateClientLoginAction,
} from "@/app/actions/clients";

/**
 * Renderiza os painéis de ações operacionais e manutenção da licença de um cliente.
 * 
 * Funcionalidades:
 * - Ajuste de vigência de licença com botões predefinidos (1, 3, 6, 12 meses) ou inserção manual.
 * - Seleção de data específica de vencimento no calendário HTML5.
 * - Alteração de login e redefinição de senha com feedback de status via hooks React 19 (`useTransition`).
 * - Exclusão permanente do cliente com confirmação explícita de segurança.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {string} props.clientId - Identificador único da conta comercial.
 * @param {string} props.currentExpiresAt - Data atual de expiração da licença em formato ISO.
 * @param {string} [props.currentLogin] - Identificador de login/e-mail atual do cliente.
 * @returns {JSX.Element} Painel administrativo com formulários de ação rápida.
 */
export default function ClientManagerClient({
  clientId,
  currentExpiresAt,
  currentLogin,
}: {
  clientId: string;
  currentExpiresAt?: string;
  currentLogin?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [monthsAmount, setMonthsAmount] = useState(1);
  const [specificDate, setSpecificDate] = useState(
    currentExpiresAt ? currentExpiresAt.slice(0, 10) : ""
  );
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const clearMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleUpdateLicense = (action: "ADD_MONTHS" | "REMOVE_MONTHS" | "SET_DATE") => {
    clearMessages();

    let value: string | number = monthsAmount;
    if (action === "SET_DATE") {
      if (!specificDate) {
        setErrorMsg("Selecione uma data válida.");
        return;
      }
      value = specificDate;
    }

    startTransition(async () => {
      const res = await updateClientLicenseAction(clientId, { action, value });
      if ("error" in res && res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg("Licença do cliente atualizada com sucesso!");
        router.refresh();
      }
    });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    startTransition(async () => {
      const res = await resetClientPasswordAction(clientId, newPassword);
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
      const res = await updateClientLoginAction(clientId, newLogin);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message || "Login atualizado com sucesso!");
        setNewLogin("");
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    if (!confirm("TEM CERTEZA? Isso excluirá o cliente final e o acesso dele permanentemente!")) {
      return;
    }

    setErrorMsg("");
    startTransition(async () => {
      const res = await deleteClientAction(clientId);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.push("/dashboard/clients");
      }
    });
  };

  const monthPresets = [1, 3, 6, 12];

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

      {/* 1. Adicionar ou Remover Meses */}
      <div className="space-y-3">
        <label className="block text-sm font-bold text-white">Adicionar ou Remover Meses de Licença</label>

        <div className="flex flex-wrap gap-2">
          {monthPresets.map((m) => (
            <button
              key={m}
              type="button"
              disabled={isPending}
              onClick={() => setMonthsAmount(m)}
              className={`min-h-[40px] px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition ${
                monthsAmount === m
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-[#1a1a1a] border-gray-800 text-gray-300 hover:bg-gray-800"
              }`}
            >
              {m} {m === 1 ? "mês" : "meses"}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <input
            type="number"
            min="1"
            value={monthsAmount}
            onChange={(e) => setMonthsAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
            disabled={isPending}
            className="w-full sm:w-28 min-h-[48px] bg-[#1a1a1a] border border-gray-700 text-white font-bold text-center rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm"
          />
          <button
            type="button"
            onClick={() => handleUpdateLicense("ADD_MONTHS")}
            disabled={isPending}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 cursor-pointer"
            title="Adicionar meses (Gasta créditos)"
          >
            + Adicionar {monthsAmount} {monthsAmount === 1 ? "Mês" : "Meses"}
          </button>
          <button
            type="button"
            onClick={() => handleUpdateLicense("REMOVE_MONTHS")}
            disabled={isPending}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 active:bg-amber-600/40 border border-amber-600/40 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            title="Tirar meses do vencimento"
          >
            - Remover {monthsAmount} {monthsAmount === 1 ? "Mês" : "Meses"}
          </button>
        </div>
      </div>

      {/* 2. Definir Data Específica */}
      <div className="space-y-2.5 pt-4 border-t border-gray-800">
        <label className="block text-sm font-bold text-white">Definir Data Específica de Vencimento</label>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="date"
            value={specificDate}
            onChange={(e) => setSpecificDate(e.target.value)}
            disabled={isPending}
            className="w-full sm:flex-1 min-h-[48px] bg-[#1a1a1a] border border-gray-700 text-white rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-base sm:text-sm"
          />
          <button
            type="button"
            onClick={() => handleUpdateLicense("SET_DATE")}
            disabled={isPending}
            className="min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-lg shadow-blue-900/20"
            title="Atualiza a data e calcula os créditos necessários"
          >
            Definir Data
          </button>
        </div>
        <p className="text-xs text-gray-500">
          O sistema recalculará automaticamente os créditos caso a data escolhida seja maior que o vencimento atual.
        </p>
      </div>

      {/* 3. Alterar Login do Cliente */}
      <div className="space-y-2.5 pt-4 border-t border-gray-800">
        <label className="block text-sm font-bold text-white">Alterar Login do Cliente</label>
        <p className="text-xs text-gray-400">
          Altere o identificador de login que o cliente utiliza para acessar o sistema.
        </p>
        <form onSubmit={handleUpdateLogin} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            placeholder={currentLogin ? `Atual: ${currentLogin}` : "Novo login do cliente"}
            value={newLogin}
            onChange={(e) => setNewLogin(e.target.value)}
            disabled={isPending}
            minLength={3}
            required
            className="w-full sm:flex-1 min-h-[48px] bg-[#1a1a1a] border border-gray-700 text-white rounded-xl px-4 py-2.5 text-base sm:text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isPending || !newLogin.trim() || newLogin.trim() === currentLogin}
            className="min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-lg shadow-blue-900/20"
          >
            Salvar Login
          </button>
        </form>
      </div>

      {/* 4. Redefinir Senha do Cliente */}
      <div className="space-y-2.5 pt-4 border-t border-gray-800">
        <label className="block text-sm font-bold text-white">Redefinir Senha do Cliente</label>
        <p className="text-xs text-gray-400">
          Altere a senha que o cliente utiliza para fazer login no sistema local.
        </p>
        <form onSubmit={handleResetPassword} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative w-full sm:flex-1">
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
            className="min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer shadow-lg shadow-blue-900/20"
          >
            Salvar Senha
          </button>
        </form>
      </div>

      {/* 5. Zona de Perigo */}
      <div className="pt-6 border-t border-gray-800">
        <label className="block text-sm font-semibold text-red-400 mb-2">Zona de Perigo</label>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="w-full min-h-[48px] px-4 py-3 bg-red-600/15 text-red-400 hover:bg-red-600/25 active:bg-red-600/35 hover:text-red-300 border border-red-500/30 rounded-xl font-bold text-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          {isPending ? "Processando..." : "Excluir Cliente Permanentemente"}
        </button>
      </div>
    </div>
  );
}
