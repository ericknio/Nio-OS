/**
 * @file page.tsx
 * @description Página de detalhes e gerenciamento de um cliente comercial específico (`/dashboard/clients/[id]`).
 * Carrega os dados da conta comercial, detalhes do direito de uso (`Entitlement`) e vinculação de revendedor,
 * com proteção estrita de acesso que impede revendedores de inspecionarem clientes pertencentes a outros operadores.
 *
 * @module CloudDashboard/App/Dashboard/Clients/Detail
 */

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { redirect } from "next/navigation";
import ClientManagerClient from "./ClientManagerClient";

/**
 * Renderiza a visualização detalhada e painel de controle de um cliente comercial.
 * 
 * @param {Object} props - Propriedades da página do Next.js.
 * @param {Promise<{ id: string }>} props.params - Parâmetros de rota contendo o UUID do cliente.
 * @returns {Promise<JSX.Element>} Painel de gerenciamento do cliente selecionado.
 */
export default async function ManageClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const user = session?.user;

  if (!user) redirect("/dashboard");

  // Fetch client ensuring it belongs to the logged-in reseller or user is master
  const client = await prisma.commercialAccount.findFirst({
    where: {
      id,
      ...(user.role === "RESELLER" ? { resellerId: user.id } : {})
    },
    include: {
      entitlement: true,
      reseller: { select: { email: true } }
    }
  });

  if (!client) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-red-500">Cliente não encontrado</h1>
        <p className="text-gray-400">Este cliente não existe ou não pertence à sua conta.</p>
        <Link href="/dashboard/clients" className="text-blue-400 hover:underline">Voltar para clientes</Link>
      </div>
    );
  }

  const isExpired = client.entitlement ? client.entitlement.expiresAt < new Date() : true;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/clients"
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#111] hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-sm font-semibold shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Voltar
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate">
            {client.name}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Informações da Empresa */}
        <div className="bg-[#111] p-6 rounded-xl border border-gray-800 shadow-xl space-y-4">
          <h2 className="text-xl font-bold border-b border-gray-800 pb-2">Informações da Conta</h2>
          
          <div>
            <p className="text-sm text-gray-500">Nome da Empresa</p>
            <p className="font-semibold text-lg">{client.name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Login do Sistema</p>
            <p className="font-semibold">{client.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`px-2 py-1 rounded text-xs font-bold inline-block mt-1 ${client.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {client.status}
            </span>
          </div>
          {user.role === "MASTER" && (
            <div>
              <p className="text-sm text-gray-500">Revendedor Responsável</p>
              <p className="font-semibold text-purple-400">{client.reseller?.email || "Nenhum"}</p>
            </div>
          )}
        </div>

        {/* Informações da Licença */}
        <div className="bg-[#111] p-6 rounded-xl border border-gray-800 shadow-xl space-y-4">
          <h2 className="text-xl font-bold border-b border-gray-800 pb-2">Licença Nio-OS</h2>
          
          {client.entitlement ? (
            <>
              <div>
                <p className="text-sm text-gray-500">Plano</p>
                <p className="font-semibold">{client.entitlement.plan}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Data de Vencimento</p>
                <p className={`font-semibold text-lg ${isExpired ? "text-red-400" : "text-emerald-400"}`}>
                  {new Date(client.entitlement.expiresAt).toLocaleDateString('pt-BR')} 
                  {isExpired ? " (Expirada)" : " (Ativa)"}
                </p>
              </div>
              
              <div className="mt-6 pt-4 border-t border-gray-800">
                <ClientManagerClient 
                  clientId={client.id} 
                  currentExpiresAt={client.entitlement.expiresAt.toISOString()} 
                  currentLogin={client.email}
                />
              </div>
            </>
          ) : (
            <div className="text-gray-500 py-4 text-center space-y-4">
              <p>Este cliente ainda não possui uma licença ativa.</p>
              <div className="pt-4 border-t border-gray-800 text-left">
                 <ClientManagerClient 
                    clientId={client.id} 
                    currentExpiresAt={new Date().toISOString()} 
                    currentLogin={client.email}
                  />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
