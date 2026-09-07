"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import {
  ModuloProdutosDesativado,
  useModuloProdutosAtivo,
} from "../ModuloProdutosGuard";
import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda } from "@/lib/formatadores";
import { inputClass } from "@/lib/uiConstantes";

type Resumo = {
  vendas: number;
  itensVendidos: number;
  totalVendido: number;
  valorEstoqueVenda?: number | null;
  valorEstoqueCusto?: number | null;
  custoTotal: number | null;
  impostoTotal: number | null;
  lucroTotal: number | null;
  totalComissaoAtendentes?: number | null;
  ticketMedio: number;
  margemMedia: number | null;
};

type Periodo = {
  dataInicio: string;
  dataFim: string;
};

type DiaSemana = {
  diaSemana: number;
  label: string;
  vendas: number;
  itensVendidos: number;
  totalVendido: number;
  custoTotal: number | null;
  impostoTotal: number | null;
  lucroTotal: number | null;
};

type DiaPeriodo = {
  data: string;
  label: string;
  vendas: number;
  itensVendidos: number;
  totalVendido: number;
  custoTotal: number | null;
  impostoTotal: number | null;
  lucroTotal: number | null;
};

type ProdutoRanking = {
  productId: string;
  productName: string;
  category?: string | null;
  quantity?: number;
  totalVendido?: number;
  custoTotal?: number | null;
  impostoTotal?: number | null;
  lucroTotal?: number | null;
  salePrice?: number;
};

type AtendenteRanking = {
  id: string;
  name: string;
  username: string;
  percentualComissao?: number;
  vendas: number;
  itensVendidos: number;
  totalVendido: number;
  lucroTotal: number | null;
  comissaoTotal: number;
  lucroLiquidoLoja?: number | null;
};

type VendaAtendenteItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
};

type VendaAtendente = {
  id: string;
  saleNumber: number;
  soldAt: string;
  customerName?: string | null;
  paymentMethod: string;
  attendantId: string;
  attendantName: string;
  attendantUsername: string;
  totalAmount: number;
  profitAmount?: number | null;
  attendantProfitPercentSnapshot?: number | null;
  attendantProfitShare: number;
  storeProfit?: number | null;
  items: VendaAtendenteItem[];
};

type RelatorioResponse = {
  message?: string;
  financeiroSensivelLiberado?: boolean;
  ehApenasAtendente?: boolean;
  funcionamento?: {
    diasAbertos?: number[];
    labels?: string[];
    abertura?: string;
    fechamento?: string;
  };
  periodo?: Periodo;
  resumo?: Resumo;
  diagnostico?: {
    diaSemanaMaisForte?: DiaSemana | null;
    diaSemanaMaisFraco?: DiaSemana | null;
    diaMesMaisForte?: DiaPeriodo | null;
    diaMesMaisFraco?: DiaPeriodo | null;
  };
  diasSemana?: DiaSemana[];
  diasPeriodo?: DiaPeriodo[];
  rankings?: {
    maisVendidos?: ProdutoRanking[];
    menosVendidos?: ProdutoRanking[];
    maiorLucro?: ProdutoRanking[];
    menorLucro?: ProdutoRanking[];
    produtosSemVenda?: ProdutoRanking[];
    atendentes?: AtendenteRanking[];
  };
  vendasAtendentes?: VendaAtendente[];
};

function hojeInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function primeiroDiaMesInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");

  return `${ano}-${mes}-01`;
}

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatarPercentual(valor: unknown) {
  return `${numero(valor).toFixed(1)}%`;
}

function formatarDataHora(dataIso?: string | null) {
  if (!dataIso) return "-";
  try {
    const d = new Date(dataIso);
    return isNaN(d.getTime())
      ? "-"
      : d.toLocaleDateString("pt-BR") +
          " às " +
          d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
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
  destaque?: "blue" | "green" | "red" | "orange" | "slate";
}) {
  const cor =
    destaque === "blue"
      ? "text-blue-700 dark:text-blue-400"
      : destaque === "green"
        ? "text-green-700 dark:text-green-400"
        : destaque === "red"
          ? "text-red-700 dark:text-red-400"
          : destaque === "orange"
            ? "text-orange-600"
            : "text-slate-950 dark:text-slate-100";

  const valorTexto =
    typeof valor === "string" || typeof valor === "number" ? String(valor) : "";

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong
        className={`mt-2 block break-words leading-tight ${cor} ${
          valorTexto.length > 9 ? "text-2xl" : "text-4xl"
        }`}
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

function CampoResumo({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100 dark:ring-slate-800">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {titulo}
      </p>

      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
        {children}
      </div>
    </div>
  );
}

function BarraMovimento({
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
        destaque
          ? "bg-blue-50 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30"
          : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100 dark:ring-slate-800"
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
          {formatarMoeda(valor)}
        </strong>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
        <div
          className={`h-full rounded-full ${
            destaque ? "bg-blue-600" : "bg-slate-400"
          }`}
          style={{
            width: `${largura}%`,
          }}
        />
      </div>
    </div>
  );
}

function RankingCard({
  titulo,
  produtos,
  vazio,
  tipo = "quantidade",
  mostrarFinanceiroSensivel = false,
}: {
  titulo: string;
  produtos: ProdutoRanking[];
  vazio: string;
  tipo?: "quantidade" | "lucro" | "semVenda";
  mostrarFinanceiroSensivel?: boolean;
}) {
  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <h2 className="text-xl font-black tracking-tight">{titulo}</h2>

      {produtos.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-bold text-slate-500 dark:text-slate-400">
          {vazio}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {produtos.map((produto, index) => (
            <div
              key={produto.productId}
              className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100 dark:ring-slate-800"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                  {index + 1}. {produto.productName}
                </p>

                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {produto.category || "Sem categoria"}
                </p>
              </div>

              <div className="shrink-0 text-right">
                {tipo === "quantidade" && (
                  <>
                    <strong className="block text-sm font-black text-blue-700 dark:text-blue-400">
                      {numero(produto.quantity)} unid.
                    </strong>

                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {formatarMoeda(produto.totalVendido || 0)}
                    </span>
                  </>
                )}

                {tipo === "lucro" && mostrarFinanceiroSensivel && (
                  <>
                    <strong className="block text-sm font-black text-green-700 dark:text-green-400">
                      {formatarMoeda(produto.lucroTotal || 0)}
                    </strong>

                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Vendido: {formatarMoeda(produto.totalVendido || 0)}
                    </span>
                  </>
                )}

                {tipo === "semVenda" && (
                  <strong className="block text-sm font-black text-slate-700 dark:text-slate-200">
                    {formatarMoeda(produto.salePrice || 0)}
                  </strong>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function RelatoriosProdutosPage() {
  const { usuario, carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();
  const { carregandoModuloProdutos, moduloProdutosAtivo } = useModuloProdutosAtivo();

  const ehAtendente = usuario?.role === "ATENDENTE";
  const podeVerFinanceiroSensivel =
    !carregandoPermissoes && (usuario?.role === "ADMIN" || tem("relatorios.financeiro"));
  const ehApenasAtendente = ehAtendente && !podeVerFinanceiroSensivel;

  const podeAcessar =
    !carregandoPermissoes &&
    (tem(["relatorios.ver", "relatorios.financeiro"]) || ehAtendente);

  const [dataInicio, setDataInicio] = useState(primeiroDiaMesInput());
  const [dataFim, setDataFim] = useState(hojeInput());

  const [relatorio, setRelatorio] = useState<RelatorioResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const [abaAtiva, setAbaAtiva] = useState<"geral" | "atendentes">("geral");
  const [atendenteSelecionado, setAtendenteSelecionado] = useState("TODOS");

  // Se o usuário for apenas atendente, fixa na aba de comissões e no próprio usuário
  useEffect(() => {
    if (ehApenasAtendente) {
      setAbaAtiva("atendentes");
      if (usuario?.id) {
        setAtendenteSelecionado(usuario.id);
      }
    }
  }, [ehApenasAtendente, usuario?.id]);

  const resumo = relatorio?.resumo;
  const diasSemana = relatorio?.diasSemana || [];
  const diasPeriodo = relatorio?.diasPeriodo || [];
  const rankings = relatorio?.rankings || {};

  const atendentesFinanceiros = relatorio?.rankings?.atendentes || [];
  const atendenteSelecionadoNome = useMemo(() => {
    if (atendenteSelecionado === "TODOS") return "Todos os atendentes";
    const att = atendentesFinanceiros.find((a) => a.id === atendenteSelecionado);
    return att ? att.name : "Atendente selecionado";
  }, [atendenteSelecionado, atendentesFinanceiros]);

  const atendentesExibidos = useMemo(
    () =>
      ehApenasAtendente
        ? atendentesFinanceiros
        : atendenteSelecionado === "TODOS"
        ? atendentesFinanceiros
        : atendentesFinanceiros.filter((a) => a.id === atendenteSelecionado),
    [atendenteSelecionado, atendentesFinanceiros, ehApenasAtendente]
  );

  const vendasAtendentes = relatorio?.vendasAtendentes || [];
  const vendasFiltradas = useMemo(
    () =>
      ehApenasAtendente
        ? vendasAtendentes
        : vendasAtendentes.filter(
            (v) =>
              atendenteSelecionado === "TODOS" ||
              v.attendantId === atendenteSelecionado
          ),
    [vendasAtendentes, atendenteSelecionado, ehApenasAtendente]
  );

  const resumoAtendente = useMemo(
    () =>
      atendentesExibidos.reduce(
        (acc, item) => ({
          vendas: acc.vendas + numero(item.vendas),
          itensVendidos: acc.itensVendidos + numero(item.itensVendidos),
          totalVendido: acc.totalVendido + numero(item.totalVendido),
          comissaoTotal: acc.comissaoTotal + numero(item.comissaoTotal),
          lucroTotal: acc.lucroTotal + numero(item.lucroTotal),
          lucroLiquidoLoja:
            acc.lucroLiquidoLoja + numero(item.lucroLiquidoLoja),
        }),
        {
          vendas: 0,
          itensVendidos: 0,
          totalVendido: 0,
          comissaoTotal: 0,
          lucroTotal: 0,
          lucroLiquidoLoja: 0,
        }
      ),
    [atendentesExibidos]
  );

  const textoFuncionamento = relatorio?.funcionamento
    ? `${(relatorio.funcionamento.labels || []).join(", ")} | ${
        relatorio.funcionamento.abertura || "08:00"
      } às ${relatorio.funcionamento.fechamento || "18:00"}`
    : "";

  const maxSemana = Math.max(
    0,
    ...diasSemana.map((dia) => numero(dia.totalVendido))
  );

  const maxPeriodo = Math.max(
    0,
    ...diasPeriodo.map((dia) => numero(dia.totalVendido))
  );

  async function carregarRelatorio(
    inicioBusca = dataInicio,
    fimBusca = dataFim
  ) {
    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();
      params.set("dataInicio", inicioBusca);
      params.set("dataFim", fimBusca);

      const response = await fetch(
        `/api/produtos/relatorios?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const data = (await response.json().catch(() => null)) as
        | RelatorioResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar relatório.");
        setRelatorio(null);
        return;
      }

      setRelatorio(data);
    } catch {
      setMensagem("Erro ao carregar relatório.");
      setRelatorio(null);
    } finally {
      setCarregando(false);
    }
  }

  function aplicarMesAtual() {
    const inicio = primeiroDiaMesInput();
    const fim = hojeInput();

    setDataInicio(inicio);
    setDataFim(fim);

    carregarRelatorio(inicio, fim);
  }

  function exportarPDF(modo = "atendentes") {
    const params = new URLSearchParams();
    params.set("inicio", dataInicio);
    params.set("fim", dataFim);
    params.set("modo", modo);
    params.set("atendente", atendenteSelecionado);

    window.open(`/api/produtos/relatorios/pdf?${params.toString()}`, "_blank");
  }

  useEffect(() => {
    if (carregandoPermissoes || carregandoModuloProdutos) return;

    if (podeAcessar && moduloProdutosAtivo) {
      carregarRelatorio();
    } else {
      setCarregando(false);
    }
  }, [
    carregandoPermissoes,
    carregandoModuloProdutos,
    podeAcessar,
    moduloProdutosAtivo,
  ]);

  if (carregandoPermissoes || carregandoModuloProdutos || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando relatório de produtos...
        </section>
      </main>
    );
  }

  if (!moduloProdutosAtivo) {
    return (
      <ModuloProdutosDesativado
        titulo="Relatórios de produtos desativados"
        descricao="O módulo de produtos, vendas e relatórios de produtos está desativado nas configurações do sistema."
      />
    );
  }

  if (!podeAcessar) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar relatórios de produtos.
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Produtos e estoque
              </p>

              <h1 className="text-3xl font-black tracking-tight">
                {ehApenasAtendente ? "Minhas Comissões (PDV)" : "Relatórios de produtos"}
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                {ehApenasAtendente
                  ? "Consulte suas vendas realizadas, itens vendidos e sua comissão ganha no período."
                  : "Analise vendas de produtos por período, comissões de atendentes, produtos fortes, estoque e lucro estimado."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/produtos"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar para produtos
              </Link>

              <Link
                href="/"
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
              >
                Painel inicial
              </Link>
            </div>
          </div>
        </header>

        {/* Abas Superiores */}
        <nav className="flex flex-wrap gap-2 rounded-3xl bg-white dark:bg-slate-900 p-2 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          {!ehApenasAtendente && (
            <button
              type="button"
              onClick={() => {
                setAbaAtiva("geral");
                setMensagem("");
              }}
              className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
                abaAtiva === "geral"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50"
              }`}
            >
              Visão Geral
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setAbaAtiva("atendentes");
              setMensagem("");
            }}
            className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
              abaAtiva === "atendentes"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50"
            }`}
          >
            {ehApenasAtendente ? "Minha Comissão" : "Lucro por Atendente"}
          </button>
        </nav>

        <CardMensagem mensagem={mensagem} />

        {/* Filtro de Período Comum */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Filtro</p>
            <h2 className="text-2xl font-black tracking-tight">
              Período do relatório
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data inicial
              </label>

              <input
                type="date"
                value={dataInicio}
                disabled={carregando}
                onChange={(event) => setDataInicio(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data final
              </label>

              <input
                type="date"
                value={dataFim}
                disabled={carregando}
                onChange={(event) => setDataFim(event.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={() => carregarRelatorio(dataInicio, dataFim)}
              disabled={carregando}
              className="self-end rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Gerar relatório
            </button>

            <button
              type="button"
              onClick={aplicarMesAtual}
              disabled={carregando}
              className="self-end rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Mês atual
            </button>
          </div>
        </section>

        {/* ABA: VISÃO GERAL (Apenas Admin / Gestores com permissão financeira) */}
        <div className={abaAtiva === "geral" && !ehApenasAtendente ? "contents" : "hidden"}>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CardResumo
              titulo="Total vendido"
              valor={formatarMoeda(resumo?.totalVendido || 0)}
              detalhe="Produtos vendidos no período"
              destaque="green"
            />

            <CardResumo
              titulo="Vendas"
              valor={resumo?.vendas || 0}
              detalhe="Cupons/vendas finalizadas"
              destaque="blue"
            />

            <CardResumo
              titulo="Itens vendidos"
              valor={resumo?.itensVendidos || 0}
              detalhe="Quantidade de produtos"
              destaque="blue"
            />

            <CardResumo
              titulo="Estoque a preço de venda"
              valor={formatarMoeda(resumo?.valorEstoqueVenda || 0)}
              detalhe="Produtos com quantidade física"
              destaque="blue"
            />

            {relatorio?.financeiroSensivelLiberado && (
              <>
                <CardResumo
                  titulo="Lucro estimado"
                  valor={formatarMoeda(resumo?.lucroTotal || 0)}
                  detalhe="Venda - custo - imposto"
                  destaque="green"
                />

                <CardResumo
                  titulo="Custo total"
                  valor={formatarMoeda(resumo?.custoTotal || 0)}
                  detalhe="Custo dos produtos vendidos"
                />

                <CardResumo
                  titulo="Imposto"
                  valor={formatarMoeda(resumo?.impostoTotal || 0)}
                  detalhe="Estimativa cadastrada"
                  destaque="orange"
                />

                <CardResumo
                  titulo="Comissão atendentes"
                  valor={formatarMoeda(resumo?.totalComissaoAtendentes || 0)}
                  detalhe="Participação no lucro (PDV)"
                  destaque="orange"
                />
              </>
            )}

            <CardResumo
              titulo="Ticket médio"
              valor={formatarMoeda(resumo?.ticketMedio || 0)}
              detalhe="Média por venda finalizada"
            />

            {relatorio?.financeiroSensivelLiberado && (
              <>
                <CardResumo
                  titulo="Margem média"
                  valor={formatarPercentual(resumo?.margemMedia || 0)}
                  detalhe="Lucro sobre total vendido"
                  destaque="green"
                />

                <CardResumo
                  titulo="Estoque a preço de custo"
                  valor={formatarMoeda(resumo?.valorEstoqueCusto || 0)}
                  detalhe="Base de custo cadastrada"
                />
              </>
            )}
          </section>

          {/* Dias da semana e diagnóstico */}
          {!carregando && (diasSemana.length > 0 || diasPeriodo.length > 0) && (
            <section className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                <div className="mb-5">
                  <p className="text-sm font-bold text-blue-600">Funcionamento</p>
                  <h2 className="text-2xl font-black tracking-tight">
                    Vendas por dia da semana
                  </h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                    Dias fechados não entram no cálculo de dia fraco.
                    {textoFuncionamento ? ` Considerado: ${textoFuncionamento}.` : ""}
                  </p>
                </div>

                <div className="space-y-3">
                  {diasSemana.map((dia) => (
                    <BarraMovimento
                      key={dia.diaSemana}
                      label={dia.label}
                      valor={dia.totalVendido}
                      maximo={maxSemana}
                      detalhe={`${dia.vendas} venda(s) | ${dia.itensVendidos} item(ns)`}
                      destaque={
                        relatorio?.diagnostico?.diaSemanaMaisForte?.diaSemana ===
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
                    <p className="mt-1 text-sm font-semibold text-green-900 dark:text-green-200">
                      {relatorio?.diagnostico?.diaSemanaMaisForte?.label || "-"} |{" "}
                      {formatarMoeda(
                        relatorio?.diagnostico?.diaSemanaMaisForte?.totalVendido || 0
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-orange-50 p-4 ring-1 ring-orange-200 dark:bg-orange-900/20 dark:ring-orange-500/30">
                    <p className="text-sm font-black text-orange-700 dark:text-orange-400">
                      Dia da semana mais fraco
                    </p>
                    <p className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-200">
                      {relatorio?.diagnostico?.diaSemanaMaisFraco?.label || "-"} |{" "}
                      {formatarMoeda(
                        relatorio?.diagnostico?.diaSemanaMaisFraco?.totalVendido || 0
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                    <p className="text-sm font-black text-blue-700 dark:text-blue-400">
                      Melhor dia do período
                    </p>
                    <p className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-200">
                      {relatorio?.diagnostico?.diaMesMaisForte?.label || "-"} |{" "}
                      {formatarMoeda(
                        relatorio?.diagnostico?.diaMesMaisForte?.totalVendido || 0
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
                    <p className="text-sm font-black text-red-700 dark:text-red-400">
                      Dia mais fraco do período
                    </p>
                    <p className="mt-1 text-sm font-semibold text-red-900 dark:text-red-200">
                      {relatorio?.diagnostico?.diaMesMaisFraco?.label || "-"} |{" "}
                      {formatarMoeda(
                        relatorio?.diagnostico?.diaMesMaisFraco?.totalVendido || 0
                      )}
                    </p>
                  </div>
                </div>
              </section>
            </section>
          )}

          {/* Calendário */}
          {!carregando && diasPeriodo.length > 0 && (
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="mb-5">
                <p className="text-sm font-bold text-blue-600">Calendário</p>
                <h2 className="text-2xl font-black tracking-tight">
                  Vendas por dia do período
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Lista apenas dias de funcionamento configurados.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {diasPeriodo.map((dia) => (
                  <BarraMovimento
                    key={dia.data}
                    label={dia.label}
                    valor={dia.totalVendido}
                    maximo={maxPeriodo}
                    detalhe={`${dia.vendas} venda(s) | ${dia.itensVendidos} item(ns)`}
                    destaque={
                      relatorio?.diagnostico?.diaMesMaisForte?.data === dia.data
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Rankings de Produtos */}
          <div className="grid gap-6 xl:grid-cols-2">
            <RankingCard
              titulo="Produtos mais vendidos"
              produtos={rankings.maisVendidos || []}
              vazio="Nenhum produto vendido no período."
              tipo="quantidade"
            />

            <RankingCard
              titulo="Produtos menos vendidos"
              produtos={rankings.menosVendidos || []}
              vazio="Nenhum produto vendido no período."
              tipo="quantidade"
            />

            {relatorio?.financeiroSensivelLiberado && (
              <>
                <RankingCard
                  titulo="Produtos com maior lucro"
                  produtos={rankings.maiorLucro || []}
                  vazio="Nenhum dado de lucro disponível."
                  tipo="lucro"
                  mostrarFinanceiroSensivel
                />

                <RankingCard
                  titulo="Produtos com menor lucro"
                  produtos={rankings.menorLucro || []}
                  vazio="Nenhum dado de lucro disponível."
                  tipo="lucro"
                  mostrarFinanceiroSensivel
                />
              </>
            )}
          </div>

          <RankingCard
            titulo="Produtos ativos sem venda no período"
            produtos={rankings.produtosSemVenda || []}
            vazio="Todos os produtos ativos tiveram vendas no período."
            tipo="semVenda"
          />
        </div>

        {/* ABA: LUCRO POR ATENDENTE / MINHA COMISSÃO */}
        <div className={abaAtiva === "atendentes" || ehApenasAtendente ? "contents" : "hidden"}>
          {/* Barra de Filtro do Atendente e Exportação */}
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-[260px] flex-1">
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  {ehApenasAtendente ? "Atendente (Você)" : "Selecionar atendente"}
                </label>

                {ehApenasAtendente ? (
                  <input
                    type="text"
                    disabled
                    value={usuario?.name || "Meu Usuário"}
                    className={inputClass}
                  />
                ) : (
                  <select
                    value={atendenteSelecionado}
                    onChange={(event) => setAtendenteSelecionado(event.target.value)}
                    className={inputClass}
                  >
                    <option value="TODOS">Todos os atendentes</option>
                    {atendentesFinanceiros.map((att) => (
                      <option key={att.id} value={att.id}>
                        {att.name} ({att.percentualComissao || 0}%)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => exportarPDF("atendentes")}
                  disabled={carregando || vendasFiltradas.length === 0}
                  className="self-end rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 transition"
                >
                  Exportar PDF
                </button>
              </div>
            </div>
          </section>

          {/* Cards de Métricas */}
          {ehApenasAtendente ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CardResumo
                titulo="Minhas vendas"
                valor={resumoAtendente.vendas}
                detalhe="Vendas finalizadas no período"
                destaque="blue"
              />

              <CardResumo
                titulo="Itens vendidos"
                valor={resumoAtendente.itensVendidos}
                detalhe="Quantidade de produtos"
                destaque="blue"
              />

              <CardResumo
                titulo="Total vendido"
                valor={formatarMoeda(resumoAtendente.totalVendido)}
                detalhe="Faturamento bruto das vendas"
                destaque="green"
              />

              <CardResumo
                titulo="Sua comissão"
                valor={formatarMoeda(resumoAtendente.comissaoTotal)}
                detalhe="Participação sobre o lucro no PDV"
                destaque="blue"
              />
            </section>
          ) : (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CardResumo
                titulo={
                  atendenteSelecionado === "TODOS"
                    ? "Vendas dos atendentes"
                    : `Vendas de ${atendenteSelecionadoNome}`
                }
                valor={resumoAtendente.vendas}
                detalhe={`${resumoAtendente.itensVendidos} itens vendidos`}
              />

              <CardResumo
                titulo="Total vendido"
                valor={formatarMoeda(resumoAtendente.totalVendido)}
                detalhe="Faturamento bruto no período"
                destaque="green"
              />

              <CardResumo
                titulo={
                  atendenteSelecionado === "TODOS"
                    ? "Comissão dos atendentes"
                    : "Comissão do atendente"
                }
                valor={formatarMoeda(resumoAtendente.comissaoTotal)}
                detalhe="Calculada sobre o lucro positivo no PDV"
                destaque="blue"
              />

              <CardResumo
                titulo="Lucro líquido da loja"
                valor={formatarMoeda(resumoAtendente.lucroLiquidoLoja)}
                detalhe="Lucro das vendas deduzida a comissão"
                destaque={resumoAtendente.lucroLiquidoLoja < 0 ? "red" : "green"}
              />
            </section>
          )}

          {/* Resumo Individual de Atendentes (Apenas para Admin com TODOS selecionado) */}
          {!ehApenasAtendente && atendenteSelecionado === "TODOS" && atendentesFinanceiros.length > 0 && (
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <div className="mb-5">
                <p className="text-sm font-bold text-blue-600">
                  Todos os atendentes
                </p>
                <h3 className="text-2xl font-black tracking-tight">
                  Resumo individual
                </h3>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {atendentesFinanceiros.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => setAtendenteSelecionado(att.id)}
                    className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-left ring-1 ring-slate-100 dark:ring-slate-800 transition hover:bg-blue-50 hover:ring-blue-200 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-950 dark:text-slate-100">
                          {att.name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {att.vendas} venda(s) | {att.itensVendidos} item(ns) |{" "}
                          {att.percentualComissao || 0}% de comissão
                        </p>
                      </div>

                      <strong className="text-lg text-blue-700 dark:text-blue-400">
                        {formatarMoeda(att.comissaoTotal)}
                      </strong>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <CampoResumo titulo="Total vendido">
                        {formatarMoeda(att.totalVendido)}
                      </CampoResumo>
                      <CampoResumo titulo="Comissão">
                        {formatarMoeda(att.comissaoTotal)}
                      </CampoResumo>
                      <CampoResumo titulo="Loja">
                        {formatarMoeda(att.lucroLiquidoLoja ?? 0)}
                      </CampoResumo>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Detalhamento de Vendas com Itens */}
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">Detalhamento</p>
                <h3 className="text-2xl font-black tracking-tight">
                  {atendenteSelecionadoNome}
                </h3>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {vendasFiltradas.length} venda(s) registrada(s) no período.
                </p>
              </div>

              <Link
                href="/produtos/vendas"
                className="self-start md:self-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Histórico completo de vendas →
              </Link>
            </div>

            {vendasFiltradas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-6 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhuma venda encontrada para esta seleção no período.
              </div>
            ) : (
              <div className="space-y-4">
                {vendasFiltradas.map((venda) => (
                  <article
                    key={venda.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-blue-100 dark:bg-blue-900/40 px-2.5 py-1 text-xs font-black text-blue-700 dark:text-blue-400">
                            Cupom Nº {venda.saleNumber}
                          </span>
                          <strong className="text-sm font-bold text-slate-900 dark:text-white">
                            {venda.attendantName}
                          </strong>
                          <span className="text-xs text-slate-400">
                            (@{venda.attendantUsername})
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {formatarDataHora(venda.soldAt)}
                          {venda.customerName ? ` • Cliente: ${venda.customerName}` : ""}
                          {` • Forma: ${venda.paymentMethod}`}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Total da Venda
                        </span>
                        <p className="text-lg font-black text-slate-900 dark:text-white">
                          {formatarMoeda(venda.totalAmount)}
                        </p>
                      </div>
                    </div>

                    {/* Itens da venda */}
                    {venda.items && venda.items.length > 0 && (
                      <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                          Itens da Venda ({venda.items.length})
                        </p>
                        {venda.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300"
                          >
                            <span>
                              <strong className="text-blue-600 dark:text-blue-400 mr-1.5">
                                {item.quantity}x
                              </strong>
                              {item.productName}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {formatarMoeda(item.unitPrice)} un. ={" "}
                              <strong className="text-slate-900 dark:text-slate-100">
                                {formatarMoeda(item.totalAmount)}
                              </strong>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Resumo Financeiro da Linha */}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      <CampoResumo titulo="% Comissão Aplicada">
                        {Number(venda.attendantProfitPercentSnapshot || 0).toLocaleString("pt-BR", {
                          maximumFractionDigits: 2,
                        })}% do lucro
                      </CampoResumo>

                      <CampoResumo titulo={ehApenasAtendente ? "Sua Comissão" : "Comissão do Atendente"}>
                        <span className="text-blue-600 dark:text-blue-400 font-black">
                          {formatarMoeda(venda.attendantProfitShare)}
                        </span>
                      </CampoResumo>

                      {!ehApenasAtendente && (
                        <CampoResumo titulo="Lucro da Loja">
                          <span
                            className={
                              venda.storeProfit !== null && (venda.storeProfit ?? 0) < 0
                                ? "text-red-600 font-bold"
                                : "text-emerald-700 dark:text-emerald-400 font-bold"
                            }
                          >
                            {venda.storeProfit !== null && venda.storeProfit !== undefined
                              ? formatarMoeda(venda.storeProfit)
                              : "Não calculado"}
                          </span>
                        </CampoResumo>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
