/**
 * @file app/relatorios/page.tsx
 * @description Painel de Relatórios Técnicos, Comissões e Indicadores de O.S. (Frontend).
 * 
 * Funcionalidades:
 * - Indicadores analíticos de assistência técnica: faturamento bruto, custo de peças de bancada e lucro da loja.
 * - Apuração individual de comissões técnicas com base na regra de partilha configurada por técnico.
 * - Gráficos de barras de distribuição por categoria de equipamento (Notebook, Celular, Console, etc.).
 * - Exportação de relatórios gerenciais em PDF com cabeçalho personalizado da empresa.
 * - Proteção de privacidade: técnicos comuns visualizam exclusivamente suas próprias comissões e ordens atendidas.
 */

"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarData,
  formatarNumeroOS,
  numeroSeguro,
} from "@/lib/formatadores";
import {
  nomesStatus,
  nomesPagamento,
  classeStatus,
  inputClass,
} from "@/lib/uiConstantes";

type Cliente = {
  id?: string;
  name?: string | null;
  whatsapp?: string | null;
};

type OrdemRelatorio = {
  id: string;
  osNumber?: number | string | null;
  customer?: Cliente | null;
  customerName?: string | null;
  customerWhatsapp?: string | null;
  equipmentType?: string | null;
  equipmentOther?: string | null;
  nomeEquipamento?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
  totalAmount?: number | string | null;
  grossAmount?: number | string | null;
  netAmount?: number | string | null;
  technicalPartsCost?: number | string | null;
  grossProfit?: number | string | null;
  costTracked?: boolean | null;
  technicianResponsible?: string | null;
  technicianProfitPercent?: number | string | null;
  technicianProfitShare?: number | string | null;
  storeProfit?: number | string | null;
  profitShareTracked?: boolean | null;
  technicianReportKey?: string | null;
  openedAt?: string | null;
};

type EquipamentoRelatorio = {
  nome?: string | null;
  name?: string | null;
  equipmentType?: string | null;
  total?: number | string | null;
  quantidade?: number | string | null;
};

type ModeloRelatorio = {
  nome?: string | null;
  name?: string | null;
  modelo?: string | null;
  brand?: string | null;
  model?: string | null;
  total?: number | string | null;
  quantidade?: number | string | null;
};

type ClienteRelatorio = {
  customerId?: string | null;
  id?: string | null;
  name?: string | null;
  whatsapp?: string | null;
  totalOrdens?: number;
  total?: number;
  quantidade?: number;
};

type DiaSemanaRelatorio = {
  diaSemana: number;
  label: string;
  lojaAberta?: boolean;
  totalOrdens: number;
  ordensAbertas: number;
  ordensEntregues: number;
  ordensCanceladas: number;
  totalAmount?: number | null;
};

type DiaPeriodoRelatorio = {
  data: string;
  label: string;
  totalOrdens: number;
  ordensAbertas: number;
  ordensEntregues: number;
  ordensCanceladas: number;
  totalAmount?: number | null;
};

type TecnicoFinanceiroRelatorio = {
  technicianKey: string;
  technicianName: string;
  totalOrders: number;
  grossProfitGenerated: number;
  technicianProfitShare: number;
  storeProfit: number;
  untrackedOrders: number;
};

type RelatorioData = {
  financeiroSensivelLiberado?: boolean;
  periodo?: {
    dataInicial?: string;
    dataFinal?: string;
  };
  resumo: {
    totalOrdens?: number;
    ordensAbertas?: number;
    ordensEntregues?: number;
    ordensCanceladas?: number;
    valorRecebido?: number | null;
    totalRecebido?: number | null;
    recebidoPorForma?: Record<string, number>;
    valorGerado?: number;
    valorPendente?: number;
    valorCobradoPecas?: number;
    valorMaoDeObra?: number;
    descontoTotal?: number;
    ticketMedio?: number;
    faturamentoBruto?: number;
    receitaLiquida?: number;
    custoPecas?: number | null;
    lucroBruto?: number | null;
    lucroBrutoParcial?: number | null;
    ordensSemCustoRastreado?: number | null;
    participacaoTecnicos?: number | null;
    participacaoTecnicosParcial?: number | null;
    lucroLoja?: number | null;
    lucroLojaParcial?: number | null;
    ordensSemParticipacaoCalculavel?: number | null;
  };
  tecnicosFinanceiros?: TecnicoFinanceiroRelatorio[];
  equipamentos?: EquipamentoRelatorio[];
  equipamentosMaisConsertados?: EquipamentoRelatorio[];
  modelos?: ModeloRelatorio[];
  modelosMaisConsertados?: ModeloRelatorio[];
  clientes?: ClienteRelatorio[];
  clientesMaisAtivos?: ClienteRelatorio[];
  funcionamento?: {
    diasAbertos?: number[];
    labels?: string[];
    abertura?: string;
    fechamento?: string;
  };
  diagnostico?: {
    diaSemanaMaisForte?: DiaSemanaRelatorio | null;
    diaSemanaMaisFraco?: DiaSemanaRelatorio | null;
    diaMesMaisForte?: DiaPeriodoRelatorio | null;
    diaMesMaisFraco?: DiaPeriodoRelatorio | null;
  };
  diasSemana?: DiaSemanaRelatorio[];
  diasPeriodo?: DiaPeriodoRelatorio[];
  ordens?: OrdemRelatorio[];
};

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

function formatarDataInput(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function primeiroDiaMes() {
  const hoje = new Date();
  return formatarDataInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
}

function dataHoje() {
  return formatarDataInput(new Date());
}

function nomeEquipamento(ordem: OrdemRelatorio) {
  if (ordem.nomeEquipamento) return ordem.nomeEquipamento;

  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }

  return nomesEquipamento[ordem.equipmentType || ""] || ordem.equipmentType || "-";
}

function totalEquipamento(item: EquipamentoRelatorio) {
  return numeroSeguro(item.total ?? item.quantidade ?? 0);
}

function totalModelo(item: ModeloRelatorio) {
  return numeroSeguro(item.total ?? item.quantidade ?? 0);
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
  destaque?: "blue" | "green" | "red" | "slate";
}) {
  const cor =
    destaque === "blue"
      ? "text-blue-700 dark:text-blue-400"
      : destaque === "green"
        ? "text-green-700 dark:text-green-400"
        : destaque === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <div className="min-w-0 rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong
        className={`mt-2 block max-w-full break-words text-3xl leading-tight ${cor}`}
      >
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

function LinhaRanking({
  titulo,
  subtitulo,
  total,
}: {
  titulo: string;
  subtitulo?: string | null;
  total: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <div>
        <p className="font-black text-slate-900 dark:text-white">{titulo}</p>

        {subtitulo && (
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {subtitulo}
          </p>
        )}
      </div>

      <strong className="text-2xl">{total}</strong>
    </div>
  );
}

function BarraMovimentoOS({
  label,
  valor,
  maximo,
  detalhe,
  destaque = false,
}: {
  label: string;
  valor: number;
  maximo: number;
  detalhe: ReactNode;
  destaque?: boolean;
}) {
  const largura = maximo > 0 ? Math.max(4, (valor / maximo) * 100) : 0;

  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${
        destaque ? "bg-blue-50 ring-blue-200" : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">{label}</p>

          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {detalhe}
          </div>
        </div>

        <strong
          className={`shrink-0 text-sm font-black ${
            destaque ? "text-blue-700 dark:text-blue-400" : "text-slate-700 dark:text-slate-200"
          }`}
        >
          {valor} OS
        </strong>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
        <div
          className={`h-full rounded-full ${
            destaque ? "bg-blue-600" : "bg-slate-400"
          }`}
          style={{ width: `${largura}%` }}
        />
      </div>
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

/**
 * Componente principal da Tela de Relatórios e Comissões de O.S.
 * 
 * Gerencia a busca consolidada via `/api/relatorios`, apuração de repasses
 * para técnicos, filtros de período e exportação em formato PDF.
 */
export default function RelatoriosPage() {
  const { usuario, carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const ehTecnico = usuario?.role === "TECNICO";
  const podeVerFinanceiroSensivel =
    !carregandoPermissoes && (usuario?.role === "ADMIN" || tem("relatorios.financeiro"));
  const ehApenasTecnico = ehTecnico && !podeVerFinanceiroSensivel;

  const podeVerDashboard = !carregandoPermissoes && tem("dashboard.ver");
  const podeAcessarRelatorios =
    !carregandoPermissoes &&
    (tem(["relatorios.ver", "relatorios.financeiro"]) || ehTecnico);
  const podeVerOrdens = !carregandoPermissoes && tem("ordens.ver");

  const [dados, setDados] = useState<RelatorioData | null>(null);
  const [dataInicial, setDataInicial] = useState(primeiroDiaMes());
  const [dataFinal, setDataFinal] = useState(dataHoje());
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<"geral" | "tecnicos">("geral");
  const [tecnicoSelecionado, setTecnicoSelecionado] = useState("TODOS");

  useEffect(() => {
    if (ehApenasTecnico) {
      setAbaAtiva("tecnicos");
      if (usuario?.id) {
        setTecnicoSelecionado(usuario.id);
      }
    }
  }, [ehApenasTecnico, usuario?.id]);

  const resumo = dados?.resumo || {};
  const equipamentos =
    dados?.equipamentos || dados?.equipamentosMaisConsertados || [];
  const clientes = dados?.clientes || dados?.clientesMaisAtivos || [];
  const ordens = dados?.ordens || [];

  const modelos = useMemo<ModeloRelatorio[]>(() => {
    if (dados?.modelosMaisConsertados && dados.modelosMaisConsertados.length > 0) {
      return dados.modelosMaisConsertados;
    }
    if (dados?.modelos && dados.modelos.length > 0) {
      return dados.modelos;
    }
    const mapa = new Map<string, number>();
    for (const o of ordens) {
      const brand = String(o?.brand || "").trim();
      const model = String(o?.model || "").trim();
      let nome = "Modelo não informado";
      if (brand && model) {
        nome = model.toLowerCase().includes(brand.toLowerCase())
          ? model
          : `${brand} ${model}`;
      } else if (model) {
        nome = model;
      } else if (brand) {
        nome = `${brand} (Não especificado)`;
      }
      mapa.set(nome, (mapa.get(nome) || 0) + 1);
    }
    return Array.from(mapa.entries())
      .map(([nome, total]): ModeloRelatorio => ({ nome, total, quantidade: total }))
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  }, [dados?.modelosMaisConsertados, dados?.modelos, ordens]);

  const diasSemana = dados?.diasSemana || [];
  const diasPeriodo = dados?.diasPeriodo || [];

  const valoresOperacionaisLiberados = podeAcessarRelatorios;

  const totalOrdens = numeroSeguro(resumo.totalOrdens);
  const ordensAbertas = numeroSeguro(resumo.ordensAbertas);
  const ordensEntregues = numeroSeguro(resumo.ordensEntregues);
  const ordensCanceladas = numeroSeguro(resumo.ordensCanceladas);

  const valorRecebido = numeroSeguro(
    resumo.valorRecebido ?? resumo.totalRecebido
  );

  const valorGerado = numeroSeguro(resumo.valorGerado);
  const valorPendente = numeroSeguro(resumo.valorPendente);
  const valorCobradoPecas = numeroSeguro(resumo.valorCobradoPecas);
  const faturamentoBruto = numeroSeguro(
    resumo.faturamentoBruto ?? valorGerado + numeroSeguro(resumo.descontoTotal)
  );
  const receitaLiquida = numeroSeguro(resumo.receitaLiquida ?? valorGerado);
  const descontoTotal = numeroSeguro(resumo.descontoTotal);
  const custoPecas = numeroSeguro(resumo.custoPecas);
  const lucroBrutoParcial = numeroSeguro(resumo.lucroBrutoParcial);
  const ordensSemCustoRastreado = numeroSeguro(
    resumo.ordensSemCustoRastreado
  );
  const financeiroSensivelLiberado =
    podeVerFinanceiroSensivel && dados?.financeiroSensivelLiberado === true;
  const lucroBruto =
    resumo.lucroBruto === null || resumo.lucroBruto === undefined
      ? null
      : numeroSeguro(resumo.lucroBruto);
  const recebidoPorForma = resumo.recebidoPorForma || {};
  const tecnicosFinanceiros = dados?.tecnicosFinanceiros || [];
  const tecnicosExibidos = useMemo(
    () =>
      ehApenasTecnico
        ? tecnicosFinanceiros
        : tecnicoSelecionado === "TODOS"
        ? tecnicosFinanceiros
        : tecnicosFinanceiros.filter(
            (tecnico) => tecnico.technicianKey === tecnicoSelecionado
          ),
    [tecnicoSelecionado, tecnicosFinanceiros, ehApenasTecnico]
  );

  const ordensTecnico = useMemo(
    () =>
      ehApenasTecnico
        ? ordens
        : ordens.filter(
            (ordem) =>
              Boolean(ordem.technicianReportKey) &&
              (tecnicoSelecionado === "TODOS" ||
                ordem.technicianReportKey === tecnicoSelecionado)
          ),
    [ordens, tecnicoSelecionado, ehApenasTecnico]
  );

  const resumoTecnico = useMemo(
    () =>
      tecnicosExibidos.reduce(
        (acc, tecnico) => ({
          totalOrders: acc.totalOrders + numeroSeguro(tecnico.totalOrders),
          grossProfitGenerated:
            acc.grossProfitGenerated +
            numeroSeguro(tecnico.grossProfitGenerated),
          technicianProfitShare:
            acc.technicianProfitShare +
            numeroSeguro(tecnico.technicianProfitShare),
          storeProfit: acc.storeProfit + numeroSeguro(tecnico.storeProfit),
          untrackedOrders:
            acc.untrackedOrders + numeroSeguro(tecnico.untrackedOrders),
        }),
        {
          totalOrders: 0,
          grossProfitGenerated: 0,
          technicianProfitShare: 0,
          storeProfit: 0,
          untrackedOrders: 0,
        }
      ),
    [tecnicosExibidos]
  );

  const tecnicoSelecionadoNome =
    tecnicoSelecionado === "TODOS"
      ? "Todos os técnicos"
      : tecnicosFinanceiros.find(
          (tecnico) => tecnico.technicianKey === tecnicoSelecionado
        )?.technicianName || "Técnico";

  const taxaEntrega = useMemo(() => {
    if (totalOrdens <= 0) return 0;
    return Math.round((ordensEntregues / totalOrdens) * 100);
  }, [totalOrdens, ordensEntregues]);

  const maxSemana = Math.max(
    0,
    ...diasSemana.map((dia) => numeroSeguro(dia.totalOrdens))
  );

  const maxPeriodo = Math.max(
    0,
    ...diasPeriodo.map((dia) => numeroSeguro(dia.totalOrdens))
  );

  const textoFuncionamento = dados?.funcionamento
    ? `${(dados.funcionamento.labels || []).join(", ")} | ${
        dados.funcionamento.abertura || "08:00"
      } às ${dados.funcionamento.fechamento || "18:00"}`
    : "";

  async function carregarRelatorio(
    inicioBusca = dataInicial,
    fimBusca = dataFinal
  ) {
    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();
      params.set("dataInicial", inicioBusca);
      params.set("dataFinal", fimBusca);

      const response = await fetch(`/api/relatorios?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar relatório.");
        setDados(null);
        return;
      }

      setDados(data);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar relatório."
      );
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  function aplicarMesAtual() {
    const novoInicio = primeiroDiaMes();
    const novoFim = dataHoje();

    setDataInicial(novoInicio);
    setDataFinal(novoFim);

    carregarRelatorio(novoInicio, novoFim);
  }

  function exportarPDF(modo: "geral" | "tecnicos" = "geral") {
    if (!podeAcessarRelatorios) {
      setMensagem("Você não tem permissão para gerar o relatório.");
      return;
    }

    if (modo === "tecnicos" && !podeVerFinanceiroSensivel && !ehApenasTecnico) {
      setMensagem("Você não tem permissão para gerar o relatório financeiro por técnico.");
      return;
    }

    const params = new URLSearchParams();
    params.set("inicio", dataInicial);
    params.set("fim", dataFinal);

    if (modo === "tecnicos") {
      params.set("modo", "tecnicos");
      params.set("tecnico", ehApenasTecnico && usuario?.id ? usuario.id : tecnicoSelecionado);
    }

    window.open(`/api/relatorios/pdf?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeAcessarRelatorios) {
      setCarregando(false);
      return;
    }

    carregarRelatorio();
  }, [carregandoPermissoes, podeAcessarRelatorios]);

  if (carregandoPermissoes) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Verificando permissões...
        </section>
      </main>
    );
  }

  if (!podeAcessarRelatorios) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar os relatórios de OS.
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
              <p className="text-sm font-bold text-blue-600">
                Inteligência operacional
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                Relatórios OS
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Consulte desempenho das ordens de serviço, equipamentos mais atendidos,
                clientes mais ativos e, quando autorizado, resultado financeiro de OS por período.
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

              {podeAcessarRelatorios && (
                <button
                  type="button"
                  onClick={() => exportarPDF("geral")}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700"
                >
                  Exportar PDF
                </button>
              )}
            </div>
          </div>
        </header>

        {(podeVerFinanceiroSensivel || ehApenasTecnico) && (
          <nav className="flex flex-wrap gap-2 rounded-3xl bg-white dark:bg-slate-900 p-2 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            {!ehApenasTecnico && (
              <button
                type="button"
                onClick={() => {
                  setAbaAtiva("geral");
                  setMensagem("");
                }}
                className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                  abaAtiva === "geral"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                }`}
              >
                Visão Geral
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setAbaAtiva("tecnicos");
                setMensagem("");
              }}
              className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                abaAtiva === "tecnicos"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              }`}
            >
              {ehApenasTecnico ? "Minha Comissão" : "Lucro por Técnico"}
            </button>
          </nav>
        )}

        <CardMensagem mensagem={mensagem} />

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Filtro</p>

            <h2 className="text-2xl font-black tracking-tight">
              Período do relatório
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data inicial
              </label>

              <input
                type="date"
                value={dataInicial}
                disabled={carregando}
                onChange={(event) => setDataInicial(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data final
              </label>

              <input
                type="date"
                value={dataFinal}
                disabled={carregando}
                onChange={(event) => setDataFinal(event.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={() => carregarRelatorio(dataInicial, dataFinal)}
              disabled={carregando}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {carregando ? "Carregando..." : "Gerar relatório"}
            </button>

            <button
              type="button"
              onClick={aplicarMesAtual}
              disabled={carregando}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mês atual
            </button>
          </div>
        </section>

        <div className={abaAtiva === "geral" && !ehApenasTecnico ? "contents" : "hidden"}>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CardResumo titulo="Total de OS" valor={totalOrdens} />

          <CardResumo
            titulo="Abertas"
            valor={ordensAbertas}
            destaque="blue"
          />

          <CardResumo
            titulo="Entregues"
            valor={ordensEntregues}
            detalhe={`${taxaEntrega}% do período`}
            destaque="green"
          />

          <CardResumo
            titulo="Canceladas"
            valor={ordensCanceladas}
            destaque="red"
          />

          {valoresOperacionaisLiberados && (
            <>
              <CardResumo
                titulo="Recebido"
                valor={formatarMoeda(valorRecebido)}
                destaque="green"
              />

              <CardResumo
                titulo="Faturamento bruto"
                valor={formatarMoeda(faturamentoBruto)}
                detalhe={`Peças: ${formatarMoeda(valorCobradoPecas)} | Mão de obra: ${formatarMoeda(resumo.valorMaoDeObra)}`}
              />

              <CardResumo
                titulo="Descontos"
                valor={formatarMoeda(descontoTotal)}
              />

              <CardResumo
                titulo="Receita líquida"
                valor={formatarMoeda(receitaLiquida)}
                detalhe={`Pendente: ${formatarMoeda(valorPendente)}`}
              />

              {financeiroSensivelLiberado && (
                <>
                  <CardResumo
                    titulo="Custo das peças"
                    valor={formatarMoeda(custoPecas)}
                    detalhe="Custo histórico dos itens técnicos vinculados."
                  />

                  <CardResumo
                    titulo="Lucro bruto"
                    valor={formatarMoeda(
                      lucroBruto === null ? lucroBrutoParcial : lucroBruto
                    )}
                    detalhe={
                      lucroBruto === null
                        ? `Parcial: ${ordensSemCustoRastreado} OS com custo de peça antigo/não rastreado.`
                        : "Receita líquida menos custo das peças."
                    }
                    destaque={lucroBruto !== null && lucroBruto < 0 ? "red" : "green"}
                  />

                </>
              )}
            </>
          )}
        </section>

        {valoresOperacionaisLiberados && Object.keys(recebidoPorForma).length > 0 && (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Financeiro</p>

              <h2 className="text-2xl font-black tracking-tight">
                Recebido por forma de pagamento
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              {Object.entries(recebidoPorForma).map(([forma, total]) => (
                <CampoResumo key={forma} titulo={nomesPagamento[forma] || forma}>
                  <span className="text-lg text-green-700 dark:text-green-400">
                    {formatarMoeda(total)}
                  </span>
                </CampoResumo>
              ))}
            </div>
          </section>
        )}

        {!carregando && (diasSemana.length > 0 || diasPeriodo.length > 0) && (
          <section className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="mb-5">
                <p className="text-sm font-bold text-blue-600">Funcionamento</p>

                <h2 className="text-2xl font-black tracking-tight">
                  OS por dia da semana
                </h2>

                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                  Dias fechados não entram no cálculo de dia fraco.
                  {textoFuncionamento ? ` Considerado: ${textoFuncionamento}.` : ""}
                </p>
              </div>

              <div className="space-y-3">
                {diasSemana.map((dia) => (
                  <BarraMovimentoOS
                    key={dia.diaSemana}
                    label={dia.label}
                    valor={numeroSeguro(dia.totalOrdens)}
                    maximo={maxSemana}
                    detalhe={`${dia.ordensEntregues} entregue(s) | ${dia.ordensAbertas} aberta(s) | ${dia.ordensCanceladas} cancelada(s)`}
                    destaque={
                      dados?.diagnostico?.diaSemanaMaisForte?.diaSemana ===
                      dia.diaSemana
                    }
                  />
                ))}
              </div>
            </section>

            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="mb-5">
                <p className="text-sm font-bold text-blue-600">Diagnóstico</p>

                <h2 className="text-2xl font-black tracking-tight">
                  Leitura por funcionamento
                </h2>

                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                  Baseado somente nos dias marcados como abertos.
                </p>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl bg-green-50 p-4 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
                  <p className="text-sm font-black text-green-700 dark:text-green-400">
                    Dia da semana mais forte
                  </p>
                  <p className="mt-1 text-sm font-semibold text-green-900">
                    {dados?.diagnostico?.diaSemanaMaisForte?.label || "-"} | {dados?.diagnostico?.diaSemanaMaisForte?.totalOrdens || 0} OS
                  </p>
                </div>

                <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-200 dark:bg-orange-900/20 dark:ring-orange-500/30">
                  <p className="text-sm font-black text-orange-700 dark:text-orange-400">
                    Dia da semana mais fraco
                  </p>
                  <p className="mt-1 text-sm font-semibold text-orange-900">
                    {dados?.diagnostico?.diaSemanaMaisFraco?.label || "-"} | {dados?.diagnostico?.diaSemanaMaisFraco?.totalOrdens || 0} OS
                  </p>
                </div>

                <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                  <p className="text-sm font-black text-blue-700 dark:text-blue-400">
                    Melhor dia do período
                  </p>
                  <p className="mt-1 text-sm font-semibold text-blue-900">
                    {dados?.diagnostico?.diaMesMaisForte?.label || "-"} | {dados?.diagnostico?.diaMesMaisForte?.totalOrdens || 0} OS
                  </p>
                </div>

                <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
                  <p className="text-sm font-black text-red-700 dark:text-red-400">
                    Dia mais fraco do período
                  </p>
                  <p className="mt-1 text-sm font-semibold text-red-900">
                    {dados?.diagnostico?.diaMesMaisFraco?.label || "-"} | {dados?.diagnostico?.diaMesMaisFraco?.totalOrdens || 0} OS
                  </p>
                </div>
              </div>
            </section>
          </section>
        )}

        {!carregando && diasPeriodo.length > 0 && (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Calendário</p>

              <h2 className="text-2xl font-black tracking-tight">
                OS por dia do período
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Lista apenas dias de funcionamento configurados.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {diasPeriodo.map((dia) => (
                <BarraMovimentoOS
                  key={dia.data}
                  label={dia.label}
                  valor={numeroSeguro(dia.totalOrdens)}
                  maximo={maxPeriodo}
                  detalhe={`${dia.ordensEntregues} entregue(s) | ${dia.ordensAbertas} aberta(s)`}
                  destaque={
                    dados?.diagnostico?.diaMesMaisForte?.data === dia.data
                  }
                />
              ))}
            </div>
          </section>
        )}

        {carregando ? (
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Carregando relatório...
          </div>
        ) : (
          <>
            <section className="grid gap-5 xl:grid-cols-3">
              {/* Top 5 Modelos Mais Consertados */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-600">Modelos</p>

                  <h2 className="text-2xl font-black tracking-tight">
                    Top 5 Modelos mais consertados
                  </h2>
                </div>

                {modelos.slice(0, 5).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                    Nenhum dado encontrado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {modelos.slice(0, 5).map((item, index) => {
                      const nome =
                        item.nome ||
                        item.name ||
                        item.modelo ||
                        "-";

                      return (
                        <LinhaRanking
                          key={`${nome}-${index}`}
                          titulo={`${index + 1}. ${nome}`}
                          subtitulo="Quantidade de OS"
                          total={`${totalModelo(item)} OS`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top 5 Equipamentos Mais Consertados */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-600">
                    Equipamentos
                  </p>

                  <h2 className="text-2xl font-black tracking-tight">
                    Top 5 Equipamentos mais consertados
                  </h2>
                </div>

                {equipamentos.slice(0, 5).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                    Nenhum dado encontrado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {equipamentos.slice(0, 5).map((item, index) => {
                      const nome =
                        item.nome ||
                        item.name ||
                        nomesEquipamento[item.equipmentType || ""] ||
                        item.equipmentType ||
                        "-";

                      return (
                        <LinhaRanking
                          key={`${nome}-${index}`}
                          titulo={`${index + 1}. ${nome}`}
                          subtitulo="Quantidade de OS"
                          total={`${totalEquipamento(item)} OS`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top 5 Clientes que Mais Consertam */}
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-600">Clientes</p>

                  <h2 className="text-2xl font-black tracking-tight">
                    Top 5 Clientes que mais consertam
                  </h2>
                </div>

                {clientes.slice(0, 5).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                    Nenhum dado encontrado.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clientes.slice(0, 5).map((cliente, index) => {
                      const total = numeroSeguro(
                        cliente.totalOrdens ??
                          cliente.total ??
                          cliente.quantidade ??
                          0
                      );

                      return (
                        <LinhaRanking
                          key={`${cliente.customerId || cliente.id || index}`}
                          titulo={`${index + 1}. ${cliente.name || "Cliente não encontrado"}`}
                          subtitulo={cliente.whatsapp || "-"}
                          total={`${total} OS`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-600">Ordens</p>

                  <h2 className="text-2xl font-black tracking-tight">
                    Ordens do período
                  </h2>

                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {ordens.length} ordem(ns) encontrada(s).
                  </p>
                </div>

                {podeAcessarRelatorios && (
                  <button
                    type="button"
                    onClick={() => exportarPDF("geral")}
                    className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    Gerar PDF
                  </button>
                )}
              </div>

              {ordens.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                  Nenhuma ordem encontrada no período.
                </div>
              ) : (
                <div className="space-y-3">
                  {ordens.map((ordem) => {
                    const cliente = ordem.customer || null;
                    const nomeCliente =
                      cliente?.name || ordem.customerName || "-";
                    const whatsappCliente =
                      cliente?.whatsapp || ordem.customerWhatsapp || "-";

                    return (
                      <article
                        key={ordem.id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                      >
                        <div
                          className={`grid gap-4 ${
                            valoresOperacionaisLiberados
                              ? "xl:grid-cols-[110px_1fr_1fr_150px_130px_auto]"
                              : "xl:grid-cols-[110px_1fr_1fr_150px_auto]"
                          } xl:items-center`}
                        >
                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                              OS
                            </p>

                            <p className="mt-1 text-xl font-black text-blue-700 dark:text-blue-400">
                              Nº {formatarNumeroOS(ordem.osNumber)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                              Cliente
                            </p>

                            <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                              {nomeCliente}
                            </p>

                            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                              {whatsappCliente || "-"}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                              Equipamento
                            </p>

                            <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">
                              {nomeEquipamento(ordem)}
                            </p>

                            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                              {[ordem.brand, ordem.model]
                                .filter(Boolean)
                                .join(" ") || "-"}
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

                          {valoresOperacionaisLiberados && (
                            <CampoResumo titulo="Total">
                              {formatarMoeda(ordem.totalAmount)}
                            </CampoResumo>
                          )}

                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            {podeVerOrdens ? (
                              <Link
                                href={`/ordens/${ordem.id}`}
                                className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white hover:bg-blue-700"
                              >
                                Abrir
                              </Link>
                            ) : (
                              <span className="text-xs font-bold text-slate-400">
                                Sem acesso
                              </span>
                            )}
                          </div>
                        </div>

                        {valoresOperacionaisLiberados && (
                          <div
                            className={`mt-4 grid gap-3 ${
                              financeiroSensivelLiberado
                                ? "md:grid-cols-2 xl:grid-cols-4"
                                : "md:grid-cols-2"
                            }`}
                          >
                            <CampoResumo titulo="Total bruto">
                              {formatarMoeda(
                                ordem.grossAmount ?? ordem.totalAmount
                              )}
                            </CampoResumo>

                            <CampoResumo titulo="Total líquido">
                              {formatarMoeda(ordem.netAmount ?? ordem.totalAmount)}
                            </CampoResumo>

                            {financeiroSensivelLiberado && (
                              <>
                                <CampoResumo titulo="Custo das peças">
                                  {ordem.costTracked === false
                                    ? "Não rastreado"
                                    : formatarMoeda(ordem.technicalPartsCost)}
                                </CampoResumo>

                                <CampoResumo titulo="Lucro bruto">
                                  {ordem.costTracked === false ||
                                  ordem.grossProfit === null ||
                                  ordem.grossProfit === undefined
                                    ? "Não calculado"
                                    : formatarMoeda(ordem.grossProfit)}
                                </CampoResumo>

                              </>
                            )}
                          </div>
                        )}

                        <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Entrada: {formatarData(ordem.openedAt)}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        </div>

        {(abaAtiva === "tecnicos" || ehApenasTecnico) && (podeVerFinanceiroSensivel || ehApenasTecnico) && (
          <section className="space-y-5">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-blue-600">
                    {ehApenasTecnico ? "Minhas Comissões" : "Financeiro por técnico"}
                  </p>
                  <h2 className="text-2xl font-black tracking-tight">
                    {ehApenasTecnico ? "Minha Comissão de Técnico" : "Lucro por Técnico"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                    {ehApenasTecnico
                      ? "Consulte as suas ordens de serviço finalizadas e a comissão calculada."
                      : "Consulte todos os técnicos ou selecione um técnico individual. Os valores usam o percentual congelado em cada OS ao marcar como Pronto."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_auto]">
                  <div>
                    <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                      {ehApenasTecnico ? "Técnico (Você)" : "Técnico"}
                    </label>
                    {ehApenasTecnico ? (
                      <input
                        type="text"
                        disabled
                        value={usuario?.name || "Meu Usuário"}
                        className={inputClass}
                      />
                    ) : (
                      <select
                        value={tecnicoSelecionado}
                        onChange={(event) => setTecnicoSelecionado(event.target.value)}
                        className={inputClass}
                      >
                        <option value="TODOS">Todos os técnicos</option>
                        {tecnicosFinanceiros.map((tecnico) => (
                          <option
                            key={tecnico.technicianKey}
                            value={tecnico.technicianKey}
                          >
                            {tecnico.technicianName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => exportarPDF("tecnicos")}
                    disabled={
                      carregando ||
                      (ehApenasTecnico
                        ? ordensTecnico.length === 0
                        : (tecnicoSelecionado !== "TODOS" &&
                          tecnicosExibidos.length === 0))
                    }
                    className="self-end rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Exportar PDF
                  </button>
                </div>
              </div>
            </section>

            {!financeiroSensivelLiberado && !ehApenasTecnico ? (
              <section className="rounded-3xl bg-red-50 p-6 text-sm font-bold text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
                Os dados de lucro por técnico não foram liberados pelo servidor.
              </section>
            ) : carregando ? (
              <section className="rounded-3xl bg-white dark:bg-slate-900 p-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                Carregando relatório por técnico...
              </section>
            ) : tecnicosFinanceiros.length === 0 ? (
              <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                Nenhuma OS com snapshot de participação por técnico foi encontrada neste período.
              </section>
            ) : (
              <>
                {ehApenasTecnico ? (
                  <section className="grid gap-4 md:grid-cols-2">
                    <CardResumo
                      titulo="Minhas Ordens de Serviço (OS)"
                      valor={resumoTecnico.totalOrders}
                      detalhe="Total de OS concluídas sob sua responsabilidade."
                      destaque="blue"
                    />

                    <CardResumo
                      titulo="Sua Comissão Total"
                      valor={formatarMoeda(resumoTecnico.technicianProfitShare)}
                      detalhe="Sua participação calculada sobre o lucro das OS."
                      destaque="green"
                    />
                  </section>
                ) : (
                  <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <CardResumo
                      titulo={
                        tecnicoSelecionado === "TODOS"
                          ? "OS dos técnicos"
                          : `OS de ${tecnicoSelecionadoNome}`
                      }
                      valor={resumoTecnico.totalOrders}
                      detalhe={
                        resumoTecnico.untrackedOrders > 0
                          ? `${resumoTecnico.untrackedOrders} OS sem divisão financeira calculável.`
                          : "OS com snapshot de participação."
                      }
                    />

                    <CardResumo
                      titulo="Lucro gerado"
                      valor={formatarMoeda(resumoTecnico.grossProfitGenerated)}
                      detalhe="Lucro bruto das OS com custo rastreado."
                      destaque="green"
                    />

                    <CardResumo
                      titulo={
                        tecnicoSelecionado === "TODOS"
                          ? "Participação dos técnicos"
                          : "Participação do técnico"
                      }
                      valor={formatarMoeda(resumoTecnico.technicianProfitShare)}
                      detalhe="Calculada sobre o lucro positivo de cada OS."
                      destaque="blue"
                    />

                    <CardResumo
                      titulo="Lucro da loja"
                      valor={formatarMoeda(resumoTecnico.storeProfit)}
                      detalhe="Lucro das OS menos a participação do técnico."
                      destaque={
                        resumoTecnico.storeProfit < 0 ? "red" : "green"
                      }
                    />
                  </section>
                )}

                {!ehApenasTecnico && tecnicoSelecionado === "TODOS" && (
                  <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                    <div className="mb-5">
                      <p className="text-sm font-bold text-blue-600">
                        Todos os técnicos
                      </p>
                      <h3 className="text-2xl font-black tracking-tight">
                        Resumo individual
                      </h3>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      {tecnicosFinanceiros.map((tecnico) => (
                        <button
                          key={tecnico.technicianKey}
                          type="button"
                          onClick={() =>
                            setTecnicoSelecionado(tecnico.technicianKey)
                          }
                          className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-left ring-1 ring-slate-100 transition hover:bg-blue-50 hover:ring-blue-200"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-black text-slate-950 dark:text-slate-100">
                                {tecnico.technicianName}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {tecnico.totalOrders} OS
                              </p>
                            </div>
                            <strong className="text-lg text-blue-700 dark:text-blue-400">
                              {formatarMoeda(tecnico.technicianProfitShare)}
                            </strong>
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <CampoResumo titulo="Lucro gerado">
                              {formatarMoeda(tecnico.grossProfitGenerated)}
                            </CampoResumo>
                            <CampoResumo titulo="Participação">
                              {formatarMoeda(tecnico.technicianProfitShare)}
                            </CampoResumo>
                            <CampoResumo titulo="Loja">
                              {formatarMoeda(tecnico.storeProfit)}
                            </CampoResumo>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="mb-5">
                    <p className="text-sm font-bold text-blue-600">
                      Detalhamento
                    </p>
                    <h3 className="text-2xl font-black tracking-tight">
                      {tecnicoSelecionadoNome}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {ordensTecnico.length} OS com técnico registrado no período.
                    </p>
                  </div>

                  {ordensTecnico.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                      Nenhuma OS encontrada para esta seleção.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ordensTecnico.map((ordem) => (
                        <article
                          key={ordem.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                                OS Nº {formatarNumeroOS(ordem.osNumber)}
                              </p>
                              <p className="mt-1 text-base font-black text-slate-950 dark:text-slate-100">
                                {ordem.technicianResponsible || "Técnico não rastreado"}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                Entrada: {formatarData(ordem.openedAt)}
                              </p>
                            </div>

                            {ehApenasTecnico ? (
                              <div className="grid gap-2 sm:grid-cols-3">
                                <CampoResumo titulo="Aparelho">
                                  {nomeEquipamento(ordem)} - {[ordem.brand, ordem.model].filter(Boolean).join(" ")}
                                </CampoResumo>

                                <CampoResumo titulo="% da OS">
                                  {ordem.profitShareTracked === false
                                    ? "Não rastreado"
                                    : `${numeroSeguro(
                                        ordem.technicianProfitPercent
                                      ).toLocaleString("pt-BR", {
                                        maximumFractionDigits: 2,
                                      })}%`}
                                </CampoResumo>

                                <CampoResumo titulo="Sua Comissão">
                                  <span className="text-blue-600 dark:text-blue-400 font-black">
                                    {ordem.profitShareTracked === false ||
                                    ordem.technicianProfitShare === null ||
                                    ordem.technicianProfitShare === undefined
                                      ? "Não calculado"
                                      : formatarMoeda(ordem.technicianProfitShare)}
                                  </span>
                                </CampoResumo>
                              </div>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                <CampoResumo titulo="Lucro da OS">
                                  {ordem.costTracked === false ||
                                  ordem.grossProfit === null ||
                                  ordem.grossProfit === undefined
                                    ? "Não calculado"
                                    : formatarMoeda(ordem.grossProfit)}
                                </CampoResumo>

                                <CampoResumo titulo="% da OS">
                                  {ordem.profitShareTracked === false
                                    ? "Não rastreado"
                                    : `${numeroSeguro(
                                        ordem.technicianProfitPercent
                                      ).toLocaleString("pt-BR", {
                                        maximumFractionDigits: 2,
                                      })}%`}
                                </CampoResumo>

                                <CampoResumo titulo="Participação">
                                  {ordem.profitShareTracked === false ||
                                  ordem.technicianProfitShare === null ||
                                  ordem.technicianProfitShare === undefined
                                    ? "Não calculado"
                                    : formatarMoeda(ordem.technicianProfitShare)}
                                </CampoResumo>

                                <CampoResumo titulo="Loja">
                                  {ordem.profitShareTracked === false ||
                                  ordem.storeProfit === null ||
                                  ordem.storeProfit === undefined
                                    ? "Não calculado"
                                    : formatarMoeda(ordem.storeProfit)}
                                </CampoResumo>
                              </div>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
