"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarData,
  formatarDataHora,
  formatarNumeroOS,
  formatarNumeroVenda,
  numeroSeguro,
  inteiro,
} from "@/lib/formatadores";
import {
  nomesStatus,
  nomesPagamento,
  classeStatus,
} from "@/lib/uiConstantes";

type ClienteDashboard = {
  name?: string | null;
  whatsapp?: string | null;
};

type OrdemDashboard = {
  id: string;
  osNumber?: number | string | null;
  customer?: ClienteDashboard | null;
  customerName?: string | null;
  customerWhatsapp?: string | null;
  equipmentType?: string | null;
  equipmentOther?: string | null;
  brand?: string | null;
  model?: string | null;
  status?: string | null;
  totalAmount?: number | string | null;
  openedAt?: string | null;
};

type ProdutoEstoqueBaixo = {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  stockQuantity?: number | string | null;
  minStock?: number | string | null;
  salePrice?: number | string | null;
};

type VendaProdutoDashboard = {
  id: string;
  saleNumber?: number | string | null;
  soldAt?: string | null;
  customerName?: string | null;
  customer?: ClienteDashboard | null;
  paymentMethod?: string | null;
  totalAmount?: number | string | null;
  userName?: string | null;
  items?: {
    productName: string;
    quantity: number | string;
    totalAmount?: number | string | null;
  }[];
};

type DashboardData = {
  osRecebidas?: number;
  osAbertas?: number;
  osConcluidas?: number;
  osEntregues?: number;
  osEmAnalise?: number;
  emAnalise?: number;
  osEmReparo?: number;
  emReparo?: number;
  aguardandoPeca?: number;
  prontas?: number;
  osProntas?: number;
  osAtrasadas?: number;
  clientes?: number;
  garantiasVencendo?: number;
  garantiasVencidas?: number;

  produtosAtivos?: number | null;
  produtosEstoqueBaixo?: number | null;
  produtosEstoqueBaixoLista?: ProdutoEstoqueBaixo[];

  vendasProdutosQuantidade?: number | null;
  itensProdutosVendidosMes?: number | null;

  totalRecebidoOSMes?: number | null;
  receitaProdutosMes?: number | null;
  lucroProdutosMes?: number | null;
  custoProdutosMes?: number | null;
  impostoProdutosMes?: number | null;

  totalRecebidoMes?: number | null;
  totalRecebidoNoMes?: number | null;
  recebidoNoMes?: number | null;
  recebidoMes?: number | null;

  ultimasOrdens?: OrdemDashboard[];
  recentOrders?: OrdemDashboard[];
  ordensRecentes?: OrdemDashboard[];
  ultimasVendasProdutos?: VendaProdutoDashboard[];
  
  productsModuleEnabled?: boolean;
  osModuleEnabled?: boolean;
  
  permissoes?: {
    productsModuleEnabled?: boolean;
    osModuleEnabled?: boolean;
  };
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

function nomeEquipamento(ordem: OrdemDashboard) {
  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }
  return nomesEquipamento[ordem.equipmentType || ""] || ordem.equipmentType || "-";
}

// ================= GLASS & UI COMPONENTS =================
function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

function CardResumo({
  titulo,
  valor,
  detalhe,
  destaque,
  href,
  icone,
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: string;
  href?: string;
  icone?: ReactNode;
}) {
  const conteudo = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo}</p>
        <strong className={`mt-2 block break-words text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white ${destaque || ""}`}>
          {valor}
        </strong>
        {detalhe && (
          <p className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            {detalhe}
          </p>
        )}
      </div>
      {icone && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700">
          {icone}
        </div>
      )}
    </div>
  );

  const className = "block min-w-0 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-5 text-left shadow-sm ring-1 ring-slate-200/80 dark:ring-slate-800/80 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-500/30";

  if (href) {
    return (
      <Link href={href} className={className}>
        {conteudo}
      </Link>
    );
  }

  return <div className={className}>{conteudo}</div>;
}

function BotaoAtalho({
  href,
  children,
  primary,
  icone,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  icone?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-center text-sm font-bold shadow-sm transition-all duration-200 active:scale-[0.98] ${
        primary
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 hover:shadow-md hover:shadow-blue-500/30"
          : "bg-white dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-md"
      }`}
    >
      {icone && <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">{icone}</span>}
      <span className="truncate">{children}</span>
    </Link>
  );
}

function MiniFila({
  titulo,
  valor,
  destaque = "text-slate-900 dark:text-white",
  badgeColor = "bg-blue-500",
}: {
  titulo: string;
  valor: ReactNode;
  destaque?: string;
  badgeColor?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-4 ring-1 ring-slate-200/80 dark:ring-slate-800/80 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${badgeColor}`} />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{titulo}</p>
      </div>
      <strong className={`mt-2 block text-2xl font-black tracking-tight ${destaque}`}>{valor}</strong>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [mostrarValores, setMostrarValores] = useState(false);

  const moduloProdutosAtivo =
    dados?.permissoes?.productsModuleEnabled ?? dados?.productsModuleEnabled ?? true;
  const moduloOsAtivo = 
    dados?.permissoes?.osModuleEnabled ?? dados?.osModuleEnabled ?? true;

  const podeVerOrdens = !carregandoPermissoes && moduloOsAtivo && tem("ordens.ver");
  const podeCriarOrdens = !carregandoPermissoes && moduloOsAtivo && tem("ordens.criar");
  const podeVerClientes = !carregandoPermissoes && tem("clientes.ver");
  const podeVerGarantias = !carregandoPermissoes && moduloOsAtivo && tem("garantias.ver");
  const podeVerConfiguracoes = !carregandoPermissoes && tem("configuracoes.editar");

  const podeVerProdutos = !carregandoPermissoes && moduloProdutosAtivo && tem("produtos.ver");
  const podeVerEstoque = !carregandoPermissoes && moduloProdutosAtivo && tem("estoque.ver");
  const podeVerVendasProdutos = !carregandoPermissoes && moduloProdutosAtivo && tem("vendas.ver");

  const financeiroSensivelLiberado = !carregandoPermissoes && tem("relatorios.financeiro");
  const podeVerRelatorios = !carregandoPermissoes && tem("relatorios.ver");
  const podeAcessarFinanceiroGeral = podeVerRelatorios || financeiroSensivelLiberado;

  const podeVerValoresOperacionais = podeVerOrdens || podeVerVendasProdutos;

  function primeiraRotaLiberada() {
    if (podeVerOrdens) return "/ordens";
    if (podeCriarOrdens) return "/ordens/nova";
    if (podeVerVendasProdutos) return "/produtos/vendas";
    if (podeVerProdutos) return "/produtos";
    if (podeVerClientes) return "/clientes";
    if (podeAcessarFinanceiroGeral) return "/financeiro-geral";
    if (podeVerRelatorios) return "/relatorios";
    if (podeVerGarantias) return "/garantias";
    if (podeVerConfiguracoes) return "/configuracoes";
    return "/minha-conta";
  }

  async function carregarPainel() {
    try {
      setCarregando(true);
      setMensagem("");

      if (!tem("dashboard.ver")) {
        setCarregando(false);
        router.replace(primeiraRotaLiberada());
        return;
      }

      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        credentials: "same-origin",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar painel inicial.");
        return;
      }
      setDados(data);
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Erro ao carregar painel inicial.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const preferencia = localStorage.getItem("nio_os_mostrar_valores");
    setMostrarValores(preferencia === "sim");
  }, []);

  useEffect(() => {
    if (carregandoPermissoes) return;
    if (!tem("dashboard.ver")) {
      router.replace(primeiraRotaLiberada());
      return;
    }
    carregarPainel();
  }, [carregandoPermissoes]);

  const recebidoMes = numeroSeguro(
    dados?.totalRecebidoMes ?? dados?.totalRecebidoNoMes ?? dados?.recebidoNoMes ?? dados?.recebidoMes
  );
  const recebidoOSMes = numeroSeguro(dados?.totalRecebidoOSMes);
  const receitaProdutosMes = numeroSeguro(dados?.receitaProdutosMes);
  const lucroProdutosMes = numeroSeguro(dados?.lucroProdutosMes);

  const recebidoMesVisivel = mostrarValores ? formatarMoeda(recebidoMes) : "R$ ••••••";
  const receitaOSVisivel = mostrarValores ? formatarMoeda(recebidoOSMes) : "R$ ••••••";
  const receitaProdutosVisivel = mostrarValores ? formatarMoeda(receitaProdutosMes) : "R$ ••••••";
  const lucroProdutosVisivel = mostrarValores ? formatarMoeda(lucroProdutosMes) : "R$ ••••••";

  const osRecebidas = numeroSeguro(dados?.osRecebidas);
  const osAbertas = numeroSeguro(dados?.osAbertas);
  const osConcluidas = numeroSeguro(dados?.osConcluidas ?? dados?.osEntregues);
  const emAnalise = numeroSeguro(dados?.osEmAnalise ?? dados?.emAnalise);
  const emReparo = numeroSeguro(dados?.osEmReparo ?? dados?.emReparo);
  const aguardandoPeca = numeroSeguro(dados?.aguardandoPeca);
  const osProntas = numeroSeguro(dados?.osProntas ?? dados?.prontas);
  const osAtrasadas = numeroSeguro(dados?.osAtrasadas);
  
  const garantiasVencendo = numeroSeguro(dados?.garantiasVencendo);
  const garantiasVencidas = numeroSeguro(dados?.garantiasVencidas);

  const produtosAtivos = numeroSeguro(dados?.produtosAtivos);
  const produtosEstoqueBaixo = numeroSeguro(dados?.produtosEstoqueBaixo);
  const vendasProdutosQuantidade = numeroSeguro(dados?.vendasProdutosQuantidade);
  const itensProdutosVendidosMes = numeroSeguro(dados?.itensProdutosVendidosMes);

  const ultimasOrdens = dados?.ultimasOrdens || dados?.recentOrders || dados?.ordensRecentes || [];
  const ultimasVendasProdutos = dados?.ultimasVendasProdutos || [];
  const produtosEstoqueBaixoLista = dados?.produtosEstoqueBaixoLista || [];

  const totalFila = osRecebidas + emAnalise + aguardandoPeca + emReparo + osProntas;
  const taxaConclusao = useMemo(() => {
    const base = totalFila + osConcluidas;
    if (base <= 0) return 0;
    return Math.round((osConcluidas / base) * 100);
  }, [totalFila, osConcluidas]);

  function alternarValores() {
    setMostrarValores((atual) => {
      const novoValor = !atual;
      localStorage.setItem("nio_os_mostrar_valores", novoValor ? "sim" : "nao");
      return novoValor;
    });
  }

  // Se OS estiver desativada mas Produtos sim, o app parece um PDV
  const isPDVMode = !moduloOsAtivo && moduloProdutosAtivo;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 p-5 text-slate-900 dark:text-slate-100 lg:p-8 relative overflow-hidden transition-colors duration-300">
      {/* Decorative ambient background glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400/10 dark:bg-blue-600/15 rounded-full blur-[120px]"></div>
        <div className="absolute top-60 -left-20 w-80 h-80 bg-indigo-400/10 dark:bg-indigo-600/10 rounded-full blur-[100px]"></div>
      </div>

      <section className="mx-auto max-w-7xl space-y-7 relative z-10">
        {/* Header Bar */}
        <GlassCard className="p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 text-xs font-bold text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
                  Painel de Controle
                </span>
              </div>
              <h1 className="mt-1.5 text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Visão geral do sistema
              </h1>
              <p className="mt-1 max-w-2xl text-xs lg:text-sm font-medium text-slate-500 dark:text-slate-400">
                {isPDVMode
                  ? "Acompanhe suas vendas no balcão, movimentação de caixa e alertas de estoque."
                  : "Monitore as ordens de serviço em andamento, fluxo financeiro do mês e prazos operacionais."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={carregarPainel}
                disabled={carregando}
                className="group flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-60 transition"
              >
                <svg className={`w-3.5 h-3.5 ${carregando ? "animate-spin text-blue-600" : "text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 21h5v-5" />
                </svg>
                <span>{carregando ? "Atualizando..." : "Atualizar"}</span>
              </button>

              {podeCriarOrdens && (
                <Link
                  href="/ordens/nova"
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition-all duration-150 active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Nova OS</span>
                </Link>
              )}

              {isPDVMode && podeVerVendasProdutos && (
                <Link
                  href="/produtos/vendas/nova"
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition-all duration-150 active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="21" r="1" />
                    <circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  </svg>
                  <span>Frente de Caixa</span>
                </Link>
              )}
            </div>
          </div>
        </GlassCard>

        <CardMensagem mensagem={mensagem} />

        {carregando ? (
          <GlassCard className="p-12 text-center text-xs font-bold text-slate-400">
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-6 h-6 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span>Carregando dados do painel...</span>
            </div>
          </GlassCard>
        ) : (
          <>
            {/* Bloco Superior: Card Financeiro Hero & Pipeline Operacional */}
            <section
              className={`grid gap-6 ${
                podeVerValoresOperacionais && !isPDVMode
                  ? "xl:grid-cols-[1.3fr_1fr]"
                  : "xl:grid-cols-1"
              }`}
            >
              {podeVerValoresOperacionais && (
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 lg:p-7 text-white shadow-xl ring-1 ring-white/10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between relative z-10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-blue-400">
                          Receita Total do Mês
                        </p>
                      </div>
                      <strong className="mt-2 block break-words text-4xl lg:text-5xl font-black leading-none tracking-tight text-white">
                        {recebidoMesVisivel}
                      </strong>
                      <p className="mt-2 text-xs font-medium leading-relaxed text-slate-400 max-w-md">
                        {isPDVMode
                          ? "Faturamento bruto registrado em vendas de produtos neste mês."
                          : moduloProdutosAtivo
                          ? "Soma de todas as OS pagas e vendas concluídas no período."
                          : "Soma de pagamentos recebidos de ordens de serviço no mês."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={alternarValores}
                        className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md px-3 py-2 text-xs font-bold text-white transition ring-1 ring-white/10"
                        title={mostrarValores ? "Ocultar valores financeiros" : "Exibir valores financeiros"}
                      >
                        {mostrarValores ? (
                          <>
                            <svg className="w-3.5 h-3.5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                              <line x1="2" x2="22" y1="2" y2="22" />
                            </svg>
                            <span>Ocultar</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span>Mostrar</span>
                          </>
                        )}
                      </button>

                      {podeAcessarFinanceiroGeral && (
                        <Link
                          href="/financeiro-geral"
                          className="flex items-center gap-1.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 px-3 py-2 text-xs font-bold text-white transition shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" x2="12" y1="2" y2="22" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                          <span>Financeiro</span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Sub-cards financeiros */}
                  <div className={`mt-6 grid gap-3 relative z-10 ${isPDVMode ? "md:grid-cols-2" : moduloProdutosAtivo ? "md:grid-cols-3" : "md:grid-cols-1"}`}>
                    {!isPDVMode && (
                      <div className="rounded-xl bg-white/5 backdrop-blur-md p-4 ring-1 ring-white/10 hover:bg-white/[0.08] transition">
                        <span className="text-[11px] font-medium text-slate-400">Receita de OS</span>
                        <strong className="mt-1 block text-xl font-bold text-white">{receitaOSVisivel}</strong>
                      </div>
                    )}

                    {moduloProdutosAtivo && (
                      <>
                        <div className="rounded-xl bg-white/5 backdrop-blur-md p-4 ring-1 ring-white/10 hover:bg-white/[0.08] transition">
                          <span className="text-[11px] font-medium text-slate-400">Vendas de Produtos</span>
                          <strong className="mt-1 block text-xl font-bold text-white">{receitaProdutosVisivel}</strong>
                        </div>

                        <div className="rounded-xl bg-white/5 backdrop-blur-md p-4 ring-1 ring-white/10 hover:bg-white/[0.08] transition">
                          <span className="text-[11px] font-medium text-emerald-400">Lucro Estimado</span>
                          <strong className="mt-1 block text-xl font-bold text-emerald-400">{lucroProdutosVisivel}</strong>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Detalhes operacionais rápidos */}
                  <div className={`mt-3 grid gap-3 relative z-10 ${moduloProdutosAtivo && !isPDVMode ? "grid-cols-2 md:grid-cols-4" : moduloProdutosAtivo || !isPDVMode ? "grid-cols-2" : "grid-cols-1"}`}>
                    {moduloProdutosAtivo && (
                      <>
                        <div className="rounded-xl bg-white/5 p-3 text-xs ring-1 ring-white/5">
                          <span className="text-slate-400 text-[10px] uppercase font-bold">Vendas Feitas</span>
                          <p className="font-bold text-white text-base mt-0.5">{vendasProdutosQuantidade}</p>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3 text-xs ring-1 ring-white/5">
                          <span className="text-slate-400 text-[10px] uppercase font-bold">Itens Vendidos</span>
                          <p className="font-bold text-white text-base mt-0.5">{itensProdutosVendidosMes}</p>
                        </div>
                      </>
                    )}

                    {!isPDVMode && (
                      <div className="rounded-xl bg-white/5 p-3 text-xs ring-1 ring-white/5">
                        <span className="text-slate-400 text-[10px] uppercase font-bold">OS em Aberto</span>
                        <p className="font-bold text-white text-base mt-0.5">{osAbertas}</p>
                      </div>
                    )}

                    {moduloProdutosAtivo && (
                      <div className="rounded-xl bg-white/5 p-3 text-xs ring-1 ring-white/5">
                        <span className="text-slate-400 text-[10px] uppercase font-bold">Estoque Crítico</span>
                        <p className={`font-bold text-base mt-0.5 ${produtosEstoqueBaixo > 0 ? "text-orange-400" : "text-white"}`}>{produtosEstoqueBaixo}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fila Operacional de Ordens */}
              {podeVerOrdens && !isPDVMode && (
                <div className="grid grid-cols-2 gap-3.5">
                  <MiniFila titulo="OS Recebidas" valor={osRecebidas} badgeColor="bg-slate-400" />
                  <MiniFila titulo="Em Análise" valor={emAnalise} destaque="text-blue-600 dark:text-blue-400" badgeColor="bg-blue-500" />
                  <MiniFila titulo="Aguard. Peça" valor={aguardandoPeca} destaque="text-amber-600 dark:text-amber-400" badgeColor="bg-amber-500" />
                  <MiniFila titulo="Em Reparo" valor={emReparo} destaque="text-purple-600 dark:text-purple-400" badgeColor="bg-purple-500" />
                  <MiniFila titulo="OS Atrasadas" valor={osAtrasadas} destaque="text-red-600 dark:text-red-400" badgeColor="bg-red-500" />
                  <MiniFila titulo="Taxa Conclusão" valor={`${taxaConclusao}%`} destaque="text-emerald-600 dark:text-emerald-400" badgeColor="bg-emerald-500" />
                </div>
              )}
            </section>

            {/* Seção de Cards Resumo (KPIs) */}
            <section className={`grid gap-4 md:grid-cols-2 ${financeiroSensivelLiberado ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
              {podeVerOrdens && !isPDVMode && (
                <>
                  <CardResumo
                    titulo="OS em Andamento"
                    valor={osAbertas}
                    detalhe="Fila atual de trabalho"
                    href="/ordens"
                    destaque="text-blue-600 dark:text-blue-400"
                    icone={
                      <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    }
                  />
                  <CardResumo
                    titulo="OS Prontas"
                    valor={osProntas}
                    detalhe="Aguardando entrega"
                    href="/ordens"
                    destaque="text-emerald-600 dark:text-emerald-400"
                    icone={
                      <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    }
                  />
                  <CardResumo
                    titulo="OS Atrasadas"
                    valor={osAtrasadas}
                    detalhe="Previsão ultrapassada"
                    href="/ordens/atrasadas"
                    destaque="text-red-600 dark:text-red-400"
                    icone={
                      <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    }
                  />
                </>
              )}

              {podeVerEstoque && (
                <CardResumo
                  titulo="Estoque Crítico"
                  valor={produtosEstoqueBaixo}
                  detalhe="Itens abaixo do mínimo"
                  href="/produtos/estoque"
                  destaque={produtosEstoqueBaixo > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-800 dark:text-slate-200"}
                  icone={
                    <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  }
                />
              )}

              {podeVerProdutos && (
                <CardResumo
                  titulo="Produtos Ativos"
                  valor={produtosAtivos}
                  detalhe="Cadastrados no sistema"
                  href="/produtos"
                  destaque="text-indigo-600 dark:text-indigo-400"
                  icone={
                    <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m7.5 4.27 9 5.15" />
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                      <path d="m3.3 7 8.7 5 8.7-5" />
                      <path d="M12 22V12" />
                    </svg>
                  }
                />
              )}

              {podeVerGarantias && !isPDVMode && (
                <CardResumo
                  titulo="Garantias Vencendo"
                  valor={garantiasVencendo}
                  detalhe="Próximos 7 dias"
                  href="/garantias"
                  destaque="text-amber-600 dark:text-amber-400"
                  icone={
                    <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  }
                />
              )}
            </section>

            {/* Grade de Atalhos Rápidos */}
            <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {podeCriarOrdens && !isPDVMode && (
                <BotaoAtalho
                  href="/ordens/nova"
                  primary
                  icone={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  }
                >
                  Nova OS
                </BotaoAtalho>
              )}
              {podeVerOrdens && !isPDVMode && (
                <BotaoAtalho
                  href="/ordens"
                  icone={
                    <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                  }
                >
                  Gerenciar OS
                </BotaoAtalho>
              )}
              {podeVerVendasProdutos && (
                <BotaoAtalho
                  href="/produtos/vendas/nova"
                  primary
                  icone={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="21" r="1" />
                      <circle cx="19" cy="21" r="1" />
                      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                    </svg>
                  }
                >
                  Frente de Caixa
                </BotaoAtalho>
              )}
              {podeVerClientes && (
                <BotaoAtalho
                  href="/clientes"
                  icone={
                    <svg className="w-4 h-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  }
                >
                  Clientes
                </BotaoAtalho>
              )}
              {podeVerEstoque && (
                <BotaoAtalho
                  href="/produtos/estoque"
                  icone={
                    <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m7.5 4.27 9 5.15" />
                      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                      <path d="M12 22V12" />
                    </svg>
                  }
                >
                  Controle de Estoque
                </BotaoAtalho>
              )}
              {podeVerGarantias && !isPDVMode && (
                <BotaoAtalho
                  href="/garantias"
                  icone={
                    <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  }
                >
                  Garantias
                </BotaoAtalho>
              )}
              {podeAcessarFinanceiroGeral && (
                <BotaoAtalho
                  href="/financeiro-geral"
                  icone={
                    <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" x2="12" y1="2" y2="22" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  }
                >
                  Financeiro
                </BotaoAtalho>
              )}
              {podeVerConfiguracoes && (
                <BotaoAtalho
                  href="/configuracoes"
                  icone={
                    <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  }
                >
                  Configurações
                </BotaoAtalho>
              )}
            </section>

            {/* Listagens: Últimas OS e Últimas Vendas */}
            <section className={`grid gap-6 ${isPDVMode ? "xl:grid-cols-2" : "xl:grid-cols-[1.3fr_0.9fr]"}`}>
              {podeVerOrdens && !isPDVMode && (
                <GlassCard className="p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Últimas Ordens de Serviço</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Ordens abertas recentemente.</p>
                    </div>
                    <Link href="/ordens" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 transition">
                      Ver todas
                    </Link>
                  </div>

                  {ultimasOrdens.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-8 text-center text-xs font-medium text-slate-400">
                      Nenhuma ordem cadastrada até o momento.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="pb-3 font-bold">OS</th>
                            <th className="pb-3 font-bold">Cliente</th>
                            <th className="pb-3 font-bold">Equipamento</th>
                            <th className="pb-3 font-bold">Status</th>
                            <th className="pb-3 font-bold">Total</th>
                            <th className="pb-3 font-bold text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {ultimasOrdens.map((ordem) => {
                            const cliente = ordem.customer || null;
                            const nomeCliente = cliente?.name || ordem.customerName || "-";
                            const whatsapp = cliente?.whatsapp || ordem.customerWhatsapp || "-";
                            return (
                              <tr key={ordem.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                                <td className="py-3 font-bold text-slate-900 dark:text-white">#{formatarNumeroOS(ordem.osNumber)}</td>
                                <td className="py-3">
                                  <div className="font-semibold text-slate-800 dark:text-slate-200">{nomeCliente}</div>
                                  <div className="text-[10px] text-slate-400">{whatsapp}</div>
                                </td>
                                <td className="py-3">
                                  <div className="font-medium text-slate-700 dark:text-slate-300">{nomeEquipamento(ordem)}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {[ordem.brand, ordem.model].filter(Boolean).join(" ") || "-"}
                                  </div>
                                </td>
                                <td className="py-3">
                                  <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${classeStatus(ordem.status)}`}>
                                    {nomesStatus[ordem.status || ""] || ordem.status || "-"}
                                  </span>
                                </td>
                                <td className="py-3 font-bold text-slate-900 dark:text-white">
                                  {mostrarValores ? formatarMoeda(ordem.totalAmount) : "R$ ••••••"}
                                </td>
                                <td className="py-3 text-right">
                                  <Link href={`/ordens/${ordem.id}`} className="rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-blue-600 dark:text-blue-400 px-3 py-1.5 text-xs font-bold transition">
                                    Abrir
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Últimas Vendas / PDV */}
              {podeVerVendasProdutos && (
                <GlassCard className="p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Últimas Vendas</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Movimentação recente no balcão.</p>
                    </div>
                    <Link href="/produtos/vendas" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 transition">
                      Ver todas
                    </Link>
                  </div>

                  {ultimasVendasProdutos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-8 text-center text-xs font-medium text-slate-400">
                      Nenhuma venda registrada recentemente.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {ultimasVendasProdutos.map((venda) => {
                        const cliente = venda.customer?.name || venda.customerName || "Consumidor";
                        const itens = venda.items || [];
                        const qtdItens = itens.reduce((total, item) => total + inteiro(item.quantity), 0);
                        return (
                          <article key={venda.id} className="rounded-xl bg-slate-50/80 dark:bg-slate-800/50 p-3.5 ring-1 ring-slate-200/60 dark:ring-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20">PDV</span>
                                  Venda #{formatarNumeroVenda(venda.saleNumber)}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {cliente} • {nomesPagamento[venda.paymentMethod || ""] || venda.paymentMethod || "-"} • {formatarDataHora(venda.soldAt)}
                                </p>
                              </div>
                              <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                                {mostrarValores ? formatarMoeda(venda.totalAmount) : "R$ ••••••"}
                              </strong>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Alertas de Estoque Baixo */}
              {podeVerEstoque && (
                <GlassCard className="p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Alerta de Estoque</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Produtos no limite ou abaixo do mínimo.</p>
                    </div>
                    <Link href="/produtos/estoque" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-blue-600 transition">
                      Ver Estoque
                    </Link>
                  </div>

                  {produtosEstoqueBaixoLista.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20 p-8 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ Níveis de estoque regularizados.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {produtosEstoqueBaixoLista.map((produto) => (
                        <article key={produto.id} className="rounded-xl bg-amber-500/10 p-3.5 ring-1 ring-amber-500/25">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-amber-950 dark:text-amber-200 truncate">{produto.name}</p>
                              <p className="mt-0.5 text-[10px] text-amber-800/80 dark:text-amber-300/70 truncate">
                                {produto.category || "Geral"} | SKU: {produto.sku || "-"}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <strong className="block text-base font-black text-amber-600 dark:text-amber-400">
                                {inteiro(produto.stockQuantity)} un
                              </strong>
                              <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-500">
                                Mín: {inteiro(produto.minStock)}
                              </span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </GlassCard>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
