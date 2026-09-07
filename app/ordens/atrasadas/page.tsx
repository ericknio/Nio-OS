"use client";

// app/ordens/atrasadas/page.tsx
// v1.1.0 - Bloqueia acesso direto antes de carregar dados.

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";

type Cliente = {
  id?: string;
  name?: string | null;
  whatsapp?: string | null;
};

type OrdemAtrasada = {
  id: string;
  osNumber?: number | string | null;
  customer?: Cliente | null;
  customerName?: string | null;
  customerWhatsapp?: string | null;

  equipmentType?: string | null;
  equipmentOther?: string | null;
  brand?: string | null;
  model?: string | null;

  status?: string | null;
  totalAmount?: number | string | null;
  openedAt?: string | null;
  expectedDeliveryDate?: string | null;

  diasAtraso?: number | string | null;
  daysLate?: number | string | null;
};

type ResumoAtrasadas = {
  total: number;
  maiorAtraso: number;
  valorEmAberto: number | null;
  recebido: number;
  emAnalise: number;
  aguardandoPeca: number;
  emReparo: number;
};

type RespostaAtrasadas = {
  financeiroLiberado?: boolean;
  resumo?: Partial<ResumoAtrasadas>;
  ordens?: OrdemAtrasada[];
};

const RESUMO_VAZIO: ResumoAtrasadas = {
  total: 0,
  maiorAtraso: 0,
  valorEmAberto: 0,
  recebido: 0,
  emAnalise: 0,
  aguardandoPeca: 0,
  emReparo: 0,
};

import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarData,
  formatarNumeroOS,
  numeroSeguro,
} from "@/lib/formatadores";
import { nomesStatus, classeStatus } from "@/lib/uiConstantes";

const nomesEquipamento: Record<string, string> = {
  NOTEBOOK: "Notebook",
  COMPUTADOR: "Computador",
  CELULAR: "Celular",
  TABLET: "Tablet",
  VIDEOGAME: "Videogame",
  IMPRESSORA: "Impressora",
  TV: "TV",
  OUTRO: "Outro",
};

function nomeCliente(ordem: OrdemAtrasada) {
  return ordem.customer?.name || ordem.customerName || "-";
}

function whatsappCliente(ordem: OrdemAtrasada) {
  return ordem.customer?.whatsapp || ordem.customerWhatsapp || "-";
}

function nomeEquipamento(ordem: OrdemAtrasada) {
  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }

  return (
    nomesEquipamento[ordem.equipmentType || ""] ||
    ordem.equipmentType ||
    "-"
  );
}

function calcularDiasAtraso(ordem: OrdemAtrasada) {
  const direto = Number(ordem.diasAtraso ?? ordem.daysLate);

  if (Number.isFinite(direto) && direto > 0) {
    return direto;
  }

  if (!ordem.expectedDeliveryDate) return 0;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const previsao = new Date(ordem.expectedDeliveryDate);
  previsao.setHours(0, 0, 0, 0);

  if (Number.isNaN(previsao.getTime())) return 0;

  const umDia = 1000 * 60 * 60 * 24;
  const diferenca = Math.floor((hoje.getTime() - previsao.getTime()) / umDia);

  return Math.max(diferenca, 0);
}

function classeAtraso(dias: number) {
  if (dias >= 7) return "bg-red-600 text-white";
  if (dias >= 3) return "bg-orange-500 text-white";

  return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-1 ring-red-600/20";
}

function mensagemEhSucesso(mensagem: string) {
  return mensagem.toLowerCase().includes("sucesso");
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
  destaque?: "red" | "orange" | "purple" | "green" | "slate";
}) {
  const cor =
    destaque === "red"
      ? "text-red-700 dark:text-red-400"
      : destaque === "orange"
        ? "text-orange-600"
        : destaque === "purple"
          ? "text-purple-700 dark:text-purple-400"
          : destaque === "green"
            ? "text-green-700 dark:text-green-400"
            : "text-slate-950 dark:text-slate-100";

  return (
    <div className="min-w-0 rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong className={`mt-2 block break-words text-4xl leading-tight ${cor}`}>
        {valor}
      </strong>

      {detalhe && (
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          {detalhe}
        </div>
      )}
    </div>
  );
}

function CampoResumo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{children}</div>
    </div>
  );
}


