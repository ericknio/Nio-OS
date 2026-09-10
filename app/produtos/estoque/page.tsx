/**
 * @file app/produtos/estoque/page.tsx
 * @description Tela de Gestão e Ajustes de Estoque de Produtos Comerciais (Frontend).
 * 
 * Funcionalidades:
 * - Visão geral de saldos, valor total em estoque e alertas de reposição.
 * - Registro de movimentações de estoque (Entrada de mercadorias, Saída, Perda/Avaria, Inventário).
 * - Exigência de justificativa obrigatória para qualquer ajuste manual de saldo.
 * - Trilha cronológica de auditoria das movimentações por produto com registro do operador responsável.
 */

"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import {
  ModuloProdutosDesativado,
  useModuloProdutosAtivo,
} from "../ModuloProdutosGuard";

type Produto = {
  id: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  salePrice?: number | string | null;
  costPrice?: number | string | null;
  taxPercent?: number | string | null;
  stockQuantity?: number | string | null;
  minStock?: number | string | null;
  isActive?: boolean;
};

type Movimento = {
  id: string;
  type: string;
  quantity: number;
  previousStock: number | null;
  newStock: number | null;
  reason?: string | null;
  userName?: string | null;
  createdAt: string;
};

type EstoqueResponse = {
  message?: string;
  produto?: Produto;
  movimentos?: Movimento[];
};

type ProdutosResponse = {
  message?: string;
  produtos?: Produto[];
};

import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, formatarDataHora, inteiro } from "@/lib/formatadores";
import { inputClass } from "@/lib/uiConstantes";

const selectClass = inputClass;

const TIPOS_MOVIMENTO = [
  {
    value: "ENTRADA",
    label: "Entrada",
    detalhe: "Soma quantidade ao estoque atual.",
  },
  {
    value: "SAIDA",
    label: "Saída manual",
    detalhe: "Retira quantidade do estoque atual.",
  },
  {
    value: "AJUSTE",
    label: "Ajuste exato",
    detalhe: "Define o estoque final exato. Zero = sem estoque.",
  },
];

function numero(valor: unknown) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function imagemProdutoUrl(url?: string | null) {
  const valor = String(url || "").trim();

  if (!valor) return "";

  if (valor.startsWith("/api/api/uploads/produtos/")) {
    return valor.replace("/api/api/uploads/produtos/", "/api/uploads/produtos/");
  }

  if (valor.startsWith("/api/upload/produtos/")) {
    return valor.replace("/api/upload/produtos/", "/api/uploads/produtos/");
  }

  if (valor.startsWith("/uploads/produtos/")) {
    return valor.replace("/uploads/produtos/", "/api/uploads/produtos/");
  }

  return valor;
}

function nomeTipoMovimento(tipo: string) {
  const nomes: Record<string, string> = {
    ENTRADA: "Entrada",
    SAIDA: "Saída",
    AJUSTE: "Ajuste",
    VENDA: "Venda",
    CANCELAMENTO_VENDA: "Cancelamento de venda",
  };

  return nomes[tipo] || tipo || "-";
}

function classeMovimento(tipo: string) {
  if (tipo === "ENTRADA" || tipo === "CANCELAMENTO_VENDA") {
    return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30";
  }

  if (tipo === "SAIDA" || tipo === "VENDA") {
    return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30";
  }

  return "bg-blue-50 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30";
}

function textoEstoque(produto?: Produto | null) {
  if (produto?.stockQuantity === null) return "Ilimitado";

  const estoque = inteiro(produto?.stockQuantity);

  if (estoque === 0) return "Sem estoque";

  return `${estoque} un.`;
}

