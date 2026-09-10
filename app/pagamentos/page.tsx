/**
 * @file app/pagamentos/page.tsx
 * @description Tela de Gestão de Recebimentos e Pagamentos de Ordens de Serviço (Frontend).
 * 
 * Funcionalidades:
 * - Listagem analítica de todos os pagamentos capturados nas Ordens de Serviço.
 * - Filtro dinâmico por método (PIX, Dinheiro, Cartão, Parcelado) e período de competência.
 * - Indicadores em tempo real: Total recebido, total de estornos/reversões e ticket médio.
 * - Exportação de relatório financeiro oficial em PDF via `/api/pagamentos/pdf`.
 * - Link direto para consulta rápida da O.S. e do cliente pagador.
 */

"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarDataHora,
  formatarNumeroOS,
  numeroSeguro,
} from "@/lib/formatadores";
import {
  nomesPagamento,
  nomesStatus,
  classeStatus,
  inputClass,
} from "@/lib/uiConstantes";

type FormaPagamento = "PIX" | "DINHEIRO" | "CARTAO" | "PARCELADO";
type FormaFiltro = "TODAS" | FormaPagamento;

type Pagamento = {
  id: string;
  amount: number | string;
  percent: number;
  paymentMethod: string;
  note?: string | null;
  userName?: string | null;
  createdAt: string;
  serviceOrder?: {
    id: string;
    osNumber: number | string;
    status: string;
    totalAmount?: number | string | null;
    customer?: {
      name: string;
      whatsapp?: string | null;
    } | null;
  } | null;
};

type Resumo = {
  totalRecebido: number;
  totalPagamentos: number;
  totalEstornos?: number;
  ticketMedio: number;
  dataInicial: string;
  dataFinal: string;
  formaPagamento?: string;
  totalPorForma?: Record<string, number>;
};

type RespostaPagamentos = {
  resumo: Resumo;
  pagamentos: Pagamento[];
};

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartão" },
  { value: "PARCELADO", label: "Parcelado" },
];

function hojeISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function inicioMesISO() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");

  return `${ano}-${mes}-01`;
}

function CardResumo({
  titulo,
  valor,
  detalhe,
  destaque = "slate",
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: "emerald" | "blue" | "orange" | "slate";
}) {
  const cor =
    destaque === "emerald"
      ? "text-emerald-700"
      : destaque === "blue"
        ? "text-blue-700 dark:text-blue-400"
        : destaque === "orange"
          ? "text-orange-700 dark:text-orange-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>
      <strong className={`mt-2 block text-3xl ${cor}`}>{valor}</strong>
      {detalhe && (
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          {detalhe}
        </div>
      )}
    </div>
  );
}

