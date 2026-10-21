/**
 * @file ResellersList.tsx
 * @description Componente de listagem e consulta de revendedores parceiros cadastrados no Cloud Dashboard.
 * Apresenta métricas consolidadas (saldo de créditos, quantidade de clientes subordinados e sub-revendedores),
 * suporte a filtros por status operacional (todos, ativos e bloqueados), busca textual por login e
 * visualização responsiva otimizada para desktop (tabela) e mobile (cards de ação rápida).
 *
 * @module CloudDashboard/Components/ResellersList
 */

"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Representa os dados e contadores agregados de um revendedor parceiro.
 */
interface ResellerItem {
  id: string;
  email: string;
  status: string;
  credits: number;
  createdAt: Date | string;
  _count?: {
    clients: number;
    subResellers: number;
  };
}

/**
 * Renderiza a listagem responsiva de revendedores com ferramentas de busca e filtros rápidos.
 * 
 * Funcionalidades:
 * - Filtragem instantânea por texto do login/e-mail do revendedor.
 * - Filtros rápidos por abas de status (`ALL`, `ACTIVE`, `INACTIVE`).
 * - Exibição destacada do saldo atual de créditos e contagem de clientes/sub-revendedores.
 * - Tabela desktop detalhada e cartões verticais móveis com áreas de toque ampliadas.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {ResellerItem[]} props.resellers - Lista de revendedores recuperados do banco de dados.
 * @returns {JSX.Element} Lista interativa de revendedores.
 */
export default function ResellersList({ resellers }: { resellers: ResellerItem[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const filtered = resellers.filter((reseller) => {
    if (statusFilter === "ACTIVE" && reseller.status !== "ACTIVE") return false;
    if (statusFilter === "INACTIVE" && reseller.status !== "INACTIVE") return false;

    if (!searchTerm.trim()) return true;
    return reseller.email.toLowerCase().includes(searchTerm.toLowerCase());
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
            placeholder="Buscar por login do revendedor..."
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
        <div className="flex gap-1.5">
          {(
            [
              { id: "ALL", label: "Todos" },
              { id: "ACTIVE", label: "Ativos" },
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
        <span className="font-semibold text-gray-300">{resellers.length}</span> revendedores
      </div>

      {/* MOBILE VIEW: Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 md:hidden">
        {filtered.map((reseller) => (
          <div
            key={reseller.id}
            className="bg-[#111] p-4 rounded-xl border border-gray-800/80 shadow-md space-y-3 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                    R
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-snug">
                      {reseller.email}
                    </h3>
                    <span className="text-[11px] text-gray-500">
                      Desde {new Date(reseller.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    reseller.status === "ACTIVE"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-500/15 text-red-400 border border-red-500/20"
                  }`}
                >
                  {reseller.status}
                </span>
              </div>

              <div className="mt-3 p-2.5 rounded-lg bg-gray-900/60 border border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">Saldo de Créditos:</span>
                <span className="text-base font-black text-blue-400">
                  {reseller.credits}{" "}
                  <span className="text-xs font-normal text-gray-500">
                    {reseller.credits === 1 ? "crédito" : "créditos"}
                  </span>
                </span>
              </div>

              {/* Informação de quantos clientes e revendedores aquele revendedor tem */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="p-2 rounded-lg bg-gray-900/40 border border-gray-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 font-medium">Clientes:</span>
                  <span className="text-xs font-bold text-white">
                    {reseller._count?.clients ?? 0}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-gray-900/40 border border-gray-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 font-medium">Revendedores:</span>
                  <span className="text-xs font-bold text-purple-400">
                    {reseller._count?.subResellers ?? 0}
                  </span>
                </div>
              </div>
            </div>

            <Link
              href={`/dashboard/resellers/${reseller.id}`}
              className="w-full min-h-[44px] flex items-center justify-center bg-blue-600/15 hover:bg-blue-600/25 active:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-semibold transition mt-1"
            >
              Gerenciar Revendedor
            </Link>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-8 text-center bg-[#111] rounded-xl border border-gray-800 text-gray-500">
            Nenhum revendedor encontrado para este filtro.
          </div>
        )}
      </div>

      {/* DESKTOP VIEW: Table */}
      <div className="hidden md:block bg-[#111] rounded-xl border border-gray-800 shadow-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#181818] border-b border-gray-800">
            <tr>
              <th className="p-4 font-semibold text-gray-400 text-sm">Login</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Status</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Créditos</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Clientes</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Revendedores</th>
              <th className="p-4 font-semibold text-gray-400 text-sm">Criado em</th>
              <th className="p-4 font-semibold text-gray-400 text-sm text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((reseller) => (
              <tr key={reseller.id} className="hover:bg-[#161616] transition-colors">
                <td className="p-4 font-semibold text-white">{reseller.email}</td>
                <td className="p-4">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      reseller.status === "ACTIVE"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-red-500/20 text-red-400 border border-red-500/30"
                    }`}
                  >
                    {reseller.status}
                  </span>
                </td>
                <td className="p-4 font-mono font-bold text-blue-400">{reseller.credits}</td>
                <td className="p-4">
                  <span className="font-semibold text-white bg-gray-900/80 px-2 py-0.5 rounded border border-gray-800 text-xs">
                    {reseller._count?.clients ?? 0}
                  </span>
                </td>
                <td className="p-4">
                  <span className="font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 text-xs">
                    {reseller._count?.subResellers ?? 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-400">
                  {new Date(reseller.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="p-4 text-right">
                  <Link
                    href={`/dashboard/resellers/${reseller.id}`}
                    className="inline-flex items-center px-3.5 py-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg text-sm font-semibold transition"
                  >
                    Gerenciar
                  </Link>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-500">
                  Nenhum revendedor cadastrado ou encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