function produtoEstoqueBaixo(produto: Produto) {
  if (produto.stockQuantity === null) return false;

  const estoque = inteiro(produto.stockQuantity);
  const minimo = inteiro(produto.minStock);

  return minimo > 0 && estoque < minimo;
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

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>

      <strong className={`mt-2 block text-3xl font-black leading-tight ${cor}`}>
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
 * Componente principal da Tela de Gestão de Estoque Comercial.
 * 
 * Gerencia a lista de saldos, filtros de criticidade, modal de ajuste rápido
 * e gaveta com histórico detalhado de movimentações do produto selecionado.
 */
export default function EstoqueProdutosPage() {
  const { carregando: carregandoPermissoes, tem } =
    useUsuarioPermissoes();

  const { carregandoModuloProdutos, moduloProdutosAtivo } =
    useModuloProdutosAtivo();

  const podeVer = !carregandoPermissoes && tem(["estoque.ver", "produtos.ver"]);
  const podeAjustar = !carregandoPermissoes && tem("estoque.ajustar");
  const podeEditarProduto = !carregandoPermissoes && tem("produtos.editar");
  const podeExcluirProduto = !carregandoPermissoes && tem("produtos.excluir");

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<Produto | null>(
    null
  );
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);

  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("ENTRADA");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [textoConfirmacao, setTextoConfirmacao] = useState("");

  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return produtos;

    return produtos.filter((produto) => {
      const base = [
        produto.name,
        produto.sku,
        produto.category,
        produto.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return base.includes(termo);
    });
  }, [busca, produtos]);

  const totalProdutos = produtos.length;

  const produtosControlados = produtos.filter(
    (produto) => produto.stockQuantity !== null
  ).length;

  const produtosIlimitados = produtos.filter(
    (produto) => produto.stockQuantity === null
  ).length;

  const produtosBaixoEstoque = produtos.filter(produtoEstoqueBaixo).length;

  async function carregarProdutos() {
    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch("/api/produtos?status=TODOS", {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | ProdutosResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar produtos.");
        setProdutos([]);
        return;
      }

      const lista = Array.isArray(data?.produtos) ? data.produtos : [];

      setProdutos(lista);

      if (!produtoSelecionado && lista.length > 0) {
        selecionarProduto(lista[0]);
      }
    } catch {
      setMensagem("Erro ao carregar produtos.");
      setProdutos([]);
    } finally {
      setCarregando(false);
    }
  }

  async function selecionarProduto(produto: Produto) {
    try {
      setProdutoSelecionado(produto);
      setMensagem("");
      setMovimentos([]);

      const response = await fetch(`/api/produtos/${produto.id}/estoque`, {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | EstoqueResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar histórico do estoque.");
        return;
      }

      if (data?.produto) {
        setProdutoSelecionado(data.produto);
      }

      setMovimentos(Array.isArray(data?.movimentos) ? data.movimentos : []);
    } catch {
      setMensagem("Erro ao carregar histórico do estoque.");
    }
  }

  async function ajustarEstoque() {
    if (!produtoSelecionado) {
      setMensagem("Selecione um produto.");
      return;
    }

    if (!motivo.trim()) {
      setMensagem("Informe o motivo da movimentação.");
      return;
    }

    try {
      setSalvando(true);
      setMensagem("");

      const response = await fetch(
        `/api/produtos/${produtoSelecionado.id}/estoque`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: tipo,
            quantity: Number(quantidade || 0),
            reason: motivo,
          }),
        }
      );

      const data = (await response.json().catch(() => null)) as
        | EstoqueResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao ajustar estoque.");
        return;
      }

      setMensagem(data?.message || "Estoque atualizado com sucesso.");
      setMotivo("");
      setQuantidade("1");

      await carregarProdutos();

      const produtoAtualizado = data?.produto || produtoSelecionado;
      await selecionarProduto(produtoAtualizado);
    } catch {
      setMensagem("Erro ao ajustar estoque.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterarStatusProduto(ativo: boolean) {
    if (!produtoSelecionado) return;

    try {
      setSalvando(true);
      setMensagem("");

      const response = await fetch(`/api/produtos/${produtoSelecionado.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: produtoSelecionado.name,
          sku: produtoSelecionado.sku || "",
          category: produtoSelecionado.category || "",
          description: produtoSelecionado.description || "",
          imageUrl: produtoSelecionado.imageUrl || "",
          salePrice: numero(produtoSelecionado.salePrice),
          costPrice: numero(produtoSelecionado.costPrice),
          taxPercent: numero(produtoSelecionado.taxPercent),
          unlimitedStock: produtoSelecionado.stockQuantity === null,
          ...(produtoSelecionado.stockQuantity === null
            ? {}
            : { stockQuantity: produtoSelecionado.stockQuantity }),
          minStock: inteiro(produtoSelecionado.minStock),
          isActive: ativo,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao alterar status do produto.");
        return;
      }

      setMensagem(ativo ? "Produto reativado com sucesso." : "Produto inativado com sucesso.");

      await carregarProdutos();

      if (data?.produto) {
        await selecionarProduto(data.produto);
      }
    } catch {
      setMensagem("Erro ao alterar status do produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirDefinitivamente() {
    if (!produtoSelecionado) return;

    if (textoConfirmacao.trim().toUpperCase() !== "EXCLUIR") {
      setMensagem("Digite EXCLUIR para confirmar a exclusão definitiva.");
      return;
    }

    try {
      setSalvando(true);
      setMensagem("");

      const response = await fetch(
        `/api/produtos/${produtoSelecionado.id}/excluir-definitivo`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmacao: "EXCLUIR",
          }),
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao excluir produto.");
        return;
      }

      setMensagem(
        `${data?.message || "Produto excluído definitivamente."} Itens removidos: ${
          data?.itensRemovidos || 0
        }. Vendas apagadas: ${data?.vendasApagadas || 0}. Vendas recalculadas: ${
          data?.vendasRecalculadas || 0
        }.`
      );

      setConfirmandoExclusao(false);
      setTextoConfirmacao("");
      setProdutoSelecionado(null);
      setMovimentos([]);

      await carregarProdutos();
    } catch {
      setMensagem("Erro ao excluir produto.");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes || carregandoModuloProdutos) return;

    if (podeVer && moduloProdutosAtivo) {
      carregarProdutos();
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
          Carregando estoque...
        </section>
      </main>
    );
  }

  if (!moduloProdutosAtivo) {
    return (
      <ModuloProdutosDesativado
        titulo="Estoque desativado"
        descricao="O módulo de produtos e controle de estoque está desativado nas configurações do sistema."
      />
    );
  }

  if (!podeVer) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar o estoque.
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
                Controle de estoque
              </h1>

              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Faça entrada, saída manual, ajuste exato, inativação e exclusão
                definitiva de produtos com histórico de movimentação.
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
                href="/produtos/novo"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                Novo produto
              </Link>
            </div>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CardResumo titulo="Produtos" valor={totalProdutos} />
          <CardResumo
            titulo="Controlados"
            valor={produtosControlados}
            destaque="blue"
          />
          <CardResumo
            titulo="Ilimitados"
            valor={produtosIlimitados}
            destaque="green"
          />
          <CardResumo
            titulo="Estoque baixo"
            valor={produtosBaixoEstoque}
            destaque={produtosBaixoEstoque > 0 ? "orange" : "slate"}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <aside className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Produtos</p>

              <h2 className="text-2xl font-black tracking-tight">
                Selecionar produto
              </h2>
            </div>

            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por nome, SKU ou categoria..."
              className={inputClass}
            />

            <div className="mt-4 max-h-[720px] space-y-3 overflow-auto pr-1">
              {produtosFiltrados.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                  Nenhum produto encontrado.
                </p>
              ) : (
                produtosFiltrados.map((produto) => {
                  const selecionado = produtoSelecionado?.id === produto.id;
                  const baixo = produtoEstoqueBaixo(produto);

                  return (
                    <button
                      key={produto.id}
                      type="button"
                      onClick={() => selecionarProduto(produto)}
                      className={`w-full rounded-2xl p-4 text-left ring-1 transition ${
                        selecionado
                          ? "bg-blue-50 ring-blue-300"
                          : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800">
                          {produto.imageUrl ? (
                            <img
                              src={imagemProdutoUrl(produto.imageUrl)}
                              alt={produto.name}
                              className="h-full w-full object-cover"
                              onError={(event) => {
                                event.currentTarget.style.visibility = "hidden";
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xl">
                              📦
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm font-black text-slate-900 dark:text-white">
                            {produto.name}
                          </p>

                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                            {produto.category || "Sem categoria"} |{" "}
                            {formatarMoeda(produto.salePrice)}
                          </p>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 ${
                                produto.isActive === false
                                  ? "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
                                  : "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                              }`}
                            >
                              {produto.isActive === false ? "Inativo" : "Ativo"}
                            </span>

                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 ${
                                baixo
                                  ? "bg-orange-50 text-orange-700 dark:text-orange-400 dark:bg-orange-900/30 dark:text-orange-400 ring-orange-200 dark:ring-orange-500/30"
                                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-800"
                              }`}
                            >
                              Estoque: {textoEstoque(produto)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="space-y-5">
            {!produtoSelecionado ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                Selecione um produto para movimentar o estoque.
              </div>
            ) : (
              <>
                <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-800">
                        {produtoSelecionado.imageUrl ? (
                          <img
                            src={imagemProdutoUrl(produtoSelecionado.imageUrl)}
                            alt={produtoSelecionado.name}
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.visibility = "hidden";
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-3xl">
                            📦
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-bold text-blue-600">
                          Produto selecionado
                        </p>

                        <h2 className="mt-1 text-2xl font-black tracking-tight">
                          {produtoSelecionado.name}
                        </h2>

                        <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {produtoSelecionado.category || "Sem categoria"} | SKU:{" "}
                          {produtoSelecionado.sku || "-"}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-800">
                            Venda: {formatarMoeda(produtoSelecionado.salePrice)}
                          </span>

                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                            Estoque: {textoEstoque(produtoSelecionado)}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                              produtoSelecionado.isActive === false
                                ? "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
                                : "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                            }`}
                          >
                            {produtoSelecionado.isActive === false
                              ? "Inativo"
                              : "Ativo"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {podeEditarProduto && (
                        <Link
                          href={`/produtos/novo?id=${produtoSelecionado.id}`}
                          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                        >
                          Editar
                        </Link>
                      )}

                      {podeEditarProduto &&
                        (produtoSelecionado.isActive === false ? (
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => alterarStatusProduto(true)}
                            className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            Reativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => alterarStatusProduto(false)}
                            className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white hover:bg-orange-600 disabled:opacity-60"
                          >
                            Inativar
                          </button>
                        ))}

                      {podeExcluirProduto && (
                        <button
                          type="button"
                          disabled={salvando}
                          onClick={() => {
                            setConfirmandoExclusao(true);
                            setTextoConfirmacao("");
                          }}
                          className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </section>

                {podeAjustar && produtoSelecionado.stockQuantity !== null && (
                  <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                    <div className="mb-5">
                      <p className="text-sm font-bold text-blue-600">
                        Movimentação
                      </p>

                      <h2 className="text-2xl font-black tracking-tight">
                        Ajustar estoque
                      </h2>

                      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        Entrada soma. Saída retira. Ajuste define o estoque final.
                        No ajuste, zero significa sem estoque.
                      </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1fr_160px_1.4fr_auto] lg:items-end">
                      <div>
                        <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                          Tipo
                        </label>

                        <select
                          value={tipo}
                          onChange={(event) => setTipo(event.target.value)}
                          disabled={salvando}
                          className={selectClass}
                        >
                          {TIPOS_MOVIMENTO.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>

                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {
                            TIPOS_MOVIMENTO.find((item) => item.value === tipo)
                              ?.detalhe
                          }
                        </p>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                          Quantidade
                        </label>

                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={quantidade}
                          onChange={(event) => setQuantidade(event.target.value)}
                          disabled={salvando}
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                          Motivo
                        </label>

                        <input
                          value={motivo}
                          onChange={(event) => setMotivo(event.target.value)}
                          disabled={salvando}
                          placeholder="Ex.: compra, conferência, perda, correção..."
                          className={inputClass}
                        />
                      </div>

                      <button
                        type="button"
                        disabled={salvando}
                        onClick={ajustarEstoque}
                        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {salvando ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </section>
                )}

                {podeAjustar && produtoSelecionado.stockQuantity === null && (
                  <section className="rounded-3xl bg-blue-50 p-6 shadow-sm ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                    <h2 className="text-xl font-black text-blue-900">
                      Estoque ilimitado
                    </h2>
                    <p className="mt-2 text-sm font-semibold leading-6 text-blue-800">
                      Produtos ilimitados não aceitam movimentação física. Edite
                      o produto e converta-o para estoque controlado antes de
                      registrar entradas, saídas ou ajustes.
                    </p>
                  </section>
                )}

                {confirmandoExclusao && (
                  <section className="rounded-3xl bg-red-50 p-6 shadow-sm ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
                    <h2 className="text-2xl font-black tracking-tight text-red-800">
                      Excluir produto definitivamente?
                    </h2>

                    <p className="mt-3 text-sm font-bold leading-6 text-red-700 dark:text-red-400">
                      Esta ação não é igual a inativar. Excluir definitivamente
                      remove o produto, remove movimentações de estoque e também
                      retira esse produto das vendas antigas. Isso altera os
                      relatórios mensais de produtos. Se uma venda tinha somente
                      esse produto, a venda será apagada do relatório. Se tinha
                      outros produtos, a venda será recalculada sem este produto.
                    </p>

                    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
                      <div>
                        <label className="mb-1 block text-sm font-black text-red-800">
                          Digite EXCLUIR para confirmar
                        </label>

                        <input
                          value={textoConfirmacao}
                          onChange={(event) =>
                            setTextoConfirmacao(event.target.value)
                          }
                          className="w-full rounded-xl border border-red-300 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-red-700 dark:text-red-400 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
                        />
                      </div>

                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => {
                          setConfirmandoExclusao(false);
                          setTextoConfirmacao("");
                        }}
                        className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:opacity-60"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        disabled={salvando}
                        onClick={excluirDefinitivamente}
                        className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        Excluir definitivamente
                      </button>
                    </div>
                  </section>
                )}

                <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="mb-5">
                    <p className="text-sm font-bold text-blue-600">
                      Histórico
                    </p>

                    <h2 className="text-2xl font-black tracking-tight">
                      Movimentações do estoque
                    </h2>

                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      Últimas movimentações: entrada, saída, ajuste, venda e
                      cancelamento.
                    </p>
                  </div>

                  {movimentos.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-center text-sm font-bold text-slate-500 dark:text-slate-400">
                      Nenhuma movimentação encontrada.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {movimentos.map((movimento) => (
                        <article
                          key={movimento.id}
                          className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-black ring-1 ${classeMovimento(
                                  movimento.type
                                )}`}
                              >
                                {nomeTipoMovimento(movimento.type)}
                              </span>

                              <p className="mt-2 text-sm font-black text-slate-900 dark:text-white">
                                {movimento.reason || "Sem motivo informado"}
                              </p>

                              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {formatarDataHora(movimento.createdAt)} |{" "}
                                Operador: {movimento.userName || "Sistema"}
                              </p>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                              <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p>Antes</p>
                                <strong className="mt-1 block text-base text-slate-900 dark:text-white">
                                  {movimento.previousStock === null
                                    ? "∞"
                                    : movimento.previousStock}
                                </strong>
                              </div>

                              <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p>Mov.</p>
                                <strong
                                  className={`mt-1 block text-base ${
                                    movimento.quantity >= 0
                                      ? "text-green-700 dark:text-green-400"
                                      : "text-red-700 dark:text-red-400"
                                  }`}
                                >
                                  {movimento.quantity > 0
                                    ? `+${movimento.quantity}`
                                    : movimento.quantity}
                                </strong>
                              </div>

                              <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p>Depois</p>
                                <strong className="mt-1 block text-base text-slate-900 dark:text-white">
                                  {movimento.newStock === null
                                    ? "∞"
                                    : movimento.newStock}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
