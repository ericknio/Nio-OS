"use client";

import { useRef, useState } from "react";

type ItemOS = {
  id: string;
  technicalPartId: string;
  partNameSnapshot: string;
  partSkuSnapshot: string | null;
  unitPriceSnapshot: number | string;
  quantity: number;
  totalPriceSnapshot: number | string;
  state: "RESERVED" | "CONSUMED" | "RELEASED" | "REVERSED";
  technicalPart: { version: number };
};

type PecaBusca = {
  id: string;
  name: string;
  sku: string | null;
  defaultSalePrice: number;
  quantityOnHand: number | null;
  quantityReserved: number;
  quantityAvailable: number | null;
  version: number;
  alreadyActive: boolean;
};

type Tentativa = {
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  fingerprint: string;
  body: string;
  key: string;
};

type Props = {
  ordemId: string;
  itens: ItemOS[];
  bloqueadoPorPagamento: boolean;
  finalizada: boolean;
  statusOrdem: string;
  valorPecasAtual: number | string | null;
  aoAlterar: () => Promise<void> | void;
};

const STATUS_MUTAVEIS = new Set([
  "RECEBIDO",
  "EM_ANALISE",
  "AGUARDANDO_PECA",
  "EM_REPARO",
]);

function moeda(valor: unknown) {
  const n = Number(valor ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function inteiroPositivo(valor: string, campo: string) {
  const n = Number(valor);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${campo} deve ser um número inteiro maior que zero.`);
  }
  return n;
}

function saldo(item: PecaBusca) {
  return item.quantityOnHand === null
    ? "Ilimitado"
    : `${item.quantityAvailable ?? 0} disponível(is)`;
}

export default function GerenciarPecasTecnicasOS({
  ordemId,
  itens,
  bloqueadoPorPagamento,
  finalizada,
  statusOrdem,
  valorPecasAtual,
  aoAlterar,
}: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<PecaBusca[]>([]);
  const [peca, setPeca] = useState<PecaBusca | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [item, setItem] = useState<ItemOS | null>(null);
  const [novaQuantidade, setNovaQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const lock = useRef(false);
  const tentativaRef = useRef<Tentativa | null>(null);

  const mutavel =
    STATUS_MUTAVEIS.has(statusOrdem) &&
    !finalizada &&
    !bloqueadoPorPagamento;

  function limparTentativa() {
    tentativaRef.current = null;
  }

  async function buscar() {
    if (!mutavel) return;

    try {
      setBuscando(true);
      setMensagem("");
      const params = new URLSearchParams();
      if (busca.trim()) params.set("q", busca.trim());

      const response = await fetch(
        `/api/ordens/${ordemId}/pecas-tecnicas?${params.toString()}`,
        { cache: "no-store", credentials: "same-origin" },
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

  async function escrever(
    url: string,
    method: Tentativa["method"],
    fingerprint: string,
    payload: unknown,
  ) {
    if (lock.current) return false;

    const body = JSON.stringify(payload);
    let tentativa = tentativaRef.current;

    if (
      !tentativa ||
      tentativa.url !== url ||
      tentativa.method !== method ||
      tentativa.fingerprint !== fingerprint ||
      tentativa.body !== body
    ) {
      if (!globalThis.crypto?.randomUUID) {
        setMensagem(
          "Não foi possível iniciar a operação com segurança. Recarregue a página.",
        );
        return false;
      }

      tentativa = {
        url,
        method,
        fingerprint,
        body,
        key: globalThis.crypto.randomUUID(),
      };
      tentativaRef.current = tentativa;
    }

    lock.current = true;
    setSalvando(true);
    setMensagem("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(tentativa.url, {
        method: tentativa.method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.key,
        },
        body: tentativa.body,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status >= 500) {
          setMensagem(
            `${data?.message || "Falha temporária."} Tente novamente; a mesma tentativa segura será reutilizada.`,
          );
          return false;
        }

        tentativaRef.current = null;
        if (response.status === 409) await aoAlterar();
        setMensagem(data?.message || "Não foi possível concluir a operação.");
        return false;
      }

      tentativaRef.current = null;
      await aoAlterar();
      return true;
    } catch (error) {
      setMensagem(
        error instanceof DOMException && error.name === "AbortError"
          ? "A resposta demorou mais que o esperado. Tente novamente; a mesma tentativa segura será reutilizada."
          : "Não foi possível confirmar a resposta do servidor. Tente novamente; a mesma tentativa segura será reutilizada.",
      );
      return false;
    } finally {
      window.clearTimeout(timeout);
      lock.current = false;
      setSalvando(false);
    }
  }

  async function reservar() {
    if (!peca || !mutavel) return;

    try {
      const quantity = inteiroPositivo(quantidade, "Quantidade");
      if (peca.alreadyActive) {
        throw new Error("Esta peça já possui um item ativo nesta OS.");
      }
      if (
        peca.quantityAvailable !== null &&
        quantity > peca.quantityAvailable
      ) {
        throw new Error("A quantidade excede o estoque disponível.");
      }

      const temItemAtivo = itens.some((x) =>
        ["RESERVED", "CONSUMED"].includes(x.state),
      );
      const manual = Number(valorPecasAtual ?? 0);
      let confirmReplaceLegacyPartsCost = false;

      if (!temItemAtivo && Number.isFinite(manual) && manual > 0) {
        confirmReplaceLegacyPartsCost = window.confirm(
          `Esta OS possui ${moeda(manual)} informado manualmente em peças. Ao adicionar a primeira peça técnica, esse valor será substituído pela soma dos itens técnicos. Deseja continuar?`,
        );
        if (!confirmReplaceLegacyPartsCost) return;
      }

      const ok = await escrever(
        `/api/ordens/${ordemId}/pecas-tecnicas`,
        "POST",
        `reserve:${peca.id}`,
        {
          technicalPartId: peca.id,
          technicalPartVersion: peca.version,
          quantity,
          confirmReplaceLegacyPartsCost,
        },
      );

      if (!ok) return;
      setPeca(null);
      setQuantidade("1");
      setBusca("");
      setResultados([]);
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Dados inválidos.");
    }
  }

  function editarReserva(valor: ItemOS) {
    limparTentativa();
    setItem(valor);
    setNovaQuantidade(String(valor.quantity));
    setMotivo("");
    setMensagem("");
  }

  async function alterarQuantidade() {
    if (!item || !mutavel) return;

    try {
      const newQuantity = inteiroPositivo(novaQuantidade, "Nova quantidade");
      if (newQuantity === item.quantity) {
        throw new Error("Informe uma quantidade diferente da atual.");
      }
      const reason = motivo.trim();
      if (!reason) throw new Error("Informe o motivo da alteração.");

      const ok = await escrever(
        `/api/ordens/${ordemId}/pecas-tecnicas/${item.id}`,
        "PATCH",
        `change:${item.id}`,
        {
          technicalPartVersion: item.technicalPart.version,
          expectedQuantity: item.quantity,
          newQuantity,
          reason,
        },
      );

      if (ok) setItem(null);
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Dados inválidos.");
    }
  }

  async function liberar() {
    if (!item || !mutavel) return;

    const reason = motivo.trim();
    if (!reason) {
      setMensagem("Informe o motivo da liberação.");
      return;
    }

    if (
      !window.confirm(
        `Confirma liberar ${item.quantity} unidade(s) de "${item.partNameSnapshot}" desta OS?`,
      )
    ) {
      return;
    }

    const ok = await escrever(
      `/api/ordens/${ordemId}/pecas-tecnicas/${item.id}`,
      "DELETE",
      `release:${item.id}`,
      {
        technicalPartVersion: item.technicalPart.version,
        expectedQuantity: item.quantity,
        reason,
      },
    );

    if (ok) setItem(null);
  }

  if (!mutavel) {
    return (
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        <p className="text-sm font-bold text-blue-600">Estoque técnico</p>
        <h2 className="mt-1 text-2xl font-black tracking-tight">
          Gerenciar reservas
        </h2>
        <p className="mt-3 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
          {bloqueadoPorPagamento
            ? "Esta OS possui pagamento registrado. As reservas técnicas não podem ser alteradas."
            : finalizada
              ? "Esta OS está finalizada. As reservas técnicas não podem ser alteradas."
              : "O status atual da OS não permite adicionar, alterar ou liberar reservas técnicas."}
        </p>
      </section>
    );
  }

  const reservados = itens.filter((x) => x.state === "RESERVED");

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-5">
        <p className="text-sm font-bold text-blue-600">Estoque técnico</p>
        <h2 className="text-2xl font-black tracking-tight">
          Gerenciar reservas
        </h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          Adicione peças à OS enquanto o serviço está em andamento. Ao marcar
          como Pronto, as reservas são consumidas automaticamente.
        </p>
      </div>

      {mensagem && (
        <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
          {mensagem}
        </div>
      )}

      <div className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            value={busca}
            onChange={(event) => {
              setBusca(event.target.value);
              limparTentativa();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") buscar();
            }}
            placeholder="Buscar por nome, SKU ou modelo..."
            className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
          <button
            type="button"
            disabled={buscando || salvando}
            onClick={buscar}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {buscando ? "Buscando..." : "Buscar peça"}
          </button>
        </div>

        {resultados.length > 0 && (
          <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
            {resultados.map((x) => (
              <button
                key={x.id}
                type="button"
                disabled={x.alreadyActive}
                onClick={() => {
                  limparTentativa();
                  setPeca(x);
                  setQuantidade("1");
                  setMensagem("");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-white dark:bg-slate-900 p-3 text-left ring-1 ring-blue-100 hover:bg-blue-100/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                    {x.name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    SKU: {x.sku || "-"} • {saldo(x)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-black text-green-700 dark:text-green-400">
                    {moeda(x.defaultSalePrice)}
                  </p>
                  {x.alreadyActive && (
                    <p className="text-[11px] font-black text-orange-700 dark:text-orange-400">
                      Já vinculada
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {peca && (
          <div className="mt-4 rounded-xl bg-white dark:bg-slate-900 p-4 ring-1 ring-blue-200">
            <p className="text-sm font-black text-slate-900 dark:text-white">
              Reservar: {peca.name}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {saldo(peca)} • Valor unitário da OS: {moeda(peca.defaultSalePrice)}
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label>
                <span className="mb-1 block text-xs font-black text-slate-600 dark:text-slate-400">
                  Quantidade
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantidade}
                  disabled={salvando}
                  onChange={(event) => {
                    setQuantidade(event.target.value);
                    limparTentativa();
                  }}
                  className="w-32 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <button
                type="button"
                disabled={salvando}
                onClick={reservar}
                className="rounded-xl bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700 disabled:opacity-50"
              >
                {salvando ? "Reservando..." : "Adicionar à OS"}
              </button>
              <button
                type="button"
                disabled={salvando}
                onClick={() => {
                  limparTentativa();
                  setPeca(null);
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-3 text-sm font-black text-slate-700 dark:text-slate-200">
          Reservas atuais ({reservados.length})
        </p>
        {reservados.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Nenhuma peça reservada no momento.
          </p>
        ) : (
          <div className="space-y-2">
            {reservados.map((x) => (
              <div
                key={x.id}
                className="flex flex-col gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {x.partNameSnapshot}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    SKU: {x.partSkuSnapshot || "-"} • Qtd.: {x.quantity} • Unitário: {moeda(x.unitPriceSnapshot)} • Subtotal: {moeda(x.totalPriceSnapshot)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => editarReserva(x)}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Alterar reserva
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {item && (
        <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-black text-blue-900">
            Reserva: {item.partNameSnapshot}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr]">
            <label>
              <span className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Nova quantidade
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={novaQuantidade}
                disabled={salvando}
                onChange={(event) => {
                  setNovaQuantidade(event.target.value);
                  limparTentativa();
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label>
              <span className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Motivo *
              </span>
              <input
                value={motivo}
                maxLength={1000}
                disabled={salvando}
                onChange={(event) => {
                  setMotivo(event.target.value);
                  limparTentativa();
                }}
                placeholder="Ex.: correção da quantidade necessária."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={salvando}
              onClick={alterarQuantidade}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Salvar quantidade
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={liberar}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
            >
              Liberar reserva
            </button>
            <button
              type="button"
              disabled={salvando}
              onClick={() => {
                limparTentativa();
                setItem(null);
                setMotivo("");
              }}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
