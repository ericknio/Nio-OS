/**
 * @file app/ordens/[id]/cancelar/page.tsx
 * @description Tela de Cancelamento Seguro de Ordem de Serviço (Frontend).
 * 
 * Funcionalidades:
 * - Exige motivo detalhado de cancelamento (mínimo 10 caracteres) para auditoria.
 * - Liberação imediata de peças técnicas reservadas de volta ao estoque disponível.
 * - Opção explícita de estorno e retorno físico de peças já consumidas (`returnConsumedParts`).
 * - Proteção por chave de idempotência para evitar duplicidade de estornos no banco de dados.
 */

"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import CardMensagem from "@/app/components/CardMensagem";
import { formatarNumeroOS, formatarMoeda } from "@/lib/formatadores";
import { nomesStatus, textareaClass } from "@/lib/uiConstantes";

type Ordem = {
  id: string;
  osNumber: number | string | null;
  status: string;
  equipmentType: string;
  equipmentOther?: string | null;
  brand: string | null;
  model: string | null;
  reportedDefect: string | null;
  totalAmount?: number | string | null;
  paidAmount?: number | string | null;
  finalization: unknown | null;
  customer: {
    name: string;
    whatsapp: string | null;
  };
};

type TentativaCancelamento = {
  key: string;
  orderId: string;
  expectedCurrentStatus: string;
  motivo: string;
  returnConsumedParts: boolean;
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
  const equipamento = nomeEquipamento(ordem);
  const detalhes = [ordem.brand, ordem.model].filter(Boolean).join(" ");

  return detalhes ? `${equipamento} · ${detalhes}` : equipamento;
}

function CampoResumo({
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

/**
 * Componente principal da Tela de Cancelamento de O.S.
 * 
 * Gerencia as confirmações de cancelamento, validação de justificativa,
 * opção de devolução de peças ao estoque físico e chamada à API.
 */
export default function CancelarOrdemPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [motivo, setMotivo] = useState("");
  const [returnConsumedParts, setReturnConsumedParts] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const requestEmAndamentoRef = useRef(false);
  const tentativaCancelamentoRef = useRef<TentativaCancelamento | null>(null);

  const jaCancelada = ordem?.status === "CANCELADO";
  const finalizada = ordem?.status === "ENTREGUE" || Boolean(ordem?.finalization);
  const podeCancelar = Boolean(ordem) && !jaCancelada;

  const motivoBloqueio = jaCancelada
    ? "Esta OS já está cancelada."
    : "";

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
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar OS."
      );
      setOrdem(null);
    } finally {
      setCarregando(false);
    }
  }

  async function cancelarOS(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMensagem("");

    if (requestEmAndamentoRef.current) {
      return;
    }

    if (!podeCancelar || !ordem) {
      setMensagem(motivoBloqueio || "Esta OS não pode ser cancelada agora.");
      return;
    }

    const motivoNormalizado = motivo.trim();

    if (!motivoNormalizado) {
      setMensagem("Informe o motivo do cancelamento.");
      return;
    }

    if (motivoNormalizado.length < 10) {
      setMensagem("Descreva melhor o motivo do cancelamento.");
      return;
    }

    if (motivoNormalizado.length > 1000) {
      setMensagem("O motivo do cancelamento deve ter no máximo 1000 caracteres.");
      return;
    }

    const valorPagoOS = Number(ordem.paidAmount || 0);
    const avisoEstorno =
      valorPagoOS > 0
        ? `\n\nATENÇÃO FINANCEIRA: Esta OS possui ${formatarMoeda(
            valorPagoOS
          )} pagos. O cancelamento registrará a devolução/estorno desse valor no caixa de hoje para abater da receita diária.`
        : "";

    const confirmar = window.confirm(
      (finalizada
        ? "Esta OS já está finalizada/entregue. O cancelamento estornará a finalização, removerá a comissão do técnico dos relatórios e " +
          (returnConsumedParts
            ? "devolverá as peças consumidas ao estoque."
            : "manterá as peças como consumidas.") +
          "\n\nConfirma o cancelamento por desistência / devolução?"
        : "Confirma o cancelamento desta OS? Reservas de peças serão liberadas " +
          (returnConsumedParts
            ? "e peças já consumidas retornarão ao estoque técnico."
            : ".")) + avisoEstorno
    );

    if (!confirmar) {
      return;
    }

    const expectedCurrentStatus = ordem.status;
    let tentativa = tentativaCancelamentoRef.current;

    if (
      !tentativa ||
      tentativa.orderId !== id ||
      tentativa.expectedCurrentStatus !== expectedCurrentStatus ||
      tentativa.motivo !== motivoNormalizado ||
      tentativa.returnConsumedParts !== returnConsumedParts
    ) {
      if (
        !globalThis.crypto ||
        typeof globalThis.crypto.randomUUID !== "function"
      ) {
        setMensagem(
          "Não foi possível iniciar o cancelamento com segurança. Recarregue a página e tente novamente."
        );
        return;
      }

      tentativa = {
        key: globalThis.crypto.randomUUID(),
        orderId: id,
        expectedCurrentStatus,
        motivo: motivoNormalizado,
        returnConsumedParts,
      };

      tentativaCancelamentoRef.current = tentativa;
    }

    requestEmAndamentoRef.current = true;
    setSalvando(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`/api/ordens/${id}/cancelar`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.key,
        },
        body: JSON.stringify({
          motivo: tentativa.motivo,
          expectedCurrentStatus: tentativa.expectedCurrentStatus,
          confirmation: true,
          returnConsumedParts: tentativa.returnConsumedParts,
        }),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const mensagemApi =
          data?.message ||
          (response.status >= 500
            ? "Não foi possível concluir o cancelamento agora."
            : "Erro ao cancelar OS.");

        if (response.status === 503 || response.status >= 500) {
          // Mantém chave e payload: o retry da mesma tentativa é idempotente.
          setMensagem(
            response.status === 503
              ? "O sistema está ocupado. Tente novamente; a mesma tentativa segura será reutilizada."
              : mensagemApi
          );
          return;
        }

        if (response.status === 409) {
          tentativaCancelamentoRef.current = null;
          await carregarOrdem();
          setMensagem(mensagemApi);
          return;
        }

        tentativaCancelamentoRef.current = null;
        setMensagem(mensagemApi);
        return;
      }

      tentativaCancelamentoRef.current = null;
      setMensagem("OS cancelada com sucesso.");

      // Inclusive no fallback reloadOrder=true, o commit já ocorreu.
      // Navegar para os detalhes provoca uma nova leitura sem repetir o PATCH.
      window.setTimeout(() => {
        router.push(`/ordens/${id}`);
        router.refresh();
      }, 600);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMensagem(
          "A resposta demorou mais que o esperado. Tente novamente; a mesma tentativa segura será reutilizada."
        );
        return;
      }

      setMensagem(
        "Não foi possível confirmar a resposta do servidor. Tente novamente; a mesma tentativa segura será reutilizada."
      );
    } finally {
      window.clearTimeout(timeoutId);
      requestEmAndamentoRef.current = false;
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
            Carregando OS...
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
  const equipamento = detalheEquipamento(ordem);
  const caracteresMotivo = motivo.trim().length;
  const valorPagoOS = Number(ordem.paidAmount || 0);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-red-600">
                Controle operacional
              </p>

              <h1 className="mt-1 text-3xl font-black tracking-tight">
                Cancelar OS Nº {numeroOS}
              </h1>

              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                O cancelamento não exclui a OS. Ele mantém o registro no sistema
                e grava o motivo no histórico.
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

        {finalizada && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:text-amber-200 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:ring-amber-500/30">
            <strong>Atenção (OS Finalizada / Entregue):</strong> O cancelamento desta OS por desistência ou devolução do cliente estornará a entrega realizada e <strong>removerá a comissão do técnico dos relatórios de lucros</strong>.
          </div>
        )}

        {valorPagoOS > 0 && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 p-4 text-sm font-semibold text-red-900 dark:text-red-200 ring-1 ring-red-200 dark:ring-red-500/30">
            <strong className="block text-base font-black text-red-700 dark:text-red-400">
              Atenção Financeira (Devolução de Valor no Caixa):
            </strong>
            <p className="mt-1">
              Esta OS possui <strong>{formatarMoeda(valorPagoOS)}</strong> pagos pelo cliente. Ao confirmar o cancelamento, será registrado no sistema o <strong>estorno/devolução de {formatarMoeda(valorPagoOS)} no caixa do dia de hoje</strong>, abatendo esse valor da receita para bater o fechamento de caixa.
            </p>
          </div>
        )}

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">Resumo</p>

            <h2 className="text-2xl font-black tracking-tight">Dados da OS</h2>

            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Confira se esta é realmente a OS que será cancelada.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <CampoResumo titulo="Cliente">
              {textoSeguro(ordem.customer?.name)}
            </CampoResumo>

            <CampoResumo titulo="WhatsApp">
              {textoSeguro(ordem.customer?.whatsapp)}
            </CampoResumo>

            <CampoResumo titulo="Equipamento">{equipamento}</CampoResumo>

            <CampoResumo titulo="Status atual">
              <span
                className={
                  jaCancelada
                    ? "text-red-700 dark:text-red-400"
                    : finalizada
                      ? "text-green-700 dark:text-green-400"
                      : "text-blue-700 dark:text-blue-400"
                }
              >
                {nomesStatus[ordem.status] || ordem.status}
              </span>
            </CampoResumo>

            {valorPagoOS > 0 && (
              <CampoResumo titulo="Estorno no Caixa">
                <span className="text-red-600 dark:text-red-400 font-black">
                  - {formatarMoeda(valorPagoOS)}
                </span>
              </CampoResumo>
            )}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Defeito informado
            </p>

            <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-900 dark:text-white">
              {textoSeguro(ordem.reportedDefect)}
            </p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <form
            onSubmit={cancelarOS}
            className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800"
          >
            <div className="mb-6">
              <p className="text-sm font-bold text-red-600">Cancelamento</p>

              <h2 className="text-2xl font-black tracking-tight">
                Registrar motivo
              </h2>

              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Descreva o motivo de forma clara. O operador será registrado automaticamente pela sessão logada.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <label className="block text-sm font-black text-slate-700 dark:text-slate-200">
                    Motivo do cancelamento *
                  </label>

                  <span
                    className={`text-xs font-black ${
                      caracteresMotivo >= 10 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {caracteresMotivo}/10 mínimo
                  </span>
                </div>

                <textarea
                  value={motivo}
                  disabled={!podeCancelar || salvando}
                  onChange={(event) => {
                    const novoMotivo = event.target.value;
                    setMotivo(novoMotivo);
                    setMensagem("");

                    const tentativa = tentativaCancelamentoRef.current;
                    if (
                      tentativa &&
                      tentativa.motivo !== novoMotivo.trim()
                    ) {
                      tentativaCancelamentoRef.current = null;
                    }
                  }}
                  maxLength={1000}
                  rows={7}
                  placeholder="Exemplo: cliente desistiu do serviço e pediu devolução, orçamento não aprovado, aparelho sem conserto, peça indisponível..."
                  className={textareaClass}
                />
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={returnConsumedParts}
                    disabled={!podeCancelar || salvando}
                    onChange={(e) => {
                      setReturnConsumedParts(e.target.checked);
                      tentativaCancelamentoRef.current = null;
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="block text-sm font-black text-slate-800 dark:text-slate-200">
                      Estornar peças consumidas de volta ao estoque técnico
                    </span>
                    <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Marque esta opção caso a peça trocada tenha sido devolvida ou retirada do aparelho para retorno ao estoque.
                    </span>
                  </div>
                </label>
              </div>

              <div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:bg-red-900/20 dark:ring-red-500/30">
                Ao confirmar, a OS ficará com status <strong>CANCELADO</strong>. Peças ainda reservadas serão liberadas automaticamente. Se a opção acima estiver marcada, peças consumidas serão devolvidas ao estoque técnico. A comissão do técnico relativa a esta OS será estornada dos relatórios de lucros.
              </div>

              <div className="flex flex-col gap-3 pt-2 md:flex-row">
                <button
                  type="submit"
                  disabled={salvando || !podeCancelar}
                  className="rounded-xl bg-red-600 px-6 py-4 text-sm font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {salvando ? "Cancelando..." : "Confirmar cancelamento"}
                </button>

                <Link
                  href={`/ordens/${id}`}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-center text-sm font-black text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
                >
                  Desistir
                </Link>
              </div>
            </div>
          </form>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-950/10">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-red-200">
                Atenção
              </p>

              <div className="mt-5 space-y-4 text-sm font-semibold leading-6 text-slate-300">
                <p>1. Cancelar não apaga a OS.</p>
                <p>2. O motivo fica registrado no histórico.</p>
                <p>3. OS cancelada não recebe pagamento.</p>
                <p>4. OS cancelada não pode ser finalizada.</p>
                <p>5. Peças consumidas voltam ao estoque quando a opção de estorno está marcada.</p>
                <p>6. A comissão do técnico é removida dos relatórios de lucros.</p>
                <p>7. Para retomar o fluxo, use Reabrir OS.</p>
              </div>
            </section>

            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Sugestões</p>

              <h2 className="mt-1 text-xl font-black tracking-tight">
                Motivos comuns
              </h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Cliente desistiu do serviço.",
                  "Orçamento não aprovado pelo cliente.",
                  "Aparelho sem conserto viável.",
                  "Peça indisponível no momento.",
                ].map((texto) => (
                  <button
                    key={texto}
                    type="button"
                    disabled={!podeCancelar || salvando}
                    onClick={() => {
                      setMotivo(texto);
                      setMensagem("");
                      tentativaCancelamentoRef.current = null;
                    }}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-left text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}