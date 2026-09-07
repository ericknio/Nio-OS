"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";

type FiltroGarantia =
  | "TODAS"
  | "VIGENTE"
  | "VENCENDO"
  | "VENCIDA"
  | "SEM_GARANTIA";

type ClienteGarantia = {
  id?: string;
  name?: string | null;
  whatsapp?: string | null;
};

type FinalizacaoGarantia = {
  deliveredAt?: string | null;
  warrantyDays?: number | string | null;
};

type Garantia = {
  id?: string;
  serviceOrderId?: string | null;
  orderId?: string | null;
  osNumber?: number | string | null;
  orderNumber?: number | string | null;
  numeroOS?: number | string | null;

  customer?: ClienteGarantia | null;
  cliente?: ClienteGarantia | null;
  customerName?: string | null;
  customerWhatsapp?: string | null;

  equipmentType?: string | null;
  equipmentOther?: string | null;
  brand?: string | null;
  model?: string | null;

  status?: string | null;
  statusGarantia?: string | null;
  warrantyStatus?: string | null;
  orderStatus?: string | null;

  diasRestantes?: number | string | null;
  daysRemaining?: number | string | null;

  entregueEm?: string | null;
  deliveredAt?: string | null;

  venceEm?: string | null;
  warrantyExpiresAt?: string | null;
  expiresAt?: string | null;

  warrantyDays?: number | string | null;
  garantiaDias?: number | string | null;
  finalization?: FinalizacaoGarantia | null;
};

type ResumoGarantias = {
  total: number;
  vigentes: number;
  vencendo: number;
  vencidas: number;
  semGarantia: number;
};

type RespostaGarantias = {
  filtro: FiltroGarantia;
  resumo: ResumoGarantias;
  resumoGeral: ResumoGarantias;
  garantias: Garantia[];
};

const RESUMO_VAZIO: ResumoGarantias = {
  total: 0,
  vigentes: 0,
  vencendo: 0,
  vencidas: 0,
  semGarantia: 0,
};

const FILTROS: { valor: FiltroGarantia; label: string }[] = [
  { valor: "TODAS", label: "Todas" },
  { valor: "VIGENTE", label: "Vigentes" },
  { valor: "VENCENDO", label: "Vencendo" },
  { valor: "VENCIDA", label: "Vencidas" },
  { valor: "SEM_GARANTIA", label: "Sem garantia" },
];

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

const nomesStatusGarantia: Record<string, string> = {
  VIGENTE: "Vigente",
  VENCENDO: "Vencendo",
  VENCIDA: "Vencida",
  SEM_GARANTIA: "Sem garantia",
};

import CardMensagem from "@/app/components/CardMensagem";
import { formatarData, formatarNumeroOS as formatarNumOS } from "@/lib/formatadores";
import { nomesStatus as nomesStatusOS } from "@/lib/uiConstantes";

function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function formatarNumeroOS(garantia: Garantia) {
  const numero =
    garantia.osNumber || garantia.orderNumber || garantia.numeroOS || "";
  return formatarNumOS(numero);
}

function nomeEquipamento(garantia: Garantia) {
  if (garantia.equipmentType === "OUTRO" && garantia.equipmentOther) {
    return garantia.equipmentOther;
  }

  return (
    nomesEquipamento[garantia.equipmentType || ""] ||
    garantia.equipmentType ||
    "-"
  );
}

function clienteGarantia(garantia: Garantia) {
  return garantia.customer || garantia.cliente || null;
}

function nomeCliente(garantia: Garantia) {
  const cliente = clienteGarantia(garantia);
  return cliente?.name || garantia.customerName || "-";
}

function whatsappCliente(garantia: Garantia) {
  const cliente = clienteGarantia(garantia);
  return cliente?.whatsapp || garantia.customerWhatsapp || "-";
}

function dataEntrega(garantia: Garantia) {
  return (
    garantia.entregueEm ||
    garantia.deliveredAt ||
    garantia.finalization?.deliveredAt ||
    null
  );
}

function dataVencimento(garantia: Garantia) {
  return garantia.venceEm || garantia.warrantyExpiresAt || garantia.expiresAt || null;
}

function diasRestantesGarantia(garantia: Garantia) {
  const direto = Number(garantia.diasRestantes ?? garantia.daysRemaining);

  if (Number.isFinite(direto)) return direto;

  const vencimento = dataVencimento(garantia);

  if (!vencimento) return null;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const fim = new Date(vencimento);
  fim.setHours(0, 0, 0, 0);

  if (Number.isNaN(fim.getTime())) return null;

  const umDia = 1000 * 60 * 60 * 24;

  return Math.ceil((fim.getTime() - hoje.getTime()) / umDia);
}

function statusGarantia(garantia: Garantia): Exclude<FiltroGarantia, "TODAS"> {
  const status =
    garantia.statusGarantia || garantia.warrantyStatus || garantia.status || "";

  if (["VIGENTE", "VENCENDO", "VENCIDA", "SEM_GARANTIA"].includes(status)) {
    return status as Exclude<FiltroGarantia, "TODAS">;
  }

  const dias = diasRestantesGarantia(garantia);

  if (dias === null) return "SEM_GARANTIA";
  if (dias < 0) return "VENCIDA";
  if (dias <= 7) return "VENCENDO";

  return "VIGENTE";
}

function classeStatusGarantia(status: string) {
  if (status === "VENCIDA") return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30";
  if (status === "VENCENDO") return "bg-orange-50 text-orange-700 dark:text-orange-400 dark:bg-orange-900/30 dark:text-orange-400 ring-orange-600/20 dark:ring-orange-500/30";
  if (status === "VIGENTE") return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-600/20 dark:ring-green-500/30";

  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-600/20";
}

function classeDias(status: string) {
  if (status === "VENCIDA") return "text-red-700 dark:text-red-400";
  if (status === "VENCENDO") return "text-orange-700 dark:text-orange-400";
  if (status === "VIGENTE") return "text-green-700 dark:text-green-400";

  return "text-slate-700 dark:text-slate-200";
}

function ordemId(garantia: Garantia) {
  return garantia.serviceOrderId || garantia.orderId || garantia.id || "";
}



function CardResumo({
  titulo,
  valor,
  detalhe,
  ativo = false,
  destaque = "slate",
  onClick,
}: {
  titulo: string;
  valor: number;
  detalhe?: string;
  ativo?: boolean;
  destaque?: "green" | "orange" | "red" | "slate";
  onClick?: () => void;
}) {
  const cor =
    destaque === "green"
      ? "text-green-700 dark:text-green-400"
      : destaque === "orange"
        ? "text-orange-600"
        : destaque === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-3xl bg-white dark:bg-slate-900 p-5 text-left shadow-sm ring-1 transition hover:bg-blue-50 ${
        ativo ? "ring-2 ring-blue-500" : "ring-slate-200 dark:ring-slate-800"
      }`}
    >
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong className={`mt-2 block text-4xl ${cor}`}>{valor}</strong>

      {detalhe && (
        <p className="mt-2 text-xs font-bold text-slate-400">{detalhe}</p>
      )}
    </button>
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

export default function GarantiasPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerGarantias = !carregandoPermissoes && tem("garantias.ver");
  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");
  const podeVerOrdens = !carregandoPermissoes && tem("ordens.ver");

  const [dados, setDados] = useState<RespostaGarantias | null>(null);
  const [filtro, setFiltro] = useState<FiltroGarantia>("TODAS");
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const garantias = dados?.garantias || [];
  const resumoGeral = dados?.resumoGeral || RESUMO_VAZIO;

  async function carregarGarantias(filtroAtual = filtro) {
    if (carregandoPermissoes || !podeVerGarantias) {
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();
      params.set("filtro", filtroAtual);

      const response = await fetch(`/api/garantias?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar garantias.");
        setDados(null);
        return;
      }

      const resposta: RespostaGarantias = {
        filtro: data?.filtro || filtroAtual,
        resumo: data?.resumo || RESUMO_VAZIO,
        resumoGeral: data?.resumoGeral || data?.resumo || RESUMO_VAZIO,
        garantias: Array.isArray(data?.garantias)
          ? data.garantias
          : Array.isArray(data)
            ? data
            : [],
      };

      setDados(resposta);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar garantias."
      );
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  function aplicarFiltro(novoFiltro: FiltroGarantia) {
    if (carregandoPermissoes || !podeVerGarantias) return;

    setFiltro(novoFiltro);
    carregarGarantias(novoFiltro);
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeVerGarantias) {
      setCarregando(false);
      return;
    }

    carregarGarantias();
  }, [carregandoPermissoes, podeVerGarantias]);

  if (carregandoPermissoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando permissões de garantias...
        </section>
      </main>
    );
  }

  if (!podeVerGarantias) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
            Você não tem permissão para acessar garantias.
          </div>

          {podeVerDashboard && (
            <Link
              href="/"
              className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Voltar para o painel inicial
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
              <p className="text-sm font-bold text-blue-600">Pós-venda</p>

              <h1 className="text-3xl font-black tracking-tight">Garantias</h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Acompanhe garantias vigentes, próximas do vencimento, vencidas e
                ordens finalizadas sem garantia.
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
                onClick={() => carregarGarantias(filtro)}
                disabled={carregando}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-4 md:grid-cols-5">
          <CardResumo
            titulo="Total"
            valor={resumoGeral.total}
            detalhe="Todas as finalizadas"
            ativo={filtro === "TODAS"}
            onClick={() => aplicarFiltro("TODAS")}
          />

          <CardResumo
            titulo="Vigentes"
            valor={resumoGeral.vigentes}
            detalhe="Garantia ativa"
            destaque="green"
            ativo={filtro === "VIGENTE"}
            onClick={() => aplicarFiltro("VIGENTE")}
          />

          <CardResumo
            titulo="Vencendo"
            valor={resumoGeral.vencendo}
            detalhe="Até 7 dias"
            destaque="orange"
            ativo={filtro === "VENCENDO"}
            onClick={() => aplicarFiltro("VENCENDO")}
          />

          <CardResumo
            titulo="Vencidas"
            valor={resumoGeral.vencidas}
            detalhe="Prazo encerrado"
            destaque="red"
            ativo={filtro === "VENCIDA"}
            onClick={() => aplicarFiltro("VENCIDA")}
          />

          <CardResumo
            titulo="Sem garantia"
            valor={resumoGeral.semGarantia}
            detalhe="0 dia informado"
            ativo={filtro === "SEM_GARANTIA"}
            onClick={() => aplicarFiltro("SEM_GARANTIA")}
          />
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Filtro</p>

              <h2 className="text-2xl font-black tracking-tight">
                Consulta de garantias
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {garantias.length} registro(s) encontrado(s).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTROS.map((item) => (
                <button
                  key={item.valor}
                  type="button"
                  onClick={() => aplicarFiltro(item.valor)}
                  disabled={carregando}
                  className={`rounded-xl px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 ${
                    filtro === item.valor
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                      : "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {carregando ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              Carregando garantias...
            </div>
          ) : garantias.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-sm font-bold text-slate-500 dark:text-slate-400">
              Nenhuma garantia encontrada para este filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {garantias.map((garantia, index) => {
                const status = statusGarantia(garantia);
                const dias = diasRestantesGarantia(garantia);
                const idOrdem = ordemId(garantia);
                const garantiaDias = Number(
                  garantia.warrantyDays ?? garantia.garantiaDias ?? 0
                );

                return (
                  <article
                    key={`${idOrdem}-${index}`}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                  >
                    <div className="grid gap-4 xl:grid-cols-[110px_1fr_1fr_140px_140px_130px_auto] xl:items-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          OS
                        </p>

                        <p className="mt-1 text-xl font-black text-blue-700 dark:text-blue-400">
                          Nº {formatarNumeroOS(garantia)}
                        </p>

                        {garantia.orderStatus && (
                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                            {nomesStatusOS[garantia.orderStatus] ||
                              garantia.orderStatus}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Cliente
                        </p>

                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                          {nomeCliente(garantia)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {whatsappCliente(garantia)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Equipamento
                        </p>

                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                          {nomeEquipamento(garantia)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          {[garantia.brand, garantia.model]
                            .filter(Boolean)
                            .join(" ") || "-"}
                        </p>
                      </div>

                      <CampoResumo titulo="Entrega">
                        {formatarData(dataEntrega(garantia))}
                      </CampoResumo>

                      <CampoResumo titulo="Vencimento">
                        {formatarData(dataVencimento(garantia))}
                      </CampoResumo>

                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          Garantia
                        </p>

                        <p className={`mt-1 text-sm font-black ${classeDias(status)}`}>
                          {dias === null ? "-" : `${dias} dia(s)`}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Prazo: {Number.isFinite(garantiaDias) ? garantiaDias : 0} dia(s)
                        </p>

                        <span
                          className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatusGarantia(
                            status
                          )}`}
                        >
                          {nomesStatusGarantia[status] || status}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {idOrdem && podeVerOrdens ? (
                          <Link
                            href={`/ordens/${idOrdem}`}
                            className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                          >
                            Abrir OS
                          </Link>
                        ) : idOrdem && !podeVerOrdens ? (
                          <span className="text-xs font-bold text-slate-400">
                            Sem acesso
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">
                            -
                          </span>
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