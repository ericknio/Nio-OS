/**
 * @file ClientsList.tsx
 * @description Componente de listagem e filtragem de clientes comerciais cadastrados no Cloud Dashboard.
 * Oferece interface responsiva com dupla renderização (tabela com ações para visualizações desktop e
 * cards informativos compactos com links de atalho para dispositivos móveis), além de busca instantânea
 * por nome/login e filtros por status da licença (todos, ativos, vencidos e bloqueados).
 *
 * @module CloudDashboard/Components/ClientsList
 */

"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Representa os dados essenciais de um cliente comercial exibidos na listagem.
 */
interface ClientItem {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: Date | string;
  entitlement: {
    expiresAt: Date | string;
  } | null;
}

/**
 * Renderiza a lista interativa de clientes com ferramentas de pesquisa em tempo real e filtros de status.
 * 
 * Funcionalidades:
 * - Filtro combinado de busca por substring no nome fantasia ou e-mail/login do cliente.
 * - Filtros rápidos por abas (`ALL`, `ACTIVE`, `EXPIRED`, `INACTIVE`).
 * - Cálculo dinâmico de dias restantes de licença com coloração semântica de alerta (vermelho/verde).
 * - Renderização otimizada: tabela completa em telas `>= 768px` e cards com botões de toque (`min-h-[44px]`) em mobile.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {ClientItem[]} props.clients - Array de clientes retornados pelo banco de dados.
 * @returns {JSX.Element} Lista responsiva de clientes comerciais.
 */
export default function ClientsList({ clients }: { clients: ClientItem[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "EXPIRED">("ALL");

  const filtered = clients.filter((client) => {
    const isExpired = client.entitlement
      ? new Date(client.entitlement.expiresAt) < new Date()
      : true;

    // Filter by status
    if (statusFilter === "ACTIVE" && (client.status !== "ACTIVE" || isExpired)) return false;
    if (statusFilter === "INACTIVE" && client.status !== "INACTIVE") return false;
    if (statusFilter === "EXPIRED" && !isExpired) return false;

    // Filter by search
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      client.name.toLowerCase().includes(term) ||
      client.email.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Buscar por nome da empresa ou login..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 min-h-[48px] rounded-xl bg-[#111] border border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-base sm:text-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status Filters */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(
            [
              { id: "ALL", label: "Todos" },
              { id: "ACTIVE", label: "Ativos" },
              { id: "EXPIRED", label: "Vencidos" },
              { id: "INACTIVE", label: "Bloqueados" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3.5 min-h-[40px] text-xs font-semibold rounded-lg border transition whitespace-nowrap ${
                statusFilter === f.id
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-[#111] border-gray-800 text-gray-400 hover:text-white hover:bg-gray-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <div className="text-xs text-gray-500 px-1">
        Exibindo <span className="font-semibold text-gray-300">{filtered.length}</span> de{" "}
        <span className="font-semibold text-gray-300">{clients.length}</span> clientes
      </div>

      {/* MOBILE VIEW: Cards (hidden on md and larger) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 md:hidden">
        {filtered.map((client) => {
          const expDate = client.entitlement ? new Date(client.entitlement.expiresAt) : null;
          const isExpired = expDate ? expDate < new Date() : true;
          const daysLeft = expDate
            ? Math.ceil((expDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            : null;

          return (
            <div
              key={client.id}
              className="bg-[#111] p-4 rounded-xl border border-gray-800/80 shadow-md space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white text-base leading-snug line-clamp-2">
                    {client.name}
                  </h3>
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      client.status === "ACTIVE"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : "bg-red-500/15 text-red-400 border border-red-500/20"
                    }`}
                  >
                    {client.status}
                  </span>
                </div>

                <div className="mt-2 text-xs text-gray-400 flex items-center gap-1.5">
                  <span className="text-gray-500">Login:</span>
                  <span className="font-mono bg-gray-900/90 px-2 py-0.5 rounded border border-gray-800 text-gray-200">
                    {client.email}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-gray-800/60">
                  <span className="text-gray-400">Vencimento:</span>
                  {expDate ? (
                    <span className={`font-semibold ${isExpired ? "text-red-400" : "text-emerald-400"}`}>
                      {expDate.toLocaleDateString("pt-BR")}
                      {daysLeft !== null && (
                        <span className="text-xs text-gray-500 ml-1">
                          ({isExpired ? "Expirado" : `${daysLeft}d`})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-500">Sem Licença</span>
                  )}
                </div>
              </div>

              <Link
                href={`/dashboard/clients/${client.id}`}
                className="w-full min-h-[44px] flex items-center justify-center bg-blue-600/15 hover:bg-blue-600/25 active:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-semibold transition"
              >
                Gerenciar Cliente
              </Link>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center bg-[#111] rounded-xl border border-gray-800 text-gray-500">
            Nenhum cliente encontrado para este filtro.
          </div>
        )}
      </div>

      {/* DESKTOP VIEW: Table (hidden on mobile) */}
      <div className="hidden md:block bg-[#111] rounded-xl border border-gray-800 shadow-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#181818] border-b border-gray-800">
            <tr>
              <th className="p-4 font-semibold text-gray-400 text-sm">Nome da Empresa</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Login</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Status</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Vencimento</th>
              <th className="p-4 font-semibold text-gray-400 text-sm text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((client) => {
              const expDate = client.entitlement ? new Date(client.entitlement.expiresAt) : null;
              const isExpired = expDate ? expDate < new Date() : true;

              return (
                <tr key={client.id} className="hover:bg-[#161616] transition-colors">
                  <td className="p-4 font-semibold text-white">{client.name}</td>
                  <td className="p-4 font-mono text-xs text-gray-300">{client.email}</td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        client.status === "ACTIVE"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      }`}
                    >
                      {client.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm">
                    {expDate ? (
                      <span className={isExpired ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                        {expDate.toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-gray-500">Sem Licença</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="inline-flex items-center px-3.5 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-semibold transition"
                    >
                      Gerenciar
                    </Link>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
                  Nenhum cliente encontrado com os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
