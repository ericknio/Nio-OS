/**
 * @file page.tsx
 * @description Página de detalhes e administração de um parceiro revendedor (`/dashboard/resellers/[id]`).
 * Exibe métricas de desempenho do revendedor (créditos em carteira, total de clientes gerenciados e sub-revendedores
 * criados), além de incorporar o componente interativo de ações administrativas (`ResellerManagerClient`).
 *
 * @module CloudDashboard/App/Dashboard/Resellers/Detail
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import ResellerManagerClient from "./ResellerManagerClient";

/**
 * Renderiza a visão detalhada de um revendedor parceiro com métricas e controles de crédito.
 * 
 * @param {Object} props - Propriedades da página do Next.js.
 * @param {Promise<{ id: string }>} props.params - Parâmetros da rota dinâmica contendo o ID do revendedor.
 * @returns {Promise<JSX.Element>} Painel de gerenciamento do revendedor.
 */
export default async function ManageResellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const user = session?.user;

  if (!user) {
    redirect("/");
  }

  const isMaster = user.role === "MASTER";

  const reseller = await prisma.adminUser.findUnique({
    where: { id },
    include: {
      creator: { select: { email: true } },
      _count: {
        select: {
          clients: true,
          subResellers: true,
        },
      },
    },
  });

  if (!reseller || reseller.role !== "RESELLER") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-red-500">Revendedor não encontrado</h1>
        <p className="text-gray-400">Este revendedor não existe.</p>
        <Link href="/dashboard/resellers" className="text-blue-400 hover:underline">
          Voltar para revendedores
        </Link>
      </div>
    );
  }

  // Se for revendedor, só pode acessar se ele mesmo criou
  if (!isMaster && reseller.creatorId !== user.id) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-red-500">Acesso Não Autorizado</h1>
        <p className="text-gray-400">Este revendedor não pertence à sua rede de parceiros.</p>
        <Link href="/dashboard/resellers" className="text-blue-400 hover:underline">
          Voltar para revendedores
        </Link>
      </div>
    );
  }

  const creatorData = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { credits: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/resellers"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#111] hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-sm font-semibold shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate">
            {reseller.email}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111] p-6 rounded-xl border border-gray-800 shadow-xl space-y-4">
          <h2 className="text-xl font-bold border-b border-gray-800 pb-2">Informações da Conta</h2>
          
          <div>
            <p className="text-sm text-gray-500">Login</p>
            <p className="font-semibold text-lg">{reseller.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`px-2 py-1 rounded text-xs font-bold inline-block mt-1 ${reseller.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {reseller.status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500">Saldo de Créditos</p>
            <p className="font-semibold text-blue-400 text-2xl">{reseller.credits}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 bg-gray-900/60 rounded-xl border border-gray-800">
              <p className="text-xs text-gray-400 font-medium">Clientes Vinculados</p>
              <p className="text-2xl font-black text-white mt-1">{reseller._count.clients}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">licenças gerenciadas</p>
            </div>
            <div className="p-3.5 bg-gray-900/60 rounded-xl border border-gray-800">
              <p className="text-xs text-gray-400 font-medium">Revendedores Criados</p>
              <p className="text-2xl font-black text-purple-400 mt-1">{reseller._count.subResellers}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">parceiros na rede</p>
            </div>
          </div>

          {reseller.creator && (
            <div className="pt-2 border-t border-gray-800/80">
              <span className="text-xs text-gray-500">
                Criado pelo revendedor: <strong className="text-gray-300 font-mono">{reseller.creator.email}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="bg-[#111] p-6 rounded-xl border border-gray-800 shadow-xl space-y-4">
          <h2 className="text-xl font-bold border-b border-gray-800 pb-2">Ações Administrativas</h2>
          <ResellerManagerClient 
            resellerId={reseller.id} 
            currentStatus={reseller.status} 
            currentLogin={reseller.email}
            isCreatorReseller={!isMaster}
            creatorCredits={creatorData?.credits ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
