/**
 * @file app/ordens/[id]/page.tsx
 * @description Tela de Detalhes e Gestão Operacional da Ordem de Serviço (Frontend).
 * 
 * Funcionalidades:
 * - Painel central de atendimento da O.S.: informações completas do cliente e do aparelho.
 * - Ciclo de vida e status rápido (`StatusRapidoOS`): RECEBIDO, EM_ANALISE, APROVADO, EM_MANUTENCAO, PRONTO, ENTREGUE, CANCELADO.
 * - Gestão de Peças Técnicas (`GerenciarPecasTecnicasOS` / `PecasTecnicasOS`): consumo e reserva em tempo real.
 * - Registro e visualização de anexos fotográficos e documentos do aparelho (`AnexosOS`).
 * - Notas técnicas preliminares e observações internas sigilosas (`ObservacoesInternasOS`).
 * - Ações financeiras: registro de pagamento, visualização de comissão técnica e emissão de recibo/termo.
 * - Comunicação facilitada via WhatsApp com mensagens pré-formatadas (`WhatsAppOS`).
 * - Impressão de ordem, etiquetas de identificação térmica e termo de garantia.
 */

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";

import Permissao, { useUsuarioPermissoes } from "@/app/Permissao";
import AnexosOS from "./AnexosOS";
import ObservacoesInternasOS from "./ObservacoesInternasOS";
import StatusRapidoOS from "./StatusRapidoOS";
import PecasTecnicasOS from "./PecasTecnicasOS";
import GerenciarPecasTecnicasOS from "./GerenciarPecasTecnicasOS";
import WhatsAppOS from "./WhatsAppOS";

type Ordem = {
  id: string;
  osNumber: number;
  openedAt: string;
  expectedDeliveryDate: string | null;

  paidAmount?: number | string | null;
  paymentPercent?: number | null;
  paymentReceivedAt?: string | null;

  equipmentType: string;
  equipmentOther: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  imei: string | null;
  devicePassword: string | null;

  deliveredAccessories: string | null;
  reportedDefect: string;
  technicalNotes: string | null;
  requiredParts: string | null;
  technicianResponsible?: string | null;
  technicianUserId?: string | null;
  technicianProfitPercentSnapshot?: number | null;

  partsCost: number | string | null;
  laborCost: number | string | null;
  discount: number | string | null;
  totalAmount: number | string | null;

  paymentMethod: string | null;
  status: string;

  customer: {
    name: string;
    cpf: string | null;
    whatsapp: string | null;
    secondaryPhone: string | null;
    email: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    district: string | null;
    city: string | null;
    state: string | null;
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

  payments?: {
    id: string;
  }[];

  technicalParts?: {
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
  }[];

  histories: {
    id: string;
    userName: string | null;
    action: string;
    description: string;
    createdAt: string;
  }[];
};

import {
  formatarNumeroOS,
  formatarMoeda,
  formatarData,
  formatarDataHora,
  numeroSeguro,
} from "@/lib/formatadores";
import {
  nomesStatus,
  nomesPagamento,
  classeStatus,
} from "@/lib/uiConstantes";

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

function classePagamento(percentualPago: number) {
  if (percentualPago >= 100) return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-600/20 dark:ring-green-500/30";
  if (percentualPago > 0) return "bg-yellow-50 text-yellow-700 dark:text-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-400 ring-yellow-600/20 dark:ring-yellow-500/30";

  return "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 ring-slate-600/20";
}

function equipamentoNome(ordem: Ordem) {
  if (ordem.equipmentType === "OUTRO" && ordem.equipmentOther) {
    return ordem.equipmentOther;
  }

  return nomesEquipamento[ordem.equipmentType] || ordem.equipmentType || "-";
}

function ordemAtrasada(ordem: Ordem) {
  if (!ordem.expectedDeliveryDate) return false;
  if (["PRONTO", "ENTREGUE", "CANCELADO"].includes(ordem.status)) return false;

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const previsao = new Date(ordem.expectedDeliveryDate);
  previsao.setHours(0, 0, 0, 0);

  return previsao < hoje;
}

function LinhaDetalhe({
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

function TextoLongo({ valor }: { valor?: string | number | null }) {
  return (
    <div className="min-h-12 whitespace-pre-wrap rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-semibold leading-6 text-slate-900 dark:text-white ring-1 ring-slate-100">
      {textoSeguro(valor)}
    </div>
  );
}

function CardResumo({
  titulo,
  valor,
  detalhe,
  destaque,
}: {
  titulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  destaque?: "blue" | "green" | "red" | "slate";
}) {
  const cor =
    destaque === "green"
      ? "text-green-700 dark:text-green-400"
      : destaque === "red"
        ? "text-red-700 dark:text-red-400"
        : destaque === "blue"
          ? "text-blue-700 dark:text-blue-400"
          : "text-slate-950 dark:text-slate-100";

  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{titulo}</p>
      <strong className={`mt-2 block text-2xl ${cor}`}>{valor}</strong>
      {detalhe && <div className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{detalhe}</div>}
    </div>
  );
}

function BotaoAcao({
  children,
  href,
  onClick,
  variante = "neutro",
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variante?: "azul" | "verde" | "vermelho" | "escuro" | "laranja" | "neutro";
}) {
  const classes: Record<string, string> = {
    azul: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20",
    verde: "bg-green-600 text-white hover:bg-green-700",
    vermelho: "bg-red-600 text-white hover:bg-red-700",
    escuro: "bg-slate-950 text-white hover:bg-slate-800",
    laranja: "bg-orange-500 text-white hover:bg-orange-600",
    neutro:
      "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 shadow-sm",
  };

  const className = `rounded-xl px-4 py-3 text-sm font-black transition ${classes[variante]}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

/**
 * Componente principal da Tela de Detalhes da Ordem de Serviço.
 * 
 * Orquestra o carregamento assíncrono dos dados completos da O.S.,
 * subcomponentes de fotos, peças, notas técnicas, histórico e ações de fechamento.
 */
export default function DetalhesOrdemPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();
  const podeVerOrdem = !carregandoPermissoes && tem("ordens.ver");

  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [mostrarTodoHistorico, setMostrarTodoHistorico] = useState(false);

  async function carregarOrdem() {
    try {
      setCarregando(true);
      setMensagem("");

      const resposta = await fetch(`/api/ordens/${id}`, {
        cache: "no-store",
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao carregar ordem de serviço.");
        setOrdem(null);
        return;
      }

      setOrdem(dados);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar ordem."
      );
      setOrdem(null);
    } finally {
      setCarregando(false);
    }
  }

  async function duplicarOrdem() {
    const confirmou = window.confirm(
      "Deseja duplicar esta ordem de serviço? Uma nova OS será criada com outro número."
    );

    if (!confirmou) return;

    try {
      setMensagem("");

      const resposta = await fetch(`/api/ordens/${id}/duplicar`, {
        method: "POST",
      });

      const dados = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setMensagem(dados?.message || "Erro ao duplicar ordem.");
        return;
      }

      router.push(`/ordens/${dados.id}`);
    } catch (error) {
      setMensagem(
        error instanceof Error
          ? error.message
          : "Erro ao duplicar ordem de serviço."
      );
    }
  }

  async function reabrirOrdem() {
    const confirmou = window.confirm(
      "Deseja realmente reabrir esta ordem de serviço?"
    );

    if (!confirmou) return;

    try {
      setMensagem("");

      const response = await fetch(`/api/ordens/${id}/reabrir`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao reabrir OS.");
        return;
      }

      setMensagem("OS reaberta com sucesso.");
      await carregarOrdem();
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Erro ao reabrir OS.");
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeVerOrdem) {
      setCarregando(false);
      return;
    }

    carregarOrdem();
  }, [carregandoPermissoes, podeVerOrdem, id]);

  const dadosCalculados = useMemo(() => {
    if (!ordem) {
      return {
        totalOS: 0,
        valorPagoOS: 0,
        percentualPagoOS: 0,
        valorRestanteOS: 0,
        pagamentoCompleto: false,
        osCancelada: false,
        osPronta: false,
        osFinalizada: false,
        atrasada: false,
      };
    }

    const totalOS = numeroSeguro(ordem.totalAmount);
    const valorPagoOS = numeroSeguro(ordem.paidAmount);
    const percentualPagoOS = Math.min(
      Math.max(numeroSeguro(ordem.paymentPercent), 0),
      100
    );

    return {
      totalOS,
      valorPagoOS,
      percentualPagoOS,
      valorRestanteOS: Math.max(totalOS - valorPagoOS, 0),
      pagamentoCompleto: percentualPagoOS >= 100,
      osCancelada: ordem.status === "CANCELADO",
      osPronta: ordem.status === "PRONTO",
      osFinalizada: ordem.status === "ENTREGUE" || Boolean(ordem.finalization),
      atrasada: ordemAtrasada(ordem),
    };
  }, [ordem]);

  if (carregandoPermissoes || carregando) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-6 text-slate-900 dark:text-white">
        <section className="mx-auto max-w-6xl">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            Carregando ordem de serviço...
          </div>
        </section>
      </main>
    );
  }

  if (!podeVerOrdem) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-6 text-slate-900 dark:text-white">
        <section className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm ring-1 ring-red-200">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              Você não tem permissão para acessar detalhes de ordens de serviço.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Voltar ao painel
          </Link>
        </section>
      </main>
    );
  }

  if (!ordem) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-6 text-slate-900 dark:text-white">
        <section className="mx-auto max-w-6xl space-y-4">
          <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              {mensagem || "Ordem não encontrada."}
            </p>
          </div>

          <BotaoAcao href="/ordens">Voltar para ordens</BotaoAcao>
        </section>
      </main>
    );
  }

  const {
    valorPagoOS,
    percentualPagoOS,
    valorRestanteOS,
    pagamentoCompleto,
    osCancelada,
    osPronta,
    osFinalizada,
    atrasada,
  } = dadosCalculados;

  const podeAlterarStatus = !osCancelada && !osFinalizada;
  const podeRegistrarPagamento =
    !osCancelada && !osFinalizada && !pagamentoCompleto;
  const podeFinalizar = osPronta && !osCancelada && !osFinalizada;
  const podeCancelar = !osCancelada;
  const temPagamentoRegistrado =
    valorPagoOS > 0 ||
    percentualPagoOS > 0 ||
    Boolean(ordem.paymentReceivedAt) ||
    Boolean(ordem.payments?.length);

  const historicos = ordem.histories || [];
  const historicosVisiveis = mostrarTodoHistorico
    ? historicos
    : historicos.slice(0, 4);
  const temMaisHistorico = historicos.length > 4;

  const numeroOS = formatarNumeroOS(ordem.osNumber);

  const cidadeEstado = [ordem.customer?.city, ordem.customer?.state]
    .filter(Boolean)
    .join(" - ");

  const numeroComplemento = [
    ordem.customer?.number,
    ordem.customer?.complement,
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-900 dark:text-white lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">
                Detalhes da ordem
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black tracking-tight">
                  OS Nº {numeroOS}
                </h1>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${classeStatus(
                    ordem.status
                  )}`}
                >
                  {nomesStatus[ordem.status] || ordem.status}
                </span>

                {atrasada && (
                  <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">
                    Atrasada
                  </span>
                )}

                <Permissao
                  precisa={[
                    "pagamentos.ver",
                    "pagamentos.registrar",
                    "relatorios.financeiro",
                  ]}
                >
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${classePagamento(
                      percentualPagoOS
                    )}`}
                  >
                    {pagamentoCompleto
                      ? "Pagamento completo"
                      : percentualPagoOS > 0
                        ? "Pagamento parcial"
                        : "Aguardando pagamento"}
                  </span>
                </Permissao>
              </div>

              <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Cliente:{" "}
                <strong className="text-slate-800 dark:text-slate-300">
                  {ordem.customer?.name || "-"}
                </strong>
              </p>

              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Entrada: {formatarData(ordem.openedAt)} • Previsão:{" "}
                <span className={atrasada ? "font-black text-red-700 dark:text-red-400" : ""}>
                  {formatarData(ordem.expectedDeliveryDate)}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <BotaoAcao href="/ordens">Voltar</BotaoAcao>

              <Permissao precisa="ordens.editar">
                {!osFinalizada && !osCancelada && (
                  <BotaoAcao href={`/ordens/${ordem.id}/editar`} variante="laranja">
                    Editar
                  </BotaoAcao>
                )}
              </Permissao>

              <Permissao precisa="ordens.criar">
                <BotaoAcao onClick={duplicarOrdem} variante="escuro">
                  Duplicar
                </BotaoAcao>
              </Permissao>

              <Permissao precisa="pagamentos.registrar">
                {podeRegistrarPagamento && (
                  <BotaoAcao
                    href={`/ordens/${ordem.id}/pagamento`}
                    variante="verde"
                  >
                    Registrar pagamento
                  </BotaoAcao>
                )}
              </Permissao>

              <Permissao precisa="ordens.finalizar">
                {podeFinalizar && (
                  <BotaoAcao href={`/ordens/${ordem.id}/finalizar`} variante="azul">
                    Finalizar OS
                  </BotaoAcao>
                )}
              </Permissao>

              <Permissao precisa="ordens.cancelar">
                {podeCancelar && (
                  <BotaoAcao href={`/ordens/${ordem.id}/cancelar`} variante="vermelho">
                    {osFinalizada ? "Cancelar OS (Devolução / Desistência)" : "Cancelar OS"}
                  </BotaoAcao>
                )}
              </Permissao>

              <Permissao precisa="ordens.reabrir">
                {(osCancelada || osFinalizada) && (
                  <BotaoAcao onClick={reabrirOrdem} variante="verde">
                    Reabrir OS
                  </BotaoAcao>
                )}
              </Permissao>
            </div>
          </div>

          <Permissao precisa="ordens.imprimir">
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
              <a
                href={`/api/ordens/${ordem.id}/imprimir`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Imprimir OS
              </a>

              <a
                href={`/api/ordens/${ordem.id}/etiqueta`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                🏷️ Etiqueta Térmica
              </a>

              <a
                href={`/api/ordens/${ordem.id}/garantia`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                Garantia
              </a>

              <Permissao
                precisa={[
                  "pagamentos.ver",
                  "pagamentos.registrar",
                  "relatorios.financeiro",
                ]}
              >
                {percentualPagoOS > 0 && (
                  <a
                    href={`/api/ordens/${ordem.id}/recibo`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                  >
                    Recibo
                  </a>
                )}
              </Permissao>
            </div>
          </Permissao>
        </header>

        {mensagem && (
          <div
            className={`rounded-2xl p-4 text-sm font-bold ring-1 ${
              mensagem.toLowerCase().includes("sucesso")
                ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
            }`}
          >
            {mensagem}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            titulo="Status"
            valor={nomesStatus[ordem.status] || ordem.status}
            detalhe={
              osFinalizada
                ? "OS finalizada"
                : osCancelada
                  ? "OS cancelada"
                  : "Em andamento"
            }
            destaque={osCancelada ? "red" : osFinalizada ? "green" : "blue"}
          />

          <Permissao
            precisa={[
              "pagamentos.ver",
              "pagamentos.registrar",
              "relatorios.financeiro",
            ]}
          >
            <CardResumo
              titulo="Total da OS"
              valor={formatarMoeda(ordem.totalAmount)}
              destaque="green"
            />

            <CardResumo
              titulo="Pagamento"
              valor={
                pagamentoCompleto
                  ? "Pago"
                  : percentualPagoOS > 0
                    ? "Parcial"
                    : nomesPagamento[ordem.paymentMethod || ""] ||
                      ordem.paymentMethod ||
                      "Aguardando"
              }
              detalhe={
                <div>
                  <p>
                    Pago: {percentualPagoOS}% • {formatarMoeda(valorPagoOS)}
                  </p>
                  <p>Restante: {formatarMoeda(valorRestanteOS)}</p>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{
                        width: `${Math.min(percentualPagoOS, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              }
              destaque={pagamentoCompleto ? "green" : "slate"}
            />
          </Permissao>

          <CardResumo
            titulo="Previsão"
            valor={formatarData(ordem.expectedDeliveryDate)}
            detalhe={atrasada ? "Entrega atrasada" : "Prazo previsto"}
            destaque={atrasada ? "red" : "slate"}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          {podeAlterarStatus ? (
            <Permissao
              precisa={["ordens.alterar_status", "ordens.marcar_pronto"]}
            >
              <StatusRapidoOS ordemId={String(id)} statusAtual={ordem.status} />
            </Permissao>
          ) : (
            <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
              <p className="text-sm font-bold text-blue-600">Status</p>

              <h2 className="mt-1 text-2xl font-black tracking-tight">
                Alterar andamento
              </h2>

              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Esta OS está finalizada ou cancelada. Para alterar o andamento,
                reabra a ordem primeiro.
              </p>

              <Permissao precisa="ordens.reabrir">
                <button
                  type="button"
                  onClick={reabrirOrdem}
                  className="mt-4 rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700"
                >
                  Reabrir OS
                </button>
              </Permissao>
            </section>
          )}

          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <p className="text-sm font-bold text-blue-600">Fluxo da entrega</p>

            <h2 className="mt-1 text-2xl font-black tracking-tight">
              Próxima ação
            </h2>

            <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200 ring-1 ring-slate-100">
              {osCancelada ? (
                <p>Esta OS está cancelada. Reabra somente se for necessário.</p>
              ) : osFinalizada ? (
                <p>Esta OS já foi entregue e finalizada.</p>
              ) : osPronta ? (
                <p>
                  A OS está pronta. Agora você pode finalizar a entrega e
                  registrar quem entregou.
                </p>
              ) : (
                <p>
                  Quando o serviço terminar, altere o status para{" "}
                  <strong>Pronto</strong> e informe o técnico responsável.
                </p>
              )}
            </div>

            <Permissao precisa="ordens.finalizar">
              {podeFinalizar && (
                <Link
                  href={`/ordens/${ordem.id}/finalizar`}
                  className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
                >
                  Finalizar entrega
                </Link>
              )}
            </Permissao>
          </section>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Cliente</p>
              <h2 className="text-2xl font-black tracking-tight">
                Dados do cliente
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <LinhaDetalhe titulo="Nome">{textoSeguro(ordem.customer?.name)}</LinhaDetalhe>
              <LinhaDetalhe titulo="CPF">{textoSeguro(ordem.customer?.cpf)}</LinhaDetalhe>
              <LinhaDetalhe titulo="WhatsApp">
                {textoSeguro(ordem.customer?.whatsapp)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="Telefone">
                {textoSeguro(ordem.customer?.secondaryPhone)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="E-mail">
                {textoSeguro(ordem.customer?.email)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="Endereço">
                {textoSeguro(ordem.customer?.address)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="Bairro">
                {textoSeguro(ordem.customer?.district)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="Cidade / Estado">
                {textoSeguro(cidadeEstado)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="Número / Complemento">
                {textoSeguro(numeroComplemento)}
              </LinhaDetalhe>
            </div>
          </section>

          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5">
              <p className="text-sm font-bold text-blue-600">Equipamento</p>
              <h2 className="text-2xl font-black tracking-tight">
                Dados do equipamento
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <LinhaDetalhe titulo="Equipamento">{equipamentoNome(ordem)}</LinhaDetalhe>
              <LinhaDetalhe titulo="Marca">{textoSeguro(ordem.brand)}</LinhaDetalhe>
              <LinhaDetalhe titulo="Modelo">{textoSeguro(ordem.model)}</LinhaDetalhe>
              <LinhaDetalhe titulo="Número de série">
                {textoSeguro(ordem.serialNumber)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="IMEI">{textoSeguro(ordem.imei)}</LinhaDetalhe>
              <LinhaDetalhe titulo="Senha do aparelho">
                {textoSeguro(ordem.devicePassword)}
              </LinhaDetalhe>
              <LinhaDetalhe titulo="Técnico responsável">
                {textoSeguro(ordem.technicianResponsible || "Ainda não informado")}
              </LinhaDetalhe>
            </div>
          </section>
        </section>

        <WhatsAppOS
          clienteNome={ordem.customer?.name}
          whatsapp={ordem.customer?.whatsapp}
          numeroOS={ordem.osNumber}
          equipamento={equipamentoNome(ordem)}
          valorTotal={ordem.totalAmount}
        />

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5">
            <p className="text-sm font-bold text-blue-600">
              Diagnóstico inicial
            </p>

            <h2 className="text-2xl font-black tracking-tight">
              Descrição da OS
            </h2>
          </div>

          <div className="grid gap-4">
            <div>
              <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                Defeito informado pelo cliente
              </p>
              <TextoLongo valor={ordem.reportedDefect} />
            </div>

            <div>
              <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                Acessórios entregues
              </p>
              <TextoLongo valor={ordem.deliveredAccessories} />
            </div>

            <div>
              <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                Observações gerais
              </p>
              <TextoLongo valor={ordem.technicalNotes} />
            </div>

            <div>
              <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                Peças necessárias
              </p>
              <TextoLongo valor={ordem.requiredParts} />
            </div>
          </div>
        </section>

        <Permissao precisa="ordens.editar">
          <GerenciarPecasTecnicasOS
            ordemId={ordem.id}
            itens={ordem.technicalParts || []}
            bloqueadoPorPagamento={temPagamentoRegistrado}
            finalizada={osFinalizada}
            statusOrdem={ordem.status}
            valorPecasAtual={ordem.partsCost}
            aoAlterar={carregarOrdem}
          />
        </Permissao>

        <Permissao precisa="ordens.ver">
          <PecasTecnicasOS
            ordemId={ordem.id}
            itens={ordem.technicalParts || []}
            podeEstornar={tem("ordens.editar")}
            bloqueadoPorPagamento={temPagamentoRegistrado}
            finalizada={osFinalizada}
            aoAlterar={carregarOrdem}
          />
        </Permissao>

        <Permissao precisa="ordens.ver">
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">Financeiro</p>
                <h2 className="text-2xl font-black tracking-tight">Valores</h2>
              </div>

              <div className="rounded-2xl bg-slate-950 px-5 py-3 text-white">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                  Total da OS
                </p>
                <strong className="text-2xl">
                  {formatarMoeda(ordem.totalAmount)}
                </strong>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <LinhaDetalhe titulo="Valor das peças">
                {formatarMoeda(ordem.partsCost)}
              </LinhaDetalhe>

              <LinhaDetalhe titulo="Mão de obra">
                {formatarMoeda(ordem.laborCost)}
              </LinhaDetalhe>

              <LinhaDetalhe titulo="Desconto">
                {formatarMoeda(ordem.discount)}
              </LinhaDetalhe>

              <LinhaDetalhe titulo="Total">
                <span className="text-lg text-green-700 dark:text-green-400">
                  {formatarMoeda(ordem.totalAmount)}
                </span>
              </LinhaDetalhe>
            </div>

            {ordem.technicianResponsible && (
              <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Comissão do Técnico
                    </p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">
                      {ordem.technicianResponsible}
                      {Number(ordem.technicianProfitPercentSnapshot || 0) > 0 ? (
                        <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          ({ordem.technicianProfitPercentSnapshot}% de comissão)
                        </span>
                      ) : (
                        <span className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          (Sem comissão configurada)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    {osCancelada ? (
                      <span className="inline-flex rounded-full bg-red-100 dark:bg-red-900/30 px-3 py-1 text-xs font-black text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/30">
                        Comissão estornada (OS cancelada)
                      </span>
                    ) : Number(ordem.technicianProfitPercentSnapshot || 0) > 0 ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Comissão Calculada
                        </p>
                        <p className="text-lg font-black text-blue-600 dark:text-blue-400">
                          {formatarMoeda(
                            (Math.max(
                              numeroSeguro(ordem.laborCost) -
                                numeroSeguro(ordem.discount),
                              0
                            ) *
                              Number(ordem.technicianProfitPercentSnapshot || 0)) /
                              100
                          )}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        R$ 0,00
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </Permissao>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Entrega</p>
              <h2 className="text-2xl font-black tracking-tight">
                Finalização da ordem
              </h2>
            </div>

            {ordem.finalization ? (
              <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700 dark:text-green-400 ring-1 ring-green-600/20">
                Finalizada
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-600/20">
                Ainda não finalizada
              </span>
            )}
          </div>

          {ordem.finalization ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Reparo realizado
                </p>
                <TextoLongo valor={ordem.finalization.repairDescription} />
              </div>

              <div>
                <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Peças trocadas
                </p>
                <TextoLongo valor={ordem.finalization.replacedParts} />
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <LinhaDetalhe titulo="Valor final">
                  <Permissao precisa="ordens.ver" fallback="-">
                    {formatarMoeda(ordem.finalization.finalAmount)}
                  </Permissao>
                </LinhaDetalhe>

                <LinhaDetalhe titulo="Garantia">
                  {Number(ordem.finalization.warrantyDays) > 0
                    ? `${ordem.finalization.warrantyDays} dia(s)`
                    : "Sem garantia (peça do cliente)"}
                </LinhaDetalhe>

                <LinhaDetalhe titulo="Data da entrega">
                  {formatarData(ordem.finalization.deliveredAt)}
                </LinhaDetalhe>

                <LinhaDetalhe titulo="Entregue por">
                  {textoSeguro(ordem.finalization.deliveredBy)}
                </LinhaDetalhe>
              </div>

              <div>
                <p className="mb-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Observações finais
                </p>
                <TextoLongo valor={ordem.finalization.finalNotes} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Esta ordem ainda não possui dados de finalização.
              </p>

              <Permissao precisa="ordens.finalizar">
                {podeFinalizar ? (
                  <Link
                    href={`/ordens/${ordem.id}/finalizar`}
                    className="mt-4 inline-flex rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700"
                  >
                    Finalizar ordem
                  </Link>
                ) : !osCancelada ? (
                  <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-sm font-bold text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
                    Para finalizar a OS, primeiro altere o status para PRONTO e
                    informe o técnico responsável.
                  </p>
                ) : null}
              </Permissao>
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Linha do tempo</p>
              <h2 className="text-2xl font-black tracking-tight">Histórico</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                Exibindo {historicosVisiveis.length} de {historicos.length}{" "}
                registro(s).
              </p>
            </div>

            {temMaisHistorico && (
              <button
                type="button"
                onClick={() => setMostrarTodoHistorico((valor) => !valor)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
              >
                {mostrarTodoHistorico ? "Mostrar menos" : "Mostrar tudo"}
              </button>
            )}
          </div>

          {historicos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Nenhum histórico registrado ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {historicosVisiveis.map((historico) => (
                <article
                  key={historico.id}
                  className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100"
                >
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {historico.description || historico.action}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {historico.userName || "Sistema"} •{" "}
                    {formatarDataHora(historico.createdAt)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Permissao precisa="ordens.observacoes">
            <ObservacoesInternasOS ordemId={String(id)} />
          </Permissao>

          <Permissao precisa="ordens.anexos">
            <AnexosOS ordemId={String(id)} />
          </Permissao>
        </section>
      </section>
    </main>
  );
}
