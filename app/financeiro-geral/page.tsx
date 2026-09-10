/**
 * @file app/financeiro-geral/page.tsx
 * @description Painel de Gestão Financeira Unificada e Fluxo de Caixa (Frontend).
 * 
 * Funcionalidades:
 * - Consolidação de receitas: Pagamentos de Ordens de Serviço + Vendas Balcão de Produtos - Estornos.
 * - Divisão de participação no faturamento (% Serviços vs % Produtos).
 * - Gráfico comparativo de arrecadação por método de pagamento (PIX, Dinheiro, Cartão, Parcelado).
 * - Extrato detalhado de lançamentos e movimentações financeiras com filtro por período.
 * - Trava estrita de acesso: exige permissão `relatorios.financeiro`.
 */

"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";

type Periodo = {
  dataInicio: string;
  dataFim: string;
};

type Resumo = {
  receitaTotal: number;
  recebidoOS: number;
  recebidoProdutos: number;

  pagamentosOS: number;
  estornosOS?: number;
  totalEstornosOS?: number;
  vendasProdutos: number;
  itensProdutos: number;

  custoProdutos: number;
  impostoProdutos: number;
  lucroProdutos: number;

  ticketMedioGeral: number;
  participacaoOS: number;
  participacaoProdutos: number;
};

type FormaPagamento = {
  forma: string;
  label: string;
  total: number;
  os: number;
  produtos: number;
  quantidadeOS: number;
  quantidadeProdutos: number;
};

type Movimento = {
  id: string;
  tipo: "OS" | "PRODUTO" | "ESTORNO_OS";
  data: string;
  descricao: string;
  cliente: string;
  forma: string;
  formaLabel: string;
  valor: number;
  usuario: string;
  note?: string | null;
};

type FinanceiroResponse = {
  message?: string;
  productsModuleEnabled?: boolean;
  financeiroSensivelLiberado?: boolean;
  periodo?: Periodo;
  resumo?: Resumo;
  porFormaPagamento?: FormaPagamento[];
  movimentos?: Movimento[];
};

import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, formatarDataHora } from "@/lib/formatadores";
import { inputClass } from "@/lib/uiConstantes";

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