export default function OrdensAtrasadasPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeAcessar = !carregandoPermissoes && tem("ordens.ver");
  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");

  const podeVerValoresOperacionais = !carregandoPermissoes;

  const [dados, setDados] = useState<RespostaAtrasadas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const ordens = dados?.ordens || [];

  const resumo = useMemo<ResumoAtrasadas>(() => {
    if (dados?.resumo) {
      return {
        ...RESUMO_VAZIO,
        ...dados.resumo,
        valorEmAberto:
          dados.resumo.valorEmAberto === null ||
          dados.resumo.valorEmAberto === undefined
            ? 0
            : numeroSeguro(dados.resumo.valorEmAberto),
      };
    }

    const maiorAtraso = ordens.reduce((maior, ordem) => {
      const dias = calcularDiasAtraso(ordem);
      return dias > maior ? dias : maior;
    }, 0);

    const valorEmAberto = ordens.reduce((total, ordem) => {
      return total + numeroSeguro(ordem.totalAmount);
    }, 0);

    return {
      total: ordens.length,
      maiorAtraso,
      valorEmAberto,
      recebido: ordens.filter((ordem) => ordem.status === "RECEBIDO").length,
      emAnalise: ordens.filter((ordem) => ordem.status === "EM_ANALISE").length,
      aguardandoPeca: ordens.filter(
        (ordem) => ordem.status === "AGUARDANDO_PECA"
      ).length,
      emReparo: ordens.filter((ordem) => ordem.status === "EM_REPARO").length,
    };
  }, [dados?.resumo, ordens]);

  const financeiroLiberado =
    podeVerValoresOperacionais && dados?.financeiroLiberado !== false;

  async function carregarOrdens() {
    if (!podeAcessar) {
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch("/api/ordens/atrasadas", {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar OS atrasadas.");
        setDados(null);
        return;
      }

      setDados({
        financeiroLiberado: data?.financeiroLiberado,
        resumo: data?.resumo || RESUMO_VAZIO,
        ordens: Array.isArray(data?.ordens)
          ? data.ordens
          : Array.isArray(data)
            ? data
            : Array.isArray(data?.items)
              ? data.items
              : [],
      });
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao carregar OS atrasadas."
      );
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeAcessar) {
      setDados(null);
      setMensagem("");
      setCarregando(false);
      return;
    }

    carregarOrdens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoPermissoes, podeAcessar]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando OS atrasadas...
        </section>
      </main>
    );
  }

  if (!podeAcessar) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
            Você não tem permissão para acessar OS atrasadas.
          </div>

          {podeVerDashboard && (
            <Link
              href="/"
              className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Voltar para o painel
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-red-600">
                Controle operacional
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                OS Atrasadas
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Ordens com previsão vencida e ainda não marcadas como prontas,
                entregues ou canceladas.
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

              <button
                type="button"
                onClick={carregarOrdens}
                disabled={carregando}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section
          className={`grid gap-4 md:grid-cols-2 ${
            financeiroLiberado ? "xl:grid-cols-4" : "xl:grid-cols-3"
          }`}
        >
          <CardResumo
            titulo="Total atrasadas"
            valor={resumo.total}
            detalhe="OS fora do prazo"
            destaque="red"
          />

          <CardResumo
            titulo="Maior atraso"
            valor={resumo.maiorAtraso}
            detalhe="dia(s)"
            destaque="orange"
          />

          {financeiroLiberado && (
            <CardResumo
              titulo="Valor em aberto"
              valor={formatarMoeda(resumo.valorEmAberto)}
              detalhe="Soma das OS atrasadas"
            />
          )}

          <CardResumo
            titulo="Em reparo"
            valor={resumo.emReparo}
            detalhe="Atrasadas nessa etapa"
            destaque="purple"
          />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <CampoResumo titulo="Recebidas">{resumo.recebido}</CampoResumo>
          <CampoResumo titulo="Em análise">{resumo.emAnalise}</CampoResumo>
          <CampoResumo titulo="Aguardando peça">
            {resumo.aguardandoPeca}
          </CampoResumo>
          <CampoResumo titulo="Em reparo">{resumo.emReparo}</CampoResumo>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Lista crítica</p>

              <h2 className="text-2xl font-black tracking-tight">
                Ordens atrasadas
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {ordens.length} ordem(ns) encontrada(s).
              </p>
            </div>

            <Link
              href="/ordens"
              className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
            >
              Ver todas as OS
            </Link>
          </div>

          {ordens.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-green-50 p-6 text-sm font-bold text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
              Nenhuma OS atrasada encontrada. Operação em dia.
            </div>
          ) : (
            <div className="space-y-3">
              {ordens.map((ordem) => {
                const dias = calcularDiasAtraso(ordem);
                const equipamento = nomeEquipamento(ordem);
                const marcaModelo =
                  [ordem.brand, ordem.model].filter(Boolean).join(" ") || "-";

                return (
                  <article
                    key={ordem.id}
                    className="rounded-2xl border border-red-100 bg-white dark:bg-slate-900 p-4 transition hover:bg-red-50/30"
                  >
                    <div
                      className={`grid gap-4 ${
                        financeiroLiberado
                          ? "xl:grid-cols-[110px_1fr_1fr_150px_140px_130px_130px_auto]"
                          : "xl:grid-cols-[110px_1fr_1fr_150px_140px_130px_auto]"
                      } xl:items-center`}
                    >
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          OS
                        </p>

                        <p className="mt-1 text-xl font-black text-blue-700 dark:text-blue-400">
                          Nº {formatarNumeroOS(ordem.osNumber)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Entrada: {formatarData(ordem.openedAt)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Cliente
                        </p>

                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                          {nomeCliente(ordem)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {whatsappCliente(ordem)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Equipamento
                        </p>

                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                          {equipamento}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {marcaModelo}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Status
                        </p>

                        <span
                          className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                            ordem.status
                          )}`}
                        >
                          {nomesStatus[ordem.status || ""] ||
                            ordem.status ||
                            "-"}
                        </span>
                      </div>

                      <CampoResumo titulo="Previsão">
                        {formatarData(ordem.expectedDeliveryDate)}
                      </CampoResumo>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Atraso
                        </p>

                        <span
                          className={`mt-2 inline-flex min-w-[90px] items-center justify-center rounded-full px-3 py-1 text-xs font-black ${classeAtraso(
                            dias
                          )}`}
                        >
                          {dias} dia(s)
                        </span>
                      </div>

                      {financeiroLiberado && (
                        <CampoResumo titulo="Total">
                          {formatarMoeda(ordem.totalAmount)}
                        </CampoResumo>
                      )}

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Link
                          href={`/ordens/${ordem.id}`}
                          className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Abrir OS
                        </Link>
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
