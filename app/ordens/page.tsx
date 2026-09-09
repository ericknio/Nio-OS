/**
 * @file app/ordens/page.tsx
 * @description Tela de Listagem e Gestão de Ordens de Serviço (Frontend).
 * 
 * Funcionalidades:
 * - Consulta as ordens via endpoint GET `/api/ordens` com filtros e busca textual em tempo real.
 * - Filtros rápidos por status (Recebido, Em análise, Em reparo, Pronto, Entregue, Cancelado).
 * - Filtro por tipo de equipamento (Notebook, Computador, Celular, Console, etc.).
 * - Destaque visual para ordens atrasadas com prazo de entrega vencido.
 * - Ações contextuais de visualização, edição, impressão e mudança de status.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, formatarData, formatarNumeroOS } from "@/lib/formatadores";
import { nomesStatus, classeStatus, inputClass } from "@/lib/uiConstantes";

type Cliente = {
  id?: string;
  name?: string | null;
  whatsapp?: string | null;
  email?: string | null;
};

type Ordem = {
  id: string;
  osNumber?: number | string | null;
  customer?: Cliente | null;
  equipmentType?: string | null;
  equipmentOther?: string | null;
  brand?: string | null;
  model?: string | null;
  status: string;
  paymentMethod?: string | null;
  totalAmount?: number | string | null;
  openedAt?: string | null;
  expectedDeliveryDate?: string | null;
};

const STATUS = [
  ["", "Todos"],
  ["RECEBIDO", "Recebido"],
  ["EM_ANALISE", "Em análise"],
  ["AGUARDANDO_PECA", "Aguardando peça"],
  ["EM_REPARO", "Em reparo"],
  ["PRONTO", "Pronto"],
  ["ENTREGUE", "Entregue"],
  ["CANCELADO", "Cancelado"],
] as const;

const EQUIPAMENTOS = [
  ["", "Todos"],
  ["NOTEBOOK", "Notebook"],
  ["COMPUTADOR", "Computador"],
  ["CELULAR", "Celular"],
  ["TABLET", "Tablet"],
  ["VIDEOGAME", "Videogame"],
  ["IMPRESSORA", "Impressora"],
  ["TV", "TV"],
  ["OUTRO", "Outro"],
] as const;

const nomesEquipamento = Object.fromEntries(EQUIPAMENTOS);

function numeroOS(ordem: Ordem) {
  return formatarNumeroOS(ordem.osNumber);
}

function equipamentoNome(ordem: Ordem) {
  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }

  return nomesEquipamento[ordem.equipmentType || ""] || ordem.equipmentType || "-";
}

function detalhesEquipamento(ordem: Ordem) {
  return [ordem.brand, ordem.model].filter(Boolean).join(" ") || "-";
}

function ordemAtrasada(ordem: Ordem) {
  if (!ordem.expectedDeliveryDate) return false;
  if (["PRONTO", "ENTREGUE", "CANCELADO"].includes(ordem.status)) return false;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const previsao = new Date(ordem.expectedDeliveryDate);
  previsao.setHours(0, 0, 0, 0);

  return previsao < hoje;
}

function statusEditavel(ordem: Ordem) {
  return !["ENTREGUE", "CANCELADO"].includes(ordem.status);
}

/**
 * Componente principal da Tela de Ordens de Serviço.
 * 
 * Gerencia a busca assíncrona, filtros de status e equipamento, cálculo de prazos
 * e renderização da grade de ordens com ações de edição e impressão de comprovantes.
 */
export default function OrdensPage() {
  const router = useRouter();
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");
  const podeCriarOrdem = !carregandoPermissoes && tem("ordens.criar");
  const podeEditarOrdem = !carregandoPermissoes && tem("ordens.editar");
  const podeImprimirOrdem = !carregandoPermissoes && tem("ordens.imprimir");

  const podeVerValoresOperacionais = !carregandoPermissoes;
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const indicadores = useMemo(() => {
    return {
      total: ordens.length,
      abertas: ordens.filter(
        (ordem) => !["PRONTO", "ENTREGUE", "CANCELADO"].includes(ordem.status)
      ).length,
      prontas: ordens.filter((ordem) => ordem.status === "PRONTO").length,
      entregues: ordens.filter((ordem) => ordem.status === "ENTREGUE").length,
      atrasadas: ordens.filter(ordemAtrasada).length,
    };
  }, [ordens]);

  async function carregarOrdens(filtros?: {
    busca?: string;
    status?: string;
    equipamento?: string;
  }) {
    try {
      setCarregando(true);
      setMensagem("");

      const buscaFiltro = filtros?.busca ?? busca;
      const statusFiltro = filtros?.status ?? status;
      const equipamentoFiltro = filtros?.equipamento ?? equipamento;

      const params = new URLSearchParams();

      if (buscaFiltro.trim()) params.set("busca", buscaFiltro.trim());
      if (statusFiltro) params.set("status", statusFiltro);
      if (equipamentoFiltro) params.set("equipamento", equipamentoFiltro);

      const url = params.toString()
        ? `/api/ordens?${params.toString()}`
        : "/api/ordens";

      const response = await fetch(url, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar ordens.");
        return;
      }

      setOrdens(Array.isArray(data) ? data : []);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar ordens."
      );
    } finally {
      setCarregando(false);
    }
  }

  function aplicarStatusRapido(valor: string) {
    setStatus(valor);
    carregarOrdens({
      busca,
      status: valor,
      equipamento,
    });
  }

  function limparFiltros() {
    setBusca("");
    setStatus("");
    setEquipamento("");

    carregarOrdens({
      busca: "",
      status: "",
      equipamento: "",
    });
  }

  async function duplicarOrdem(ordem: Ordem) {
    const confirmou = window.confirm(
      `Deseja duplicar a OS Nº ${numeroOS(ordem)}? Uma nova OS será criada com outro número.`
    );

    if (!confirmou) return;

    try {
      setMensagem("");

      const resposta = await fetch(`/api/ordens/${ordem.id}/duplicar`, {
        method: "POST",
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao duplicar ordem.");
        return;
      }

      router.push(`/ordens/${dados.id}`);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao duplicar ordem de serviço."
      );
    }
  }

  function imprimirOrdem(ordem: Ordem) {
    window.open(`/api/ordens/${ordem.id}/imprimir`, "_blank");
  }

  useEffect(() => {
    carregarOrdens();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Gestão operacional
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                Ordens de Serviço
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Consulte, filtre e acompanhe as OS da loja. Use os filtros
                rápidos para atendimento no balcão.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeVerDashboard && (
                <Link
                  href="/"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Início
                </Link>
              )}

              {podeCriarOrdem && (
                <Link
                  href="/ordens/nova"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                >
                  + Nova OS
                </Link>
              )}
            </div>
          </div>
        </header>

        {mensagem && (
          <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
            {mensagem}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-5">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Total</p>
            <strong className="mt-2 block text-4xl">{indicadores.total}</strong>
          </div>

          <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Em andamento</p>
            <strong className="mt-2 block text-4xl text-blue-700 dark:text-blue-400">
              {indicadores.abertas}
            </strong>
          </div>

          <button
            type="button"
            onClick={() => aplicarStatusRapido("PRONTO")}
            className="rounded-3xl bg-white dark:bg-slate-900 p-5 text-left shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 hover:bg-blue-50"
          >
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Prontas</p>
            <strong className="mt-2 block text-4xl text-indigo-700 dark:text-indigo-400">
              {indicadores.prontas}
            </strong>
          </button>

          <button
            type="button"
            onClick={() => aplicarStatusRapido("ENTREGUE")}
            className="rounded-3xl bg-white dark:bg-slate-900 p-5 text-left shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 hover:bg-green-50"
          >
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Entregues</p>
            <strong className="mt-2 block text-4xl text-green-700 dark:text-green-400">
              {indicadores.entregues}
            </strong>
          </button>

          <Link
            href="/ordens/atrasadas"
            className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 hover:bg-red-50"
          >
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Atrasadas</p>
            <strong className="mt-2 block text-4xl text-red-700 dark:text-red-400">
              {indicadores.atrasadas}
            </strong>
          </Link>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <h2 className="text-xl font-black">Filtros</h2>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Pesquise por cliente, número da OS, equipamento, marca, modelo,
              série ou IMEI.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.7fr_0.7fr]">
            <div>
              <label className="mb-1 block text-sm font-black">Buscar</label>

              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Exemplo: 000123, João, Samsung, iPhone..."
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black">Status</label>

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={inputClass}
              >
                {STATUS.map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-black">
                Equipamento
              </label>

              <select
                value={equipamento}
                onChange={(event) => setEquipamento(event.target.value)}
                className={inputClass}
              >
                {EQUIPAMENTOS.map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => carregarOrdens()}
                disabled={carregando}
                className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={limparFiltros}
                disabled={carregando}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpar
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black">Lista de Ordens</h2>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                {indicadores.total} ordem(ns) encontrada(s).
              </p>
            </div>

            {podeCriarOrdem && (
              <Link
                href="/ordens/nova"
                className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
              >
                Nova ordem
              </Link>
            )}
          </div>

          {carregando ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              Carregando ordens...
            </div>
          ) : ordens.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 text-center">
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhuma ordem encontrada.
              </p>

              {podeCriarOrdem && (
                <Link
                  href="/ordens/nova"
                  className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  Criar primeira OS
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {ordens.map((ordem) => {
                const atrasada = ordemAtrasada(ordem);

                return (
                  <article
                    key={ordem.id}
                    className={`rounded-2xl border p-4 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 ${
                      atrasada
                        ? "border-red-200 bg-red-50/50"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[120px_1.1fr_1fr_170px_auto] xl:items-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          OS
                        </p>

                        <Link
                          href={`/ordens/${ordem.id}`}
                          className="mt-1 block text-xl font-black text-blue-700 dark:text-blue-400 hover:underline"
                        >
                          Nº {numeroOS(ordem)}
                        </Link>

                        {atrasada && (
                          <span className="mt-2 inline-flex rounded-full bg-red-600 px-3 py-1 text-[11px] font-black text-white">
                            Atrasada
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Cliente
                        </p>

                        <p className="mt-1 text-base font-black text-slate-900 dark:text-white">
                          {ordem.customer?.name || "-"}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {ordem.customer?.whatsapp || "Sem WhatsApp"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Equipamento
                        </p>

                        <p className="mt-1 text-base font-black text-slate-900 dark:text-white">
                          {equipamentoNome(ordem)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {detalhesEquipamento(ordem)}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                            ordem.status
                          )}`}
                        >
                          {nomesStatus[ordem.status] || ordem.status}
                        </span>

                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          Entrada: {formatarData(ordem.openedAt)}
                        </div>

                        <div
                          className={`text-xs font-bold ${
                            atrasada ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          Previsão: {formatarData(ordem.expectedDeliveryDate)}
                        </div>

                        {podeVerValoresOperacionais && (
                          <div className="text-sm font-black text-green-700 dark:text-green-400">
                            {formatarMoeda(ordem.totalAmount)}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Link
                          href={`/ordens/${ordem.id}`}
                          className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Abrir
                        </Link>

                        {podeEditarOrdem && statusEditavel(ordem) && (
                          <Link
                            href={`/ordens/${ordem.id}/editar`}
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                          >
                            Editar
                          </Link>
                        )}

                        {podeCriarOrdem && (
                          <button
                            type="button"
                            onClick={() => duplicarOrdem(ordem)}
                            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                          >
                            Duplicar
                          </button>
                        )}

                        {podeImprimirOrdem && (
                          <button
                            type="button"
                            onClick={() => imprimirOrdem(ordem)}
                            className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white hover:bg-slate-800"
                          >
                            Imprimir
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
