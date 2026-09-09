/**
 * @file app/ordens/[id]/finalizar/page.tsx
 * @description Tela de Encerramento e Entrega de Equipamento da O.S. (Frontend).
 * 
 * Funcionalidades:
 * - Registro do laudo técnico de reparo executado (`repairDescription`).
 * - Definição do prazo legal de garantia do serviço (padrão de 90 dias - CDC).
 * - Identificação de quem realizou a entrega ao cliente e data/hora do fechamento.
 * - Conferência final de saldo restante a pagar e método de liquidação.
 * - Transição de status para ENTREGUE com emissão de recibo e termo de garantia.
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CardMensagem from "@/app/components/CardMensagem";
import { formatarMoeda, formatarNumeroOS, numeroSeguro } from "@/lib/formatadores";
import { nomesStatus, nomesPagamento, inputClass, textareaClass } from "@/lib/uiConstantes";

type FormaPagamento = "PIX" | "DINHEIRO" | "CARTAO" | "PARCELADO";

type Ordem = {
  id: string;
  osNumber: number | string | null;
  totalAmount: number | string | null;
  paidAmount?: number | string | null;
  paymentPercent?: number | string | null;
  status: string;

  equipmentType: string;
  equipmentOther?: string | null;
  brand: string | null;
  model: string | null;
  reportedDefect: string;
  technicianResponsible?: string | null;

  customer: {
    name: string;
    whatsapp: string | null;
  };

  finalization: {
    id: string;
    repairDescription: string;
    replacedParts: string | null;
    finalAmount: number | string | null;
    warrantyDays: number;
    deliveredAt: string;
    deliveredBy: string;
    paymentMethod: string | null;
    finalNotes: string | null;
  } | null;
};

type FormState = {
  repairDescription: string;
  replacedParts: string;
  finalAmount: string;
  warrantyDays: string;
  deliveredAt: string;
  deliveredBy: string;
  paymentMethod: FormaPagamento;
  finalNotes: string;
};

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO", label: "Cartão" },
  { value: "PARCELADO", label: "Parcelado" },
];

const GARANTIAS = [
  ["0", "Sem garantia (peça do cliente)"],
  ["30", "30 dias"],
  ["60", "60 dias"],
  ["90", "90 dias"],
  ["180", "180 dias"],
] as const;



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

function hojeLocal() {
  const data = new Date();
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function textoSeguro(valor?: string | number | null) {
  const texto = String(valor ?? "").trim();
  return texto || "-";
}

function nomeEquipamento(ordem: Ordem) {
  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }

  return nomesEquipamento[ordem.equipmentType] || ordem.equipmentType || "-";
}

function detalheEquipamento(ordem: Ordem) {
  return [ordem.brand, ordem.model].filter(Boolean).join(" ") || nomeEquipamento(ordem);
}

function CardResumo({
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

function CampoTexto({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
  required = false,
  step,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "number";
  disabled?: boolean;
  required?: boolean;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <input
        type={type}
        step={step}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function CampoTextarea({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  minHeight = "min-h-24",
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  minHeight?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
        {required ? " *" : ""}
      </label>

      <textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`${textareaClass} ${minHeight}`}
      />
    </div>
  );
}

/**
 * Componente principal da Tela de Finalização da O.S.
 * 
 * Gerencia o formulário de entrega, laudo final de reparo, cálculo de saldo
 * residual e submissão via POST para `/api/ordens/${id}/finalizar`.
 */
export default function FinalizarOrdemPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const [form, setForm] = useState<FormState>({
    repairDescription: "",
    replacedParts: "",
    finalAmount: "",
    warrantyDays: "90",
    deliveredAt: hojeLocal(),
    deliveredBy: "",
    paymentMethod: "PIX",
    finalNotes: "",
  });

  const totais = useMemo(() => {
    const total = Math.max(numeroSeguro(ordem?.totalAmount), 0);
    const pago = Math.max(numeroSeguro(ordem?.paidAmount), 0);
    const percentualPago = Math.min(
      Math.max(numeroSeguro(ordem?.paymentPercent), 0),
      100
    );
    const valorFinal = Math.max(numeroSeguro(form.finalAmount), 0);
    const restante = Math.max(valorFinal - pago, 0);

    return {
      total,
      pago,
      percentualPago,
      valorFinal,
      restante,
    };
  }, [ordem, form.finalAmount]);

  const finalizada = ordem?.status === "ENTREGUE" || Boolean(ordem?.finalization);
  const cancelada = ordem?.status === "CANCELADO";
  const pronta = ordem?.status === "PRONTO";
  const temTecnico = Boolean(ordem?.technicianResponsible?.trim());

  const podeFinalizar =
    Boolean(ordem) && pronta && !finalizada && !cancelada && temTecnico;

  const motivoBloqueio = cancelada
    ? "Esta OS está cancelada. Para finalizar, primeiro reabra a OS."
    : finalizada
      ? "Esta OS já foi finalizada. Para alterar a entrega, primeiro reabra a OS."
      : !pronta
        ? "Para finalizar, primeiro altere o status da OS para PRONTO."
        : !temTecnico
          ? "Para finalizar, informe o técnico responsável no status rápido."
          : "";

  function atualizarCampo(campo: keyof FormState, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function carregarOrdem() {
    try {
      setCarregando(true);
      setMensagem("");

      const resposta = await fetch(`/api/ordens/${id}`, {
        cache: "no-store",
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao carregar ordem.");
        setOrdem(null);
        return;
      }

      setOrdem(dados);

      setForm((atual) => ({
        ...atual,
        finalAmount: String(dados.totalAmount ?? "0"),
        paymentMethod:
          FORMAS_PAGAMENTO.some((forma) => forma.value === dados.paymentMethod)
            ? dados.paymentMethod
            : atual.paymentMethod,
      }));
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao carregar ordem de serviço."
      );
      setOrdem(null);
    } finally {
      setCarregando(false);
    }
  }

  async function finalizarOrdem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (!podeFinalizar) {
      setMensagem(motivoBloqueio || "Esta OS não pode ser finalizada agora.");
      return;
    }

    if (!form.repairDescription.trim()) {
      setMensagem("Informe a descrição do reparo realizado.");
      return;
    }

    if (!form.deliveredBy.trim()) {
      setMensagem("Informe quem entregou o aparelho ao cliente.");
      return;
    }

    if (totais.valorFinal <= 0) {
      setMensagem("Informe um valor final maior que zero.");
      return;
    }

    const confirmar = window.confirm(
      `Confirmar finalização da OS Nº ${formatarNumeroOS(
        ordem?.osNumber
      )} no valor final de ${formatarMoeda(totais.valorFinal)}?`
    );

    if (!confirmar) return;

    try {
      setSalvando(true);

      const resposta = await fetch(`/api/ordens/${id}/finalizar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repairDescription: form.repairDescription.trim(),
          replacedParts: form.replacedParts.trim(),
          finalAmount: totais.valorFinal,
          warrantyDays:
            form.warrantyDays !== "" ? Number(form.warrantyDays) : 90,
          deliveredAt: form.deliveredAt,
          deliveredBy: form.deliveredBy.trim(),
          paymentMethod: form.paymentMethod,
          finalNotes: form.finalNotes.trim(),
        }),
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao finalizar ordem.");
        return;
      }

      setMensagem("Ordem finalizada com sucesso.");

      setTimeout(() => {
        router.push(`/ordens/${id}`);
      }, 600);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao finalizar ordem de serviço."
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
        <section className="mx-auto max-w-6xl">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Carregando ordem...
          </div>
        </section>
      </main>
    );
  }

  if (!ordem) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
        <section className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              {mensagem || "Ordem não encontrada."}
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
  const equipamento = detalheEquipamento(ordem);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-green-600">
                Entrega / finalização
              </p>

              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Finalizar OS Nº {numeroOS}
              </h1>

              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Cliente:{" "}
                <strong className="text-slate-800 dark:text-slate-300">{ordem.customer.name}</strong>
                {ordem.customer.whatsapp ? ` · ${ordem.customer.whatsapp}` : ""}
              </p>
            </div>

            <Link
              href={`/ordens/${ordem.id}`}
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

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Resumo</p>

            <h2 className="text-2xl font-black tracking-tight">Resumo da OS</h2>

            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Confira os dados principais antes de finalizar a entrega.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CardResumo titulo="Equipamento">{equipamento}</CardResumo>

            <CardResumo titulo="Status atual">
              {nomesStatus[ordem.status] || ordem.status}
            </CardResumo>

            <CardResumo titulo="Técnico responsável">
              {textoSeguro(ordem.technicianResponsible || "Ainda não informado")}
            </CardResumo>

            <CardResumo titulo="Valor atual">
              <span className="text-green-700 dark:text-green-400">
                {formatarMoeda(ordem.totalAmount)}
              </span>
            </CardResumo>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Defeito informado
            </p>

            <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-900 dark:text-white">
              {ordem.reportedDefect || "-"}
            </p>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <form
            onSubmit={finalizarOrdem}
            className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="mb-6">
              <p className="text-sm font-bold text-green-600">
                Dados da entrega
              </p>

              <h2 className="text-2xl font-black tracking-tight">
                Finalização da ordem
              </h2>

              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Registre o reparo realizado, garantia e quem entregou o aparelho.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <CampoTextarea
                  label="Descrição do reparo realizado"
                  required
                  value={form.repairDescription}
                  disabled={!podeFinalizar || salvando}
                  onChange={(valor) => atualizarCampo("repairDescription", valor)}
                  placeholder="Exemplo: troca do conector de carga e limpeza interna."
                  minHeight="min-h-32"
                />
              </div>

              <div className="md:col-span-2">
                <CampoTextarea
                  label="Peças trocadas"
                  value={form.replacedParts}
                  disabled={!podeFinalizar || salvando}
                  onChange={(valor) => atualizarCampo("replacedParts", valor)}
                  placeholder="Exemplo: conector de carga, bateria, tela..."
                  minHeight="min-h-24"
                />
              </div>

              <CampoTexto
                type="number"
                step="0.01"
                label="Valor final"
                value={form.finalAmount}
                disabled={!podeFinalizar || salvando}
                onChange={(valor) => atualizarCampo("finalAmount", valor)}
              />

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Garantia
                </label>

                <select
                  value={form.warrantyDays}
                  disabled={!podeFinalizar || salvando}
                  onChange={(event) =>
                    atualizarCampo("warrantyDays", event.target.value)
                  }
                  className={inputClass}
                >
                  {GARANTIAS.map(([valor, label]) => (
                    <option key={valor} value={valor}>
                      {label}
                    </option>
                  ))}
                </select>

                {form.warrantyDays === "0" && (
                  <p className="mt-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    ⚠️ Atenção: Ordem sem cobertura de garantia (serviço realizado com peça fornecida pelo cliente).
                  </p>
                )}
              </div>

              <CampoTexto
                type="date"
                label="Data da entrega"
                value={form.deliveredAt}
                disabled={!podeFinalizar || salvando}
                onChange={(valor) => atualizarCampo("deliveredAt", valor)}
              />

              <CampoTexto
                label="Entregue por"
                required
                value={form.deliveredBy}
                disabled={!podeFinalizar || salvando}
                onChange={(valor) => atualizarCampo("deliveredBy", valor)}
                placeholder="Nome da pessoa que entregou"
              />

              <div>
                <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
                  Forma de pagamento
                </label>

                <select
                  value={form.paymentMethod}
                  disabled={!podeFinalizar || salvando}
                  onChange={(event) =>
                    atualizarCampo(
                      "paymentMethod",
                      event.target.value as FormaPagamento
                    )
                  }
                  className={inputClass}
                >
                  {FORMAS_PAGAMENTO.map((forma) => (
                    <option key={forma.value} value={forma.value}>
                      {forma.label}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Se houver saldo restante, a finalização registra o pagamento
                  restante com essa forma.
                </p>
              </div>

              <div className="md:col-span-2">
                <CampoTextarea
                  label="Observações finais"
                  value={form.finalNotes}
                  disabled={!podeFinalizar || salvando}
                  onChange={(valor) => atualizarCampo("finalNotes", valor)}
                  placeholder="Observações finais da entrega."
                />
              </div>

              <div className="flex flex-col gap-3 pt-2 md:col-span-2 md:flex-row">
                <button
                  type="submit"
                  disabled={!podeFinalizar || salvando}
                  className="rounded-xl bg-green-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-green-600/20 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvando ? "Finalizando..." : "Finalizar ordem"}
                </button>

                <Link
                  href={`/ordens/${ordem.id}`}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Cancelar
                </Link>
              </div>
            </div>
          </form>

          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Financeiro</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Conferência
              </h2>

              <div className="mt-5 space-y-3">
                <CardResumo titulo="Valor da OS">
                  {formatarMoeda(totais.total)}
                </CardResumo>

                <CardResumo titulo="Já pago">
                  <span className="text-green-700 dark:text-green-400">
                    {formatarMoeda(totais.pago)}
                  </span>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {totais.percentualPago}% registrado
                  </p>
                </CardResumo>

                <CardResumo titulo="Valor final">
                  <span className="text-blue-700 dark:text-blue-400">
                    {formatarMoeda(totais.valorFinal)}
                  </span>
                </CardResumo>

                <CardResumo titulo="Saldo ao finalizar">
                  <span
                    className={
                      totais.restante > 0 ? "text-orange-700 dark:text-orange-400" : "text-green-700 dark:text-green-400"
                    }
                  >
                    {formatarMoeda(totais.restante)}
                  </span>
                </CardResumo>
              </div>
            </section>

            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-green-200">
                Regras da entrega
              </p>

              <div className="mt-5 space-y-4 text-sm font-semibold leading-6 text-slate-300">
                <p>1. A OS precisa estar com status PRONTO.</p>
                <p>2. O técnico responsável precisa estar informado.</p>
                <p>3. Ao finalizar, a OS muda para ENTREGUE.</p>
                <p>4. A garantia será gerada com os dias informados.</p>
                <p>5. Se houver saldo, será registrado como pagamento restante.</p>
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}