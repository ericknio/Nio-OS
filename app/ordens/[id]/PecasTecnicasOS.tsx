/**
 * @file app/ordens/[id]/PecasTecnicasOS.tsx
 * @description Componente de Visualização e Estorno de Peças Técnicas da O.S.
 * 
 * Funcionalidades:
 * - Exibe a lista de peças associadas à O.S. com badges de estado (Reservada, Consumida, Liberada, Estornada).
 * - Fornece fluxo seguro de estorno de peças consumidas (ex: peça com defeito trocada na bancada).
 * - Suporta devolução física ao estoque com recalculo de custos e registro na trilha de auditoria.
 * - Proteção por bloqueio de pagamento e trava contra duplo envio via chave de idempotência.
 */

"use client";

import { useRef, useState } from "react";

type PecaTecnicaOS = {
  id: string;
  technicalPartId: string;
  partNameSnapshot: string;
  partSkuSnapshot: string | null;
  unitPriceSnapshot: number | string;
  quantity: number;
  totalPriceSnapshot: number | string;
  state: "RESERVED" | "CONSUMED" | "RELEASED" | "REVERSED";
  consumedAt: string | null;
  reversedAt: string | null;
  responsibleUserNameSnapshot: string;
  technicalPart: {
    version: number;
  };
};

type TentativaEstorno = {
  key: string;
  itemId: string;
  technicalPartVersion: number;
  expectedQuantity: number;
  reason: string;
};

type Props = {
  ordemId: string;
  itens: PecaTecnicaOS[];
  podeEstornar: boolean;
  bloqueadoPorPagamento: boolean;
  finalizada: boolean;
  aoAlterar: () => Promise<void> | void;
};

const nomesEstado: Record<PecaTecnicaOS["state"], string> = {
  RESERVED: "Reservada",
  CONSUMED: "Consumida",
  RELEASED: "Liberada",
  REVERSED: "Estornada",
};

function moeda(valor: unknown) {
  const numero = Number(valor ?? 0);
  return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataHora(valor?: string | null) {
  if (!valor) return "-";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleString("pt-BR");
}

function classeEstado(estado: PecaTecnicaOS["state"]) {
  if (estado === "CONSUMED") {
    return "bg-orange-50 text-orange-700 dark:text-orange-400 dark:bg-orange-900/30 dark:text-orange-400 ring-orange-200 dark:ring-orange-500/30";
  }
  if (estado === "REVERSED") {
    return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30";
  }
  if (estado === "RELEASED") {
    return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200 dark:ring-slate-800";
  }
  return "bg-blue-50 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30";
}

/**
 * Componente que exibe a tabela de peças vinculadas e modal de estorno técnico.
 * 
 * @param props.ordemId - Identificador da ordem de serviço
 * @param props.itens - Lista de peças alocadas na O.S.
 * @param props.podeEstornar - Se o usuário logado tem permissão para estornar
 * @param props.bloqueadoPorPagamento - Flag de trava se já houver pagamento
 * @param props.finalizada - Se a ordem já foi encerrada
 * @param props.aoAlterar - Callback para atualizar a tela pai após o estorno
 */
export default function PecasTecnicasOS({
  ordemId,
  itens,
  podeEstornar,
  bloqueadoPorPagamento,
  finalizada,
  aoAlterar,
}: Props) {
  const [selecionada, setSelecionada] = useState<PecaTecnicaOS | null>(null);
  const [motivo, setMotivo] = useState("");
  const [retornoFisico, setRetornoFisico] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const requestLock = useRef(false);
  const tentativaRef = useRef<TentativaEstorno | null>(null);

  const consumidas = itens.filter((item) => item.state === "CONSUMED").length;

  function abrirEstorno(item: PecaTecnicaOS) {
    tentativaRef.current = null;
    setSelecionada(item);
    setMotivo("");
    setRetornoFisico(false);
    setMensagem("");
  }

  function fecharEstorno() {
    if (salvando) return;
    tentativaRef.current = null;
    setSelecionada(null);
    setMotivo("");
    setRetornoFisico(false);
    setMensagem("");
  }

  async function confirmarEstorno() {
    if (!selecionada || requestLock.current) return;

    const reason = motivo.trim();
    if (reason.length < 10) {
      setMensagem("Descreva melhor o motivo do estorno.");
      return;
    }
    if (reason.length > 1000) {
      setMensagem("O motivo deve ter no máximo 1000 caracteres.");
      return;
    }
    if (!retornoFisico) {
      setMensagem("Confirme que a peça retornou fisicamente ao estoque.");
      return;
    }

    const confirmou = window.confirm(
      `Confirma o estorno de ${selecionada.quantity} unidade(s) de "${selecionada.partNameSnapshot}"? A peça será devolvida fisicamente ao estoque.`,
    );
    if (!confirmou) return;

    let tentativa = tentativaRef.current;
    const version = selecionada.technicalPart.version;

    if (
      !tentativa ||
      tentativa.itemId !== selecionada.id ||
      tentativa.technicalPartVersion !== version ||
      tentativa.expectedQuantity !== selecionada.quantity ||
      tentativa.reason !== reason
    ) {
      if (
        !globalThis.crypto ||
        typeof globalThis.crypto.randomUUID !== "function"
      ) {
        setMensagem(
          "Não foi possível iniciar o estorno com segurança. Recarregue a página.",
        );
        return;
      }

      tentativa = {
        key: globalThis.crypto.randomUUID(),
        itemId: selecionada.id,
        technicalPartVersion: version,
        expectedQuantity: selecionada.quantity,
        reason,
      };
      tentativaRef.current = tentativa;
    }

    requestLock.current = true;
    setSalvando(true);
    setMensagem("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(
        `/api/ordens/${ordemId}/pecas-tecnicas/${tentativa.itemId}/estornar`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": tentativa.key,
          },
          body: JSON.stringify({
            technicalPartVersion: tentativa.technicalPartVersion,
            expectedQuantity: tentativa.expectedQuantity,
            physicalReturnConfirmed: true,
            confirmation: true,
            reason: tentativa.reason,
          }),
          signal: controller.signal,
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message = data?.message || "Erro ao estornar peça.";

        // Resultado de escrita pode ter ficado incerto em erro de rede/5xx.
        // A tentativa é preservada para que o retry use a MESMA chave e payload.
        if (response.status >= 500) {
          setMensagem(
            `${message} Tente novamente; a mesma tentativa segura será reutilizada.`,
          );
          return;
        }

        tentativaRef.current = null;
        if (response.status === 409) await aoAlterar();
        setMensagem(message);
        return;
      }

      tentativaRef.current = null;
      setSelecionada(null);
      setMotivo("");
      setRetornoFisico(false);
      await aoAlterar();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMensagem(
          "A resposta demorou mais que o esperado. Tente novamente; a mesma tentativa segura será reutilizada.",
        );
        return;
      }

      setMensagem(
        "Não foi possível confirmar a resposta do servidor. Tente novamente; a mesma tentativa segura será reutilizada.",
      );
    } finally {
      window.clearTimeout(timeout);
      requestLock.current = false;
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">Estoque técnico</p>
          <h2 className="text-2xl font-black tracking-tight">
            Peças vinculadas à OS
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Peças consumidas só voltam ao estoque por estorno manual após
            conferência do retorno físico.
          </p>
        </div>

        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-800">
          {itens.length} item(ns) • {consumidas} consumido(s)
        </span>
      </div>

      {mensagem && (
        <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
          {mensagem}
        </div>
      )}

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Nenhuma peça técnica vinculada a esta OS.
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => {
            const podeEstornarItem =
              item.state === "CONSUMED" &&
              podeEstornar &&
              !bloqueadoPorPagamento &&
              !finalizada;

            return (
              <article
                key={item.id}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-950 dark:text-slate-100">
                        {item.partNameSnapshot}
                      </strong>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${classeEstado(item.state)}`}
                      >
                        {nomesEstado[item.state]}
                      </span>
                    </div>

                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      SKU: {item.partSkuSnapshot || "-"} • Quantidade:{" "}
                      {item.quantity} • Unitário: {moeda(item.unitPriceSnapshot)}{" "}
                      • Subtotal: {moeda(item.totalPriceSnapshot)}
                    </p>

                    {item.state === "CONSUMED" && (
                      <p className="mt-1 text-xs font-semibold text-orange-700 dark:text-orange-400">
                        Consumida em {dataHora(item.consumedAt)}
                      </p>
                    )}

                    {item.state === "REVERSED" && (
                      <p className="mt-1 text-xs font-semibold text-green-700 dark:text-green-400">
                        Estornada em {dataHora(item.reversedAt)}
                      </p>
                    )}
                  </div>

                  {item.state === "CONSUMED" && (
                    <button
                      type="button"
                      disabled={!podeEstornarItem || salvando}
                      onClick={() => abrirEstorno(item)}
                      className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Estornar peça
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {bloqueadoPorPagamento && consumidas > 0 && (
        <p className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
          Esta OS possui pagamento registrado. O estorno técnico fica bloqueado
          para não alterar valores já consolidados.
        </p>
      )}

      {selecionada && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-sm font-black text-orange-800">
            Estorno manual: {selecionada.partNameSnapshot}
          </p>

          <p className="mt-1 text-sm font-semibold leading-6 text-orange-700 dark:text-orange-400">
            O estorno é integral para este item: {selecionada.quantity}{" "}
            unidade(s). Confirme somente depois de conferir fisicamente a peça.
          </p>

          <label className="mt-4 block text-sm font-black text-slate-700 dark:text-slate-200">
            Motivo do estorno *
          </label>
          <textarea
            value={motivo}
            maxLength={1000}
            rows={4}
            disabled={salvando}
            onChange={(event) => {
              setMotivo(event.target.value);
              tentativaRef.current = null;
              setMensagem("");
            }}
            className="mt-1 w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100 dark:bg-slate-800"
            placeholder="Ex.: peça retirada do aparelho e devolvida fisicamente ao estoque após cancelamento."
          />

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-white dark:bg-slate-900 p-4 ring-1 ring-orange-200">
            <input
              type="checkbox"
              checked={retornoFisico}
              disabled={salvando}
              onChange={(event) => {
                setRetornoFisico(event.target.checked);
                if (!event.target.checked) tentativaRef.current = null;
                setMensagem("");
              }}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm font-bold leading-6 text-slate-800 dark:text-slate-300">
              Confirmo que a peça retornou fisicamente ao estoque e foi
              conferida.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={salvando || !retornoFisico || motivo.trim().length < 10}
              onClick={confirmarEstorno}
              className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando ? "Estornando..." : "Confirmar estorno"}
            </button>

            <button
              type="button"
              disabled={salvando}
              onClick={fecharEstorno}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