function BarraForma({
  forma,
  maximo,
  moduloProdutosAtivo,
}: {
  forma: FormaPagamento;
  maximo: number;
  moduloProdutosAtivo: boolean;
}) {
  const largura = maximo > 0 ? Math.max(0, Math.min(100, (forma.total / maximo) * 100)) : 0;
  const ehNegativo = forma.total < 0;

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900 dark:text-white">{forma.label}</p>

          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            OS: {formatarMoeda(forma.os)}
            {moduloProdutosAtivo && (
              <> | Produtos: {formatarMoeda(forma.produtos)}</>
            )}
          </p>

          <p className="mt-1 text-xs font-semibold text-slate-400">
            {forma.quantidadeOS} pagamento(s) OS
            {moduloProdutosAtivo && (
              <> | {forma.quantidadeProdutos} venda(s) produto</>
            )}
          </p>
        </div>

        <strong
          className={`shrink-0 text-sm font-black ${
            ehNegativo
              ? "text-red-600 dark:text-red-400"
              : "text-green-700 dark:text-green-400"
          }`}
        >
          {ehNegativo
            ? `- ${formatarMoeda(Math.abs(forma.total))}`
            : formatarMoeda(forma.total)}
        </strong>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            ehNegativo ? "bg-red-500" : "bg-blue-600"
          }`}
          style={{
            width: `${largura}%`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Componente principal da Tela de Gestão Financeira Unificada.
 * 
 * Consulta a API consolidada `/api/financeiro-geral`, calcula participações percentuais
 * e renderiza cartões de faturamento, barras comparativas e extrato financeiro.
 */
export default function FinanceiroGeralPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeAcessar =
    !carregandoPermissoes &&
    tem(["relatorios.ver", "relatorios.financeiro"]);

  const [dataInicio, setDataInicio] = useState(primeiroDiaMesInput());
  const [dataFim, setDataFim] = useState(hojeInput());

  const [dados, setDados] = useState<FinanceiroResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const resumo = dados?.resumo;
  const porFormaPagamento = dados?.porFormaPagamento || [];
  const movimentos = dados?.movimentos || [];
  const moduloProdutosAtivo = dados?.productsModuleEnabled !== false;

  const maxForma = Math.max(
    0,
    ...porFormaPagamento.map((forma) => numero(forma.total))
  );

  async function carregarFinanceiro(
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
        `/api/financeiro-geral?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const data = (await response.json().catch(() => null)) as
        | FinanceiroResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar financeiro geral.");
        setDados(null);
        return;
      }

      setDados(data);
    } catch {
      setMensagem("Erro ao carregar financeiro geral.");
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  function aplicarMesAtual() {
    const inicio = primeiroDiaMesInput();
    const fim = hojeInput();

    setDataInicio(inicio);
    setDataFim(fim);

    carregarFinanceiro(inicio, fim);
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (podeAcessar) {
      carregarFinanceiro();
    } else {
      setCarregando(false);
    }
  }, [carregandoPermissoes, podeAcessar]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando painel financeiro...
        </section>
      </main>
    );
  }

  if (!podeAcessar) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar o financeiro geral.
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
              <p className="text-sm font-bold text-blue-600">Financeiro</p>

              <h1 className="text-3xl font-black tracking-tight">
                Financeiro geral
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                {moduloProdutosAtivo
                  ? "Visão consolidada de receita de OS, vendas de produtos, formas de pagamento e movimentações do período."
                  : "Visão financeira somente das ordens de serviço, sem somar vendas, custos, impostos ou lucros de produtos."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/pagamentos"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Pagamentos
              </Link>

              {moduloProdutosAtivo && (
                <Link
                  href="/produtos/relatorios"
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Relatório produtos
                </Link>
              )}

              <Link
                href="/"
                className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
              >
                Painel inicial
              </Link>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
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
              onClick={() => carregarFinanceiro(dataInicio, dataFim)}
              disabled={carregando}
              className="self-end rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Gerar
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

        <section
          className={`grid gap-4 md:grid-cols-2 ${
            moduloProdutosAtivo ? "xl:grid-cols-4" : "xl:grid-cols-3"
          }`}
        >
          <CardResumo
            titulo="Receita total"
            valor={formatarMoeda(resumo?.receitaTotal || 0)}
            detalhe={moduloProdutosAtivo ? "OS + produtos" : "Somente OS"}
            destaque="green"
          />

          <CardResumo
            titulo="Receita OS"
            valor={formatarMoeda(resumo?.recebidoOS || 0)}
            detalhe={
              resumo?.estornosOS
                ? `${resumo.pagamentosOS} recebimento(s) · ${resumo.estornosOS} estorno(s)`
                : `${resumo?.pagamentosOS || 0} pagamento(s)`
            }
            destaque="blue"
          />

          {moduloProdutosAtivo && (
            <>
          <CardResumo
            titulo="Receita produtos"
            valor={formatarMoeda(resumo?.recebidoProdutos || 0)}
            detalhe={`${resumo?.vendasProdutos || 0} venda(s) | ${
              resumo?.itensProdutos || 0
            } item(ns)`}
            destaque="green"
              />

              {dados?.financeiroSensivelLiberado && <CardResumo
            titulo="Lucro produtos"
            valor={formatarMoeda(resumo?.lucroProdutos || 0)}
            detalhe="Venda - custo - imposto"
            destaque="green"
              />}

              {dados?.financeiroSensivelLiberado && <CardResumo
            titulo="Custo produtos"
            valor={formatarMoeda(resumo?.custoProdutos || 0)}
            detalhe="Custo estimado"
              />}

              {dados?.financeiroSensivelLiberado && <CardResumo
            titulo="Imposto produtos"
            valor={formatarMoeda(resumo?.impostoProdutos || 0)}
            detalhe="Imposto estimado"
            destaque="orange"
              />}

            </>
          )}

          <CardResumo
            titulo="Ticket médio"
            valor={formatarMoeda(resumo?.ticketMedioGeral || 0)}
            detalhe="Média geral"
          />

          <CardResumo
            titulo="Participação"
            valor={
              moduloProdutosAtivo
                ? `${formatarPercentual(
                    resumo?.participacaoOS || 0
                  )} / ${formatarPercentual(resumo?.participacaoProdutos || 0)}`
                : formatarPercentual(resumo?.participacaoOS || 0)
            }
            detalhe={moduloProdutosAtivo ? "OS / Produtos" : "OS no período"}
            destaque="blue"
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Recebimento</p>

              <h2 className="text-2xl font-black tracking-tight">
                Por forma de pagamento
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {moduloProdutosAtivo
                  ? "Soma OS e produtos, mantendo separado dentro de cada forma."
                  : "Soma somente pagamentos de OS por forma de pagamento."}
              </p>
            </div>

            {porFormaPagamento.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhum recebimento no período.
              </p>
            ) : (
              <div className="space-y-3">
                {porFormaPagamento.map((forma) => (
                  <BarraForma
                    key={forma.forma}
                    forma={forma}
                    maximo={maxForma}
                    moduloProdutosAtivo={moduloProdutosAtivo}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Movimento</p>

              <h2 className="text-2xl font-black tracking-tight">
                Movimentações recentes
              </h2>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {moduloProdutosAtivo
                  ? "Pagamentos de OS e vendas de produtos no período."
                  : "Pagamentos de OS no período."}
              </p>
            </div>

            {movimentos.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhuma movimentação encontrada.
              </p>
            ) : (
              <div className="space-y-3">
                {movimentos.map((movimento) => {
                  const ehEstorno =
                    movimento.tipo === "ESTORNO_OS" || movimento.valor < 0;

                  return (
                    <article
                      key={`${movimento.tipo}-${movimento.id}`}
                      className={`rounded-2xl p-4 ring-1 ${
                        ehEstorno
                          ? "bg-red-50/70 dark:bg-red-950/20 ring-red-200 dark:ring-red-900/40"
                          : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100"
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 ${
                                ehEstorno
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 ring-red-300 dark:ring-red-500/30"
                                  : movimento.tipo === "OS"
                                  ? "bg-blue-50 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30"
                                  : "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                              }`}
                            >
                              {ehEstorno
                                ? "Devolução OS"
                                : movimento.tipo === "OS"
                                ? "OS"
                                : "Produto"}
                            </span>

                            <h3 className="text-sm font-black text-slate-900 dark:text-white">
                              {movimento.descricao}
                            </h3>
                          </div>

                          <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {movimento.cliente} | {movimento.formaLabel} |{" "}
                            {formatarDataHora(movimento.data)}
                          </p>

                          {movimento.note && (
                            <p className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                              {movimento.note}
                            </p>
                          )}

                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            Operador: {movimento.usuario}
                          </p>
                        </div>

                        <strong
                          className={`text-lg font-black ${
                            ehEstorno
                              ? "text-red-600 dark:text-red-400"
                              : "text-green-700 dark:text-green-400"
                          }`}
                        >
                          {ehEstorno
                            ? `- ${formatarMoeda(Math.abs(movimento.valor))}`
                            : formatarMoeda(movimento.valor)}
                        </strong>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
