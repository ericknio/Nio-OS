/**
 * @file app/ordens/[id]/pagamento/page.tsx
 * @description Tela de Recebimento e Registro de Pagamento da O.S. (Frontend).
 * 
 * Funcionalidades:
 * - Registro de pagamentos parciais (sinais de entrada para compra de peças) ou liquidação total (100%).
 * - Métodos suportados: PIX, Dinheiro, Cartão e Parcelado.
 * - Recálculo em tempo real do percentual pago, valor já quitado e saldo restante.
 * - Exibição da tabela histórica com todos os lançamentos financeiros vinculados à ordem.
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CardMensagem from "@/app/components/CardMensagem";
import {
  formatarMoeda,
  formatarNumeroOS,
  formatarDataHora,
  numeroSeguro,
} from "@/lib/formatadores";
import {
  nomesStatus,
  nomesPagamento,
  inputClass,
  textareaClass,
} from "@/lib/uiConstantes";

type FormaPagamento = "PIX" | "DINHEIRO" | "CARTAO" | "PARCELADO";

type PagamentoRegistrado = {
  id: string;
  amount: number | string;
  percent: number;
  paymentMethod: string;
  note?: string | null;
  userName: string;
  createdAt: string;
};

type OrdemPagamento = {
  id: string;
  osNumber?: number | string | null;
  totalAmount?: number | string | null;
  paymentMethod?: string | null;
  paymentPercent?: number | string | null;
  paidAmount?: number | string | null;
  status: string;
  finalization?: unknown | null;
  customer?: {
    name?: string | null;
    whatsapp?: string | null;
  } | null;
  payments?: PagamentoRegistrado[];
};

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartão" },
  { value: "PARCELADO", label: "Parcelado" },
];

function formaPagamentoValida(valor: unknown): valor is FormaPagamento {
  return FORMAS_PAGAMENTO.some((forma) => forma.value === valor);
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
  destaque?: "green" | "blue" | "orange" | "slate" | "red";
}) {
  const cor =
    destaque === "green"
      ? "text-green-700 dark:text-green-400"
      : destaque === "blue"
        ? "text-blue-700 dark:text-blue-400"
        : destaque === "orange"
          ? "text-orange-700 dark:text-orange-400"
          : destaque === "red"
            ? "text-red-700 dark:text-red-400"
            : "text-slate-950 dark:text-slate-100";

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>
      <strong className={`mt-2 block text-2xl ${cor}`}>{valor}</strong>
      {detalhe && (
        <div className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          {detalhe}
        </div>
      )}
    </div>
  );
}

/**
 * Componente principal da Tela de Pagamento da O.S.
 * 
 * Gerencia o cálculo de parcelas/sinais, seleção de método financeiro
 * e envio do lançamento para a API de pagamentos da ordem.
 */
export default function PagamentoOrdemPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [ordem, setOrdem] = useState<OrdemPagamento | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<FormaPagamento>("PIX");
  const [paymentPercent, setPaymentPercent] = useState(100);
  const [note, setNote] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const totais = useMemo(() => {
    const total = Math.max(numeroSeguro(ordem?.totalAmount), 0);
    const percentualJaPago = Math.min(
      Math.max(numeroSeguro(ordem?.paymentPercent), 0),
      100
    );
    const valorJaPago = Math.max(numeroSeguro(ordem?.paidAmount), 0);
    const percentualRestante = Math.max(100 - percentualJaPago, 0);

    const percentualPagamento = Math.min(
      Math.max(numeroSeguro(paymentPercent), 0),
      percentualRestante
    );

    const valorPagamento = Number(
      ((total * percentualPagamento) / 100).toFixed(2)
    );

    const percentualDepois = Math.min(
      percentualJaPago + percentualPagamento,
      100
    );

    const valorTotalPagoDepois = Math.min(valorJaPago + valorPagamento, total);
    const valorRestanteDepois = Math.max(total - valorTotalPagoDepois, 0);

    return {
      total,
      percentualJaPago,
      valorJaPago,
      percentualRestante,
      percentualPagamento,
      valorPagamento,
      percentualDepois,
      valorTotalPagoDepois,
      valorRestanteDepois,
    };
  }, [ordem, paymentPercent]);

  const osCancelada = ordem?.status === "CANCELADO";
  const osFinalizada = ordem?.status === "ENTREGUE" || Boolean(ordem?.finalization);
  const pagamentoCompleto = totais.percentualJaPago >= 100;

  const podeRegistrar =
    Boolean(ordem) &&
    !osCancelada &&
    !osFinalizada &&
    !pagamentoCompleto &&
    totais.total > 0;

  const motivoBloqueio = osCancelada
    ? "Esta OS está cancelada. Não é possível registrar pagamento."
    : osFinalizada
      ? "Esta OS já foi finalizada/entregue. Não é possível registrar pagamento por esta tela."
      : pagamentoCompleto
        ? "Esta OS já está com pagamento completo."
        : totais.total <= 0
          ? "Esta OS está sem valor total. Ajuste o orçamento antes de registrar pagamento."
          : "";

  const botoesPercentual = Array.from(
    new Set([25, 50, totais.percentualRestante].filter((valor) => valor > 0))
  );

  async function carregarOrdem() {
    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch(`/api/ordens/${id}`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar OS.");
        setOrdem(null);
        return;
      }

      setOrdem(data);

      if (
        data?.paymentMethod &&
        data.paymentMethod !== "AGUARDANDO_PAGAMENTO" &&
        formaPagamentoValida(data.paymentMethod)
      ) {
        setPaymentMethod(data.paymentMethod);
      }

      const restante = Math.max(100 - numeroSeguro(data?.paymentPercent), 0);
      setPaymentPercent(restante > 0 ? restante : 0);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar OS."
      );
      setOrdem(null);
    } finally {
      setCarregando(false);
    }
  }

  async function registrarPagamento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!podeRegistrar) {
      setMensagem(motivoBloqueio || "Pagamento não permitido para esta OS.");
      return;
    }

    if (
      totais.percentualPagamento <= 0 ||
      totais.percentualPagamento > totais.percentualRestante
    ) {
      setMensagem(
        `Informe um percentual entre 1% e ${totais.percentualRestante}%.`
      );
      return;
    }

    const confirmar = window.confirm(
      `Confirmar pagamento de ${totais.percentualPagamento}% no valor de ${formatarMoeda(
        totais.valorPagamento
      )}?`
    );

    if (!confirmar) return;

    try {
      setSalvando(true);

      const response = await fetch(`/api/ordens/${id}/pagamento`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod,
          paymentPercent: totais.percentualPagamento,
          note: note.trim(),
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao registrar pagamento.");
        return;
      }

      router.push(`/ordens/${id}`);
      router.refresh();
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao registrar pagamento."
      );
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    carregarOrdem();
  }, []);

  if (carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-5xl">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Carregando pagamento...
          </div>
        </section>
      </main>
    );
  }

  if (!ordem) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-5xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              {mensagem || "OS não encontrada."}
            </p>
          </div>

          <Link
            href="/ordens"
            className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Voltar para ordens
          </Link>
        </section>
      </main>
    );
  }

  const numeroOS = formatarNumeroOS(ordem.osNumber);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-green-600">Financeiro</p>

              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Registrar pagamento · OS Nº {numeroOS}
              </h1>

              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Cliente:{" "}
                <strong className="text-slate-800 dark:text-slate-300">
                  {ordem.customer?.name || "-"}
                </strong>
                {ordem.customer?.whatsapp ? ` · ${ordem.customer.whatsapp}` : ""}
              </p>
            </div>

            <Link
              href={`/ordens/${id}`}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Voltar para OS
            </Link>
          </div>
        </header>

        <CardMensagem mensagem={mensagem} />

        {motivoBloqueio && (
          <div className="rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
            {motivoBloqueio}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            titulo="Total da OS"
            valor={formatarMoeda(totais.total)}
            destaque="slate"
          />

          <CardResumo
            titulo="Já pago"
            valor={formatarMoeda(totais.valorJaPago)}
            detalhe={`${totais.percentualJaPago}% registrado`}
            destaque="green"
          />

          <CardResumo
            titulo="Pagamento agora"
            valor={formatarMoeda(totais.valorPagamento)}
            detalhe={`${totais.percentualPagamento}% da OS`}
            destaque="blue"
          />

          <CardResumo
            titulo="Restante depois"
            valor={formatarMoeda(totais.valorRestanteDepois)}
            detalhe={`${Math.max(100 - totais.percentualDepois, 0)}% restante`}
            destaque={totais.valorRestanteDepois <= 0 ? "green" : "orange"}
          />
        </section>

        <form
          onSubmit={registrarPagamento}
          className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
        >
          <div className="mb-6">
            <p className="text-sm font-bold text-blue-600">Pagamento</p>
            <h2 className="text-2xl font-black tracking-tight">
              Dados do pagamento
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Registre somente o valor recebido agora. O sistema soma com os
              pagamentos anteriores.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Forma de pagamento
              </label>

              <select
                value={paymentMethod}
                disabled={!podeRegistrar || salvando}
                onChange={(event) =>
                  setPaymentMethod(event.target.value as FormaPagamento)
                }
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 disabled:text-slate-500 dark:text-slate-400"
              >
                {FORMAS_PAGAMENTO.map((forma) => (
                  <option key={forma.value} value={forma.value}>
                    {forma.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Percentual pago agora
              </label>

              <input
                type="number"
                min="1"
                max={totais.percentualRestante}
                value={paymentPercent}
                disabled={!podeRegistrar || salvando}
                onChange={(event) => {
                  const valor = numeroSeguro(event.target.value);
                  setPaymentPercent(
                    Math.min(Math.max(valor, 0), totais.percentualRestante)
                  );
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 disabled:text-slate-500 dark:text-slate-400"
              />

              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Restante disponível: {totais.percentualRestante}%.
              </p>
            </div>

            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                Botões rápidos
              </p>

              <div className="flex flex-wrap gap-2">
                {botoesPercentual.map((percentual) => (
                  <button
                    key={percentual}
                    type="button"
                    disabled={!podeRegistrar || salvando}
                    onClick={() => setPaymentPercent(percentual)}
                    className={`rounded-xl px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${
                      paymentPercent === percentual
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                        : "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    {percentual === totais.percentualRestante
                      ? `Restante (${percentual}%)`
                      : `${percentual}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                Observação do pagamento
              </label>

              <textarea
                value={note}
                disabled={!podeRegistrar || salvando}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                placeholder="Exemplo: entrada de 50%, restante na retirada..."
                className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 disabled:text-slate-500 dark:text-slate-400"
              />
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200 ring-1 ring-slate-100">
            <p>
              <strong>Status atual:</strong>{" "}
              {nomesStatus[ordem.status] || ordem.status}
            </p>
            <p>
              <strong>Após confirmar:</strong>{" "}
              {formatarMoeda(totais.valorTotalPagoDepois)} pago (
              {totais.percentualDepois}%).
            </p>
            <p>
              <strong>Forma:</strong> {nomesPagamento[paymentMethod]}.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row">
            <button
              type="submit"
              disabled={!podeRegistrar || salvando}
              className="rounded-xl bg-green-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-green-600/20 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Confirmar pagamento"}
            </button>

            <Link
              href={`/ordens/${id}`}
              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
            >
              Cancelar
            </Link>
          </div>
        </form>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Histórico</p>
              <h2 className="text-2xl font-black tracking-tight">
                Pagamentos registrados
              </h2>
            </div>

            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-600 dark:text-slate-400">
              {ordem.payments?.length || 0} pagamento(s)
            </span>
          </div>

          {!ordem.payments || ordem.payments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
              Nenhum pagamento registrado ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {ordem.payments.map((pagamento) => {
                const isEstorno = Number(pagamento.amount) < 0;

                return (
                  <article
                    key={pagamento.id}
                    className={`rounded-2xl p-4 ring-1 ${
                      isEstorno
                        ? "bg-rose-50/60 dark:bg-rose-950/20 ring-rose-200 dark:ring-rose-900/50"
                        : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100 dark:ring-slate-800"
                    }`}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-base font-black ${
                            isEstorno ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"
                          }`}>
                            {isEstorno
                              ? `- ${formatarMoeda(Math.abs(Number(pagamento.amount)))}`
                              : `${formatarMoeda(pagamento.amount)} · ${pagamento.percent}%`}
                          </p>
                          {isEstorno && (
                            <span className="inline-flex rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
                              Devolução no Caixa
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                          Forma:{" "}
                          {nomesPagamento[pagamento.paymentMethod] ||
                            pagamento.paymentMethod}
                          {isEstorno && " (Estorno)"}
                        </p>
                      </div>

                      <div className="text-xs font-bold text-slate-500 dark:text-slate-400 md:text-right">
                        <p>{formatarDataHora(pagamento.createdAt)}</p>
                        <p>{pagamento.userName || "Sistema"}</p>
                      </div>
                    </div>

                    {pagamento.note && (
                      <p className={`mt-3 whitespace-pre-wrap rounded-xl p-3 text-sm font-semibold ring-1 ${
                        isEstorno
                          ? "bg-white/80 dark:bg-slate-900/80 text-rose-800 dark:text-rose-200 ring-rose-200 dark:ring-rose-900/50"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 ring-slate-100 dark:ring-slate-800"
                      }`}>
                        {pagamento.note}
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