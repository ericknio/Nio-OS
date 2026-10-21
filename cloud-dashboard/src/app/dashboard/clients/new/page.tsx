/**
 * @file page.tsx
 * @description Página de cadastro de novos clientes comerciais (`/dashboard/clients/new`).
 * Contém botão de retorno à lista, orientações sobre o débito de créditos e o formulário de cadastro (`ClientForm`).
 *
 * @module CloudDashboard/App/Dashboard/Clients/New
 */

import ClientForm from "@/components/ClientForm";
import Link from "next/link";

/**
 * Renderiza a tela de cadastro de novos clientes comerciais.
 * 
 * @returns {JSX.Element} Formulário e instruções para criação de novo cliente.
 */
export default function NewClientPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/clients"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#111] hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-sm font-semibold"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Novo Cliente</h1>
      </div>

      <p className="text-xs sm:text-sm text-gray-400">
        Preencha os dados abaixo para gerar um novo login para seu cliente. A quantidade de meses de licença informada será debitada do seu saldo de créditos.
      </p>

      <div className="pt-2">
        <ClientForm />
      </div>
    </div>
  );
}
