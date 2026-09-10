/**
 * @file app/produtos/vendas/page.tsx
 * @description Tela de Histórico e Gestão de Vendas de Balcão / PDV (Frontend).
 * 
 * Funcionalidades:
 * - Consulta consolidada de vendas comerciais com filtros de período e forma de pagamento.
 * - Indicadores: Faturamento total, lucro bruto apurado, ticket médio e volume de peças vendidas.
 * - Detalhamento de cada venda com itens, impostos, custos e dados do cliente.
 * - Cancelamento seguro de vendas com estorno automático de mercadorias para o estoque.
 * - Reimpressão de cupom não-fiscal térmico (80mm).
 */

"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarDataHora,
  formatarNumeroVenda,
  inteiro,
} from "@/lib/formatadores";
import { nomesPagamento, inputClass } from "@/lib/uiConstantes";
import {
  ModuloProdutosDesativado,
  useModuloProdutosAtivo,
} from "../ModuloProdutosGuard";

type Cliente = {
  id?: string;
  name?: string | null;
  whatsapp?: string | null;
};

type ItemVenda = {
  id: string;
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice?: number | string | null;
  subtotalAmount?: number | string | null;
  taxAmount?: number | string | null;
  costAmount?: number | string | null;
  profitAmount?: number | string | null;
  totalAmount?: number | string | null;
};

type VendaProduto = {
  id: string;
  saleNumber?: number | string | null;
  soldAt?: string | null;
  customerName?: string | null;
  customer?: Cliente | null;
  subtotalAmount?: number | string | null;
  discount?: number | string | null;
  taxAmount?: number | string | null;
  costAmount?: number | string | null;
  profitAmount?: number | string | null;
  totalAmount?: number | string | null;
  paymentMethod?: string | null;
  status?: "CONCLUIDA" | "CANCELADA" | string;
  note?: string | null;
  userName?: string | null;
  attendantUserId?: string | null;
  attendantProfitPercentSnapshot?: number | string | null;
  attendantProfitShare?: number | string | null;
  attendantUser?: {
    id?: string;
    name?: string | null;
    username?: string | null;
  } | null;
  items?: ItemVenda[];
};

type VendasResponse = {
  message?: string;
  resumo?: {
    totalVendas?: number;
    totalAmount?: number;
    subtotalAmount?: number;
    discount?: number;
    taxAmount?: number;
    costAmount?: number;
    profitAmount?: number;
  };
  vendas?: VendaProduto[];
};



const nomesStatus: Record<string, string> = {
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
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

function nomeCliente(venda: VendaProduto) {
  return (
    venda.customer?.name ||
    venda.customerName ||
    "Consumidor não identificado"
  );
}

function classeStatus(status?: string | null) {
  if (status === "CANCELADA") {
    return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30";
  }

  return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30";
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

/**
 * Componente principal da Tela de Vendas de Produtos / PDV.
 * 
 * Gerencia a tabela de vendas concluídas, painel de filtros temporais,
 * gaveta lateral de detalhes e fluxo de cancelamento com estorno.
 */
export default function VendasProdutosPage() {
  const { carregando: carregandoPermissoes, tem } =
    useUsuarioPermissoes();

  const { carregandoModuloProdutos, moduloProdutosAtivo } =
    useModuloProdutosAtivo();

  const podeVer = !carregandoPermissoes && tem("vendas.ver");
  const podeCancelar = !carregandoPermissoes && tem("vendas.cancelar");
  const financeiroSensivelLiberado =
    !carregandoPermissoes && tem("relatorios.financeiro");
  const podeVerRelatorios =
    !carregandoPermissoes &&
    tem(["relatorios.ver", "relatorios.financeiro"]);

  const [dataInicio, setDataInicio] = useState(primeiroDiaMesInput());
  const [dataFim, setDataFim] = useState(hojeInput());
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("TODOS");

  const [vendas, setVendas] = useState<VendaProduto[]>([]);
  const [resumoApi, setResumoApi] = useState<VendasResponse["resumo"] | null>(
    null
  );

  const [cancelandoVenda, setCancelandoVenda] =
    useState<VendaProduto | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");

  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const resumo = useMemo(() => {
    const vendasConcluidas = vendas.filter(
      (venda) => venda.status !== "CANCELADA"
    );

    const vendasCanceladas = vendas.filter(
      (venda) => venda.status === "CANCELADA"
    );

    const itensVendidos = vendasConcluidas.reduce((total, venda) => {
      return (
        total +
        (venda.items || []).reduce(
          (subtotal, item) => subtotal + inteiro(item.quantity),
          0
        )
      );
    }, 0);

    const totalVendido = vendasConcluidas.reduce(
      (total, venda) => total + numero(venda.totalAmount),
      0
    );

    const lucro = vendasConcluidas.reduce(
      (total, venda) => total + numero(venda.profitAmount),
      0
    );

    const totalComissaoAtendentes = vendasConcluidas.reduce(
      (total, venda) => total + numero(venda.attendantProfitShare),
      0
    );

    return {
      totalVendas: vendasConcluidas.length,
      vendasCanceladas: vendasCanceladas.length,
      itensVendidos,
      totalVendido,
      lucro,
      totalComissaoAtendentes,
      totalApi: numero(resumoApi?.totalAmount),
    };
  }, [vendas, resumoApi]);

  async function carregarVendas() {
    try {
      setCarregando(true);
      setMensagem("");

      const params = new URLSearchParams();
      params.set("dataInicio", dataInicio);
      params.set("dataFim", dataFim);
      params.set("status", status);

      if (busca.trim()) {
        params.set("busca", busca.trim());
      }

      const response = await fetch(`/api/vendas-produtos?${params.toString()}`, {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | VendasResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar vendas.");
        setVendas([]);
        setResumoApi(null);
        return;
      }

      setVendas(Array.isArray(data?.vendas) ? data.vendas : []);
      setResumoApi(data?.resumo || null);
    } catch {
      setMensagem("Erro ao carregar vendas.");
      setVendas([]);
      setResumoApi(null);
    } finally {
      setCarregando(false);
    }
  }

  function aplicarMesAtual() {
    const inicio = primeiroDiaMesInput();
    const fim = hojeInput();

    setDataInicio(inicio);
    setDataFim(fim);

    setTimeout(() => {
      carregarVendas();
    }, 50);
  }

  async function cancelarVenda() {
    if (!cancelandoVenda) return;

    if (!motivoCancelamento.trim()) {
      setMensagem("Informe o motivo do cancelamento.");
      return;
    }

    try {
      setSalvando(true);
      setMensagem("");

      const response = await fetch(
        `/api/vendas-produtos/${cancelandoVenda.id}/cancelar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: motivoCancelamento,
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao cancelar venda.");
        return;
      }

      setMensagem(
        `${data?.message || "Venda cancelada com sucesso."} Estoque devolvido em ${
          data?.estoqueDevolvido || 0
        } produto(s).`
      );

      setCancelandoVenda(null);
      setMotivoCancelamento("");

      await carregarVendas();
    } catch {
      setMensagem("Erro ao cancelar venda.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes || carregandoModuloProdutos) return;

    if (podeVer && moduloProdutosAtivo) {
      carregarVendas();
    } else {
      setCarregando(false);
    }
  }, [
    carregandoPermissoes,
    carregandoModuloProdutos,
    podeVer,
    moduloProdutosAtivo,
  ]);

  if (carregandoPermissoes || carregandoModuloProdutos || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando vendas de produtos...
        </section>
      </main>
    );
  }

  if (!moduloProdutosAtivo) {
    return (
      <ModuloProdutosDesativado
        titulo="Vendas de produtos desativadas"
        descricao="O módulo de produtos, estoque e vendas está desativado nas configurações do sistema."
      />
    );
  }

  if (!podeVer) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar vendas de produtos.
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
                Vendas de produtos
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Consulte vendas de produtos, veja itens vendidos e cancele vendas
                quando necessário, devolvendo o estoque automaticamente.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/produtos"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Voltar produtos
              </Link>

              <Link
                href="/produtos/estoque"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Estoque
              </Link>

              {podeVerRelatorios && (
                <Link
                  href="/produtos/relatorios"
                  className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
                >
                  Relatórios
                </Link>
              )}
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_160px_auto_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Buscar
              </label>

              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Cliente, produto ou número..."
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Data inicial
              </label>

              <input
                type="date"
                value={dataInicio}
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
                onChange={(event) => setDataFim(event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Status
              </label>

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className={inputClass}
              >
                <option value="TODOS">Todos</option>
                <option value="CONCLUIDA">Concluídas</option>
                <option value="CANCELADA">Canceladas</option>
              </select>
            </div>

            <button
              type="button"
              onClick={carregarVendas}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
            >
              Buscar
            </button>

            <button
              type="button"
              onClick={aplicarMesAtual}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Mês atual
            </button>
          </div>
        </section>

        <section
          className={`grid gap-4 md:grid-cols-2 ${
            financeiroSensivelLiberado
              ? "xl:grid-cols-6"
              : "xl:grid-cols-3"
          }`}
        >
          <CardResumo
            titulo="Total vendido"
            valor={formatarMoeda(resumo.totalVendido)}
            detalhe="Somente concluídas"
            destaque="green"
          />

          <CardResumo
            titulo="Vendas"
            valor={resumo.totalVendas}
            detalhe="Concluídas"
            destaque="blue"
          />

          <CardResumo
            titulo="Itens"
            valor={resumo.itensVendidos}
            detalhe="Produtos vendidos"
            destaque="blue"
          />

          {financeiroSensivelLiberado && (
            <CardResumo
              titulo="Lucro"
              valor={formatarMoeda(resumo.lucro)}
              detalhe="Estimado"
              destaque="green"
            />
          )}

          {financeiroSensivelLiberado && (
            <CardResumo
              titulo="Comissão Atendentes"
              valor={formatarMoeda(resumo.totalComissaoAtendentes)}
              detalhe="Sobre lucro PDV"
              destaque="blue"
            />
          )}

          <CardResumo
            titulo="Canceladas"
            valor={resumo.vendasCanceladas}
            detalhe="Não entram no total"
            destaque="red"
          />
        </section>

        {cancelandoVenda && (
          <section className="rounded-3xl bg-red-50 p-6 shadow-sm ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
            <h2 className="text-2xl font-black tracking-tight text-red-800">
              Cancelar venda Nº {formatarNumeroVenda(cancelandoVenda.saleNumber)}?
            </h2>

            <p className="mt-3 text-sm font-bold leading-6 text-red-700 dark:text-red-400">
              Esta ação marca a venda como cancelada, remove ela dos relatórios
              financeiros de produtos e devolve automaticamente o estoque dos
              produtos que tiveram baixa controlada.
            </p>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
              <div>
                <label className="mb-1 block text-sm font-black text-red-800">
                  Motivo do cancelamento
                </label>

                <input
                  value={motivoCancelamento}
                  onChange={(event) =>
                    setMotivoCancelamento(event.target.value)
                  }
                  placeholder="Ex.: venda lançada errado, cliente desistiu..."
                  className="w-full rounded-xl border border-red-300 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-400 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
                />
              </div>

              <button
                type="button"
                disabled={salvando}
                onClick={() => {
                  setCancelandoVenda(null);
                  setMotivoCancelamento("");
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:opacity-60"
              >
                Não cancelar
              </button>

              <button
                type="button"
                disabled={salvando}
                onClick={cancelarVenda}
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
              >
                {salvando ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Histórico</p>

            <h2 className="text-2xl font-black tracking-tight">
              Vendas encontradas
            </h2>

            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              {vendas.length} venda(s) no filtro atual.
            </p>
          </div>

          {vendas.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
              Nenhuma venda encontrada.
            </p>
          ) : (
            <div className="space-y-4">
              {vendas.map((venda) => {
                const cancelada = venda.status === "CANCELADA";
                const itens = venda.items || [];

                return (
                  <article
                    key={venda.id}
                    className={`rounded-3xl p-5 ring-1 ${
                      cancelada
                        ? "bg-red-50 ring-red-200"
                        : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100"
                    }`}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                              venda.status
                            )}`}
                          >
                            {nomesStatus[venda.status || ""] ||
                              venda.status ||
                              "Concluída"}
                          </span>

                          <h3 className="text-xl font-black text-slate-950 dark:text-slate-100">
                            Venda Nº {formatarNumeroVenda(venda.saleNumber)}
                          </h3>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                          Cliente: {nomeCliente(venda)} |{" "}
                          {nomesPagamento[venda.paymentMethod || ""] ||
                            venda.paymentMethod ||
                            "-"}{" "}
                          | {formatarDataHora(venda.soldAt)}
                        </p>

                        <p className="mt-1 text-xs font-bold text-slate-400">
                          Operador: {venda.userName || "Sistema"}
                          {venda.attendantUser && (
                            <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">
                              | Atendente: {venda.attendantUser.name}
                            </span>
                          )}
                          {financeiroSensivelLiberado &&
                            venda.attendantProfitShare !== null &&
                            venda.attendantProfitShare !== undefined &&
                            Number(venda.attendantProfitShare) > 0 && (
                              <span className="text-amber-600 dark:text-amber-400 font-black ml-1">
                                (Comissão: {formatarMoeda(venda.attendantProfitShare)}{" "}
                                - {venda.attendantProfitPercentSnapshot}%)
                              </span>
                            )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                        {financeiroSensivelLiberado && (
                          <div className="rounded-2xl bg-white dark:bg-slate-900 px-5 py-3 text-right ring-1 ring-slate-200 dark:ring-slate-800">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                              Total
                            </p>

                            <strong
                              className={`text-2xl ${
                                cancelada ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"
                              }`}
                            >
                              {formatarMoeda(venda.totalAmount)}
                            </strong>
                          </div>
                        )}

                        {!cancelada && podeCancelar && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelandoVenda(venda);
                              setMotivoCancelamento("");
                              window.scrollTo({
                                top: 0,
                                behavior: "smooth",
                              });
                            }}
                            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>

                    {financeiroSensivelLiberado && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Subtotal
                          </p>
                          <strong>{formatarMoeda(venda.subtotalAmount)}</strong>
                        </div>

                        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Desconto
                          </p>
                          <strong>{formatarMoeda(venda.discount)}</strong>
                        </div>

                        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Imposto
                          </p>
                          <strong>{formatarMoeda(venda.taxAmount)}</strong>
                        </div>

                        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
                          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                            Lucro
                          </p>
                          <strong>{formatarMoeda(venda.profitAmount)}</strong>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl bg-white dark:bg-slate-900 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
                      <p className="text-sm font-black text-slate-900 dark:text-white">
                        Produtos vendidos
                      </p>

                      {itens.length === 0 ? (
                        <p className="mt-2 text-sm font-bold text-slate-500 dark:text-slate-400">
                          Nenhum item encontrado.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {itens.map((item) => (
                            <div
                              key={item.id}
                              className="flex flex-col gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm font-bold text-slate-700 dark:text-slate-200 md:flex-row md:items-center md:justify-between"
                                >
                              <span>{item.productName}</span>

                              <span>
                                {`${item.quantity} un. × ${formatarMoeda(
                                  item.unitPrice
                                )} = ${formatarMoeda(item.totalAmount)}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {cancelada && venda.note && (
                      <p className="mt-3 rounded-2xl bg-white dark:bg-slate-900 p-4 text-xs font-bold leading-5 text-red-700 dark:text-red-400 ring-1 ring-red-200">
                        {venda.note}
                      </p>
                    )}
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
