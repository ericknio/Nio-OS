"use client";

import { useState } from "react";

export type PecaNovaOSSelecionada = {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  compatibleModel: string | null;
  defaultSalePrice: number;
  quantityOnHand: number | null;
  quantityReserved: number;
  quantityAvailable: number | null;
  version: number;
  quantity: number;
};

type PecaCatalogo = Omit<PecaNovaOSSelecionada, "quantity">;

type Props = {
  itens: PecaNovaOSSelecionada[];
  onChange: (itens: PecaNovaOSSelecionada[]) => void;
  onSelecionarPeca: (peca: PecaNovaOSSelecionada) => void;
  disabled?: boolean;
};

function moeda(valor: unknown) {
  const numero = Number(valor ?? 0);
  return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function estoque(peca: PecaCatalogo | PecaNovaOSSelecionada) {
  if (peca.quantityOnHand === null) return "Ilimitado";
  return `${peca.quantityAvailable ?? 0} disponível(is)`;
}

export default function PecasNovaOS({
  itens,
  onChange,
  onSelecionarPeca,
  disabled = false,
}: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<PecaCatalogo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  async function buscar() {
    try {
      setBuscando(true);
      setMensagem("");

      const params = new URLSearchParams();
      if (busca.trim()) params.set("q", busca.trim());

      const response = await fetch(
        `/api/ordens/nova/pecas-tecnicas?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setResultados([]);
        setMensagem(data?.message || "Erro ao buscar peças técnicas.");
        return;
      }

      setResultados(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setResultados([]);
      setMensagem("Erro ao buscar peças técnicas.");
    } finally {
      setBuscando(false);
    }
  }

  function adicionar(peca: PecaCatalogo) {
    if (itens.some((item) => item.id === peca.id)) {
      setMensagem("Esta peça já foi adicionada à OS.");
      return;
    }

    if (peca.quantityAvailable !== null && peca.quantityAvailable <= 0) {
      setMensagem("Esta peça está sem estoque disponível.");
      return;
    }

    const nova: PecaNovaOSSelecionada = {
      ...peca,
      quantity: 1,
    };

    onChange([...itens, nova]);
    onSelecionarPeca(nova);
    setMensagem("");
  }

  function alterarQuantidade(id: string, valor: string) {
    const quantidade = Number(valor);
    const atual = itens.find((item) => item.id === id);
    if (!atual) return;

    if (!Number.isSafeInteger(quantidade) || quantidade <= 0) return;
    if (
      atual.quantityAvailable !== null &&
      quantidade > atual.quantityAvailable
    ) {
      setMensagem("A quantidade informada excede o estoque disponível.");
      return;
    }

    setMensagem("");
    onChange(
      itens.map((item) =>
        item.id === id ? { ...item, quantity: quantidade } : item,
      ),
    );
  }

  function remover(id: string) {
    setMensagem("");
    onChange(itens.filter((item) => item.id !== id));
  }

  const total = itens.reduce(
    (soma, item) => soma + item.defaultSalePrice * item.quantity,
    0,
  );

  return (
    <section className="rounded-2xl bg-blue-50/80 p-5 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-500/30">
      <div>
        <p className="text-sm font-black text-blue-900 dark:text-blue-200">
          Peças do estoque técnico
        </p>
        <p className="mt-1 text-xs font-semibold leading-5 text-blue-700 dark:text-blue-300">
          Busque pelo nome da peça (ex: tela, conector, bateria), modelo ou SKU para preencher marca e modelo do aparelho automaticamente.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={busca}
          disabled={disabled}
          onChange={(event) => setBusca(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              buscar();
            }
          }}
          placeholder="Buscar peça (ex: tela moto g22, conector a10, bateria...)"
          className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-900/40 disabled:bg-slate-100 dark:disabled:bg-slate-800"
        />
        <button
          type="button"
          disabled={disabled || buscando}
          onClick={buscar}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {buscando ? "Buscando..." : "Buscar peça"}
        </button>
      </div>

      {mensagem && (
        <p className="mt-3 rounded-xl bg-white dark:bg-slate-900 p-3 text-sm font-bold text-red-700 dark:text-red-400 ring-1 ring-red-200">
          {mensagem}
        </p>
      )}

      {resultados.length > 0 && (
        <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
          {resultados.map((peca) => {
            const adicionada = itens.some((item) => item.id === peca.id);
            const indisponivel =
              peca.quantityAvailable !== null && peca.quantityAvailable <= 0;

            return (
              <div
                key={peca.id}
                className="flex flex-col gap-3 rounded-xl bg-white dark:bg-slate-900 p-4 ring-1 ring-blue-100 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                    {peca.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    SKU: {peca.sku || "-"} • {peca.brand || "Sem marca"} •{" "}
                    {peca.compatibleModel || "Modelo não informado"}
                  </p>
                  <p className="mt-1 text-xs font-bold text-blue-700 dark:text-blue-400">
                    {estoque(peca)} • Venda: {moeda(peca.defaultSalePrice)}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={disabled || adicionada || indisponivel}
                  onClick={() => adicionar(peca)}
                  className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adicionada
                    ? "Adicionada"
                    : indisponivel
                      ? "Sem estoque"
                      : "Adicionar"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {itens.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-black text-slate-900 dark:text-white">
            Peças selecionadas
          </p>

          {itens.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-xl bg-white dark:bg-slate-900 p-4 ring-1 ring-blue-100 md:grid-cols-[1fr_120px_140px_auto] md:items-end"
            >
              <div>
                <p className="text-sm font-black text-slate-900 dark:text-white">{item.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {item.brand || "Sem marca"} •{" "}
                  {item.compatibleModel || "Modelo não informado"} •{" "}
                  {estoque(item)}
                </p>
              </div>

              <label>
                <span className="mb-1 block text-xs font-black text-slate-600 dark:text-slate-400">
                  Quantidade
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity}
                  disabled={disabled}
                  onChange={(event) =>
                    alterarQuantidade(item.id, event.target.value)
                  }
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 dark:bg-slate-800"
                />
              </label>

              <div>
                <p className="mb-1 text-xs font-black text-slate-600 dark:text-slate-400">
                  Subtotal
                </p>
                <div className="rounded-xl bg-green-50 px-3 py-2.5 text-sm font-black text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
                  {moeda(item.defaultSalePrice * item.quantity)}
                </div>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={() => remover(item.id)}
                className="rounded-xl border border-red-200 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-black text-red-700 dark:text-red-400 hover:bg-red-50 disabled:opacity-50"
              >
                Remover
              </button>
            </div>
          ))}

          <div className="flex justify-end">
            <div className="rounded-xl bg-slate-950 px-4 py-3 text-white">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
                Total das peças
              </p>
              <strong className="text-lg">{moeda(total)}</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