function CardForma({
  forma,
  total,
  ativo,
  onClick,
}: {
  forma: FormaFiltro;
  total: number;
  ativo: boolean;
  onClick: () => void;
}) {
  const label = forma === "TODAS" ? "Todas" : nomesPagamento[forma] || forma;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl p-4 text-left ring-1 transition hover:bg-blue-50 ${
        ativo ? "bg-blue-50 ring-2 ring-blue-500" : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100"
      }`}
    >
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <strong className="mt-1 block text-xl text-slate-900 dark:text-white">
        {formatarMoeda(total)}
      </strong>
    </button>
  );
}

/**
 * Componente principal da Tela de Gestão de Pagamentos de O.S.
 * 
 * Gerencia a filtragem por formas de pagamento, geração e download de PDF
 * e renderização dos lançamentos com destaque visual de estornos.
 */
export default function PagamentosPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeAcessarPagamentos =
    !carregandoPermissoes && tem(["pagamentos.ver", "relatorios.financeiro"]);

  const podeVerRelatorios =
    !carregandoPermissoes && tem(["relatorios.ver", "relatorios.financeiro"]);

  const podeVerOrdens = !carregandoPermissoes && tem("ordens.ver");

  const [inicio, setInicio] = useState(inicioMesISO());
  const [fim, setFim] = useState(hojeISO());
  const [formaFiltro, setFormaFiltro] = useState<FormaFiltro>("TODAS");

  const [dados, setDados] = useState<RespostaPagamentos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const pagamentos = dados?.pagamentos || [];

  const resumo = dados?.resumo || {
    totalRecebido: 0,
    totalPagamentos: 0,
    ticketMedio: 0,
    dataInicial: "",
    dataFinal: "",
    totalPorForma: {},
  };

  const totalPorForma = useMemo(() => {
    const totais = pagamentos.reduce<Record<string, number>>((acc, pagamento) => {
      const forma = pagamento.paymentMethod || "NAO_INFORMADO";
      acc[forma] = (acc[forma] || 0) + numeroSeguro(pagamento.amount);
      return acc;
    }, {});

    return {
      TODAS: resumo.totalRecebido || 0,
      PIX: totais.PIX || 0,
      DINHEIRO: totais.DINHEIRO || 0,
      CARTAO: totais.CARTAO || 0,
      PARCELADO: totais.PARCELADO || 0,
    };
  }, [pagamentos, resumo.totalRecebido]);

  async function carregarPagamentos(
    inicioFiltro = inicio,
    fimFiltro = fim,
    forma = formaFiltro
  ) {
    if (!podeAcessarPagamentos) {
      setCarregando(false);
      setDados(null);
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();

      if (inicioFiltro) params.set("inicio", inicioFiltro);
      if (fimFiltro) params.set("fim", fimFiltro);
      if (forma !== "TODAS") params.set("forma", forma);

      const response = await fetch(`/api/pagamentos?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar pagamentos.");
        setDados(null);
        return;
      }

      setDados(data);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao carregar pagamentos."
      );
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  function aplicarMesAtual() {
    const novoInicio = inicioMesISO();
    const novoFim = hojeISO();

    setInicio(novoInicio);
    setFim(novoFim);
    setFormaFiltro("TODAS");

    carregarPagamentos(novoInicio, novoFim, "TODAS");
  }

  function filtrarPorForma(forma: FormaFiltro) {
    setFormaFiltro(forma);
    carregarPagamentos(inicio, fim, forma);
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeAcessarPagamentos) {
      setCarregando(false);
      setDados(null);
      return;
    }

    carregarPagamentos();
  }, [carregandoPermissoes, podeAcessarPagamentos]);

  if (carregandoPermissoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando permissões...
        </section>
      </main>
    );
  }

  if (!podeAcessarPagamentos) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
            Você não tem permissão para acessar pagamentos.
          </div>

          <Link
            href="/"
            className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Voltar para o painel
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-600">Financeiro</p>

              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Pagamentos
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Consulte pagamentos recebidos por período, forma de pagamento e
                ordem de serviço vinculada. Área restrita ao financeiro.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {podeVerRelatorios && (
                <Link
                  href="/relatorios"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Relatórios
                </Link>
              )}

              {podeVerOrdens && (
                <Link
                  href="/ordens"
                  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
                >
                  Ver Ordens
                </Link>
              )}
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Filtros</p>

            <h2 className="text-2xl font-black tracking-tight">
              Período de consulta
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data inicial
              </label>

              <input
                type="date"
                value={inicio}
                disabled={carregando}
                onChange={(event) => setInicio(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data final
              </label>

              <input
                type="date"
                value={fim}
                disabled={carregando}
                onChange={(event) => setFim(event.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={() => carregarPagamentos()}
              disabled={carregando}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {carregando ? "Carregando..." : "Filtrar"}
            </button>

            <button
              type="button"
              onClick={aplicarMesAtual}
              disabled={carregando}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mês atual
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <CardResumo
            titulo="Total recebido"
            valor={formatarMoeda(resumo.totalRecebido)}
            destaque="emerald"
          />

          <CardResumo
            titulo="Pagamentos"
            valor={resumo.totalPagamentos}
            detalhe={
              resumo.totalEstornos && resumo.totalEstornos > 0
                ? `${resumo.totalPagamentos} recebimento(s) · ${resumo.totalEstornos} estorno(s)`
                : `${pagamentos.length} registro(s) na lista`
            }
            destaque="blue"
          />

          <CardResumo
            titulo="Ticket médio"
            valor={formatarMoeda(resumo.ticketMedio)}
            detalhe="Média por pagamento registrado"
          />
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Resumo</p>

            <h2 className="text-2xl font-black tracking-tight">
              Recebido por forma de pagamento
            </h2>

            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Clique em uma forma para filtrar o período selecionado.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <CardForma
              forma="TODAS"
              total={totalPorForma.TODAS}
              ativo={formaFiltro === "TODAS"}
              onClick={() => filtrarPorForma("TODAS")}
            />

            {FORMAS_PAGAMENTO.map((forma) => (
              <CardForma
                key={forma.value}
                forma={forma.value}
                total={totalPorForma[forma.value]}
                ativo={formaFiltro === forma.value}
                onClick={() => filtrarPorForma(forma.value)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Movimentações</p>

              <h2 className="text-2xl font-black tracking-tight">
                Pagamentos registrados
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {pagamentos.length} registro(s) encontrado(s).
              </p>
            </div>

            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-800">
              {formaFiltro === "TODAS"
                ? "Todas as formas"
                : nomesPagamento[formaFiltro]}
            </span>
          </div>

          {carregando ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-sm font-bold text-slate-500 dark:text-slate-400">
              Carregando pagamentos...
            </div>
          ) : pagamentos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-sm font-bold text-slate-500 dark:text-slate-400">
              Nenhum pagamento encontrado para o período.
            </div>
          ) : (
            <div className="space-y-3">
              {pagamentos.map((pagamento) => {
                const os = pagamento.serviceOrder;
                const cliente = os?.customer;
                const isEstorno = Number(pagamento.amount) < 0;

                return (
                  <article
                    key={pagamento.id}
                    className={`rounded-2xl border p-4 transition ${
                      isEstorno
                        ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[170px_150px_1fr_150px_140px_150px] xl:items-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Data
                        </p>

                        <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                          {formatarDataHora(pagamento.createdAt)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          OS
                        </p>

                        {os?.id ? (
                          <div className="mt-1 flex flex-col gap-1 items-start">
                            <Link
                              href={`/ordens/${os.id}`}
                              className="text-lg font-black text-blue-700 dark:text-blue-400 hover:underline"
                            >
                              Nº {formatarNumeroOS(os.osNumber)}
                            </Link>
                            {isEstorno && (
                              <span className="inline-flex rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                                Devolução / Estorno
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
                            -
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Cliente
                        </p>

                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                          {cliente?.name || "-"}
                        </p>

                        {cliente?.whatsapp && (
                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                            {cliente.whatsapp}
                          </p>
                        )}

                        {pagamento.note && (
                          <p className={`mt-2 whitespace-pre-wrap rounded-xl p-2 text-xs font-semibold ring-1 ${
                            isEstorno
                              ? "bg-white/80 dark:bg-slate-900/80 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-900/50"
                              : "bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 ring-slate-100 dark:ring-slate-800"
                          }`}>
                            {pagamento.note}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Forma
                        </p>

                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                          {nomesPagamento[pagamento.paymentMethod] ||
                            pagamento.paymentMethod ||
                            "-"}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {isEstorno ? "Estorno" : `${pagamento.percent}%`}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Valor
                        </p>

                        <p className={`mt-1 text-lg font-black ${
                          isEstorno ? "text-rose-600 dark:text-rose-400" : "text-emerald-700"
                        }`}>
                          {isEstorno
                            ? `- ${formatarMoeda(Math.abs(Number(pagamento.amount)))}`
                            : formatarMoeda(pagamento.amount)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Status / operador
                        </p>

                        {os?.status ? (
                          <span
                            className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                              os.status
                            )}`}
                          >
                            {nomesStatus[os.status] || os.status}
                          </span>
                        ) : (
                          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
                            -
                          </p>
                        )}

                        <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {pagamento.userName || "Sistema"}
                        </p>
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