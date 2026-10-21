/**
 * @file page.tsx
 * @description Página de listagem e gestão de clientes comerciais (`/dashboard/clients`).
 * Realiza consulta server-side no banco de dados via Prisma com isolamento multi-inquilino
 * (revendedores visualizam exclusivamente seus próprios clientes vinculados, enquanto `MASTER` tem visão global).
 *
 * @module CloudDashboard/App/Dashboard/Clients/Page
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import ClientsList from "@/components/ClientsList";

/**
 * Renderiza a página de clientes com cabeçalho de ações e listagem interativa.
 * 
 * @returns {Promise<JSX.Element | null>} Interface de clientes ou `null` se não autenticado.
 */
export default async function ClientsPage() {
  const session = await getSession();
  const user = session?.user;

  if (!user) return null;

  const clients = await prisma.commercialAccount.findMany({
    where: {
      resellerId: user.role === "RESELLER" ? user.id : undefined,
    },
    include: {
      entitlement: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Meus Clientes</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
            Gerencie as contas comerciais e licenças ativas no sistema.
          </p>
        </div>
        <Link
          href="/dashboard/clients/new"
          className="inline-flex items-center justify-center min-h-[48px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-900/30 transition-all shrink-0"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Novo Cliente
        </Link>
      </div>

      <ClientsList clients={clients} />
    </div>
  );
}
