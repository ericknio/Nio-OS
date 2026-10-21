/**
 * @file page.tsx
 * @description Visão Geral (Dashboard Home) do Cloud Dashboard.
 * Renderiza os cartões de indicadores chave de desempenho (KPIs): saldo de créditos disponíveis,
 * total de clientes cadastrados (com destaque para clientes ativos) e contagem de revendedores subordinados,
 * além de botões de atalho rápido para criação de clientes e revendedores.
 *
 * @module CloudDashboard/App/Dashboard/HomePage
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

/**
 * Renderiza o painel de visão geral com métricas em tempo real e atalhos rápidos.
 * 
 * @returns {Promise<JSX.Element | null>} Página de visão geral ou `null` se não houver usuário autenticado.
 */
export default async function DashboardPage() {
  const session = await getSession();
  const user = session?.user;

  if (!user) return null;

  const adminData = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { credits: true, role: true },
  });

  const clientsCount = await prisma.commercialAccount.count({
    where: {
      resellerId: user.role === "RESELLER" ? user.id : undefined,
    },
  });

  const activeClientsCount = await prisma.commercialAccount.count({
    where: {
      resellerId: user.role === "RESELLER" ? user.id : undefined,
      status: "ACTIVE",
    },
  });

  const resellersCount =
    user.role === "MASTER"
      ? await prisma.adminUser.count({ where: { role: "RESELLER" } })
      : await prisma.adminUser.count({ where: { role: "RESELLER", creatorId: user.id } });

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Página com Ações Rápidas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Visão Geral
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
            Acompanhe suas licenças, créditos e clientes em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/clients/new"
            className="h-11 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all flex-1 sm:flex-initial"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Novo Cliente</span>
          </Link>

          <Link
            href="/dashboard/resellers/new"
            className="h-11 px-4 rounded-xl bg-[#141a29] hover:bg-gray-800 text-gray-200 border border-gray-700 font-bold text-sm flex items-center justify-center gap-2 transition-all flex-1 sm:flex-initial"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <span>Novo Revendedor</span>
          </Link>

          <Link
            href="/dashboard/download"
            className="h-11 px-4 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/30 font-bold text-sm flex items-center justify-center gap-2 transition-all flex-1 sm:flex-initial"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Baixar Release</span>
          </Link>
        </div>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Card 1: Créditos */}
        <div className="relative overflow-hidden bg-[#0c101a] p-5 sm:p-6 rounded-2xl border border-gray-800/80 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Seus Créditos
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-blue-400">
              {adminData?.credits ?? 0}
            </p>
            <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
              <span>1 crédito = 1 mês de licença emitida</span>
            </p>
          </div>
        </div>

        {/* Card 2: Clientes */}
        <div className="relative overflow-hidden bg-[#0c101a] p-5 sm:p-6 rounded-2xl border border-gray-800/80 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Total de Clientes
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl sm:text-4xl font-extrabold text-emerald-400">
                {clientsCount}
              </p>
              <span className="text-xs text-gray-400 font-medium">
                ({activeClientsCount} ativos)
              </span>
            </div>
            <Link
              href="/dashboard/clients"
              className="text-xs text-emerald-400/90 hover:text-emerald-300 font-medium mt-1.5 inline-block hover:underline"
            >
              Ver todos os clientes →
            </Link>
          </div>
        </div>

        {/* Card 3: Revendedores */}
        <div className="relative overflow-hidden bg-[#0c101a] p-5 sm:p-6 rounded-2xl border border-gray-800/80 shadow-xl flex flex-col justify-between sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {user.role === "MASTER" ? "Todos os Revendedores" : "Meus Revendedores"}
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-extrabold text-purple-400">
              {resellersCount}
            </p>
            <Link
              href="/dashboard/resellers"
              className="text-xs text-purple-400/90 hover:text-purple-300 font-medium mt-1.5 inline-block hover:underline"
            >
              Gerenciar revendedores →
            </Link>
          </div>
        </div>
      </div>

      {/* Instruções Rápidas com Design Glassmorphism */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#0c101a] to-[#101524] border border-gray-800/80 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              Como funciona o gerenciamento de licenças?
            </h3>
            <p className="text-gray-300 text-xs sm:text-sm mt-1 leading-relaxed">
              Cada crédito em sua conta permite adicionar 1 mês de validade para um cliente. Você pode cadastrar clientes de teste grátis (1 dia) ou emitir planos com a duração desejada. A sincronização com as máquinas clientes ocorre de forma automática e segura.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
