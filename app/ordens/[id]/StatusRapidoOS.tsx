/**
 * @file app/ordens/[id]/StatusRapidoOS.tsx
 * @description Componente de Troca Rápida de Status da Ordem de Serviço.
 * 
 * Funcionalidades:
 * - Permite avançar ou retroceder os estágios operacionais da O.S. (Recebido, Em análise, Aguardando peça, Em reparo, Pronto).
 * - Ao marcar como "PRONTO", exige a confirmação do técnico responsável e dispara a conversão das peças de RESERVADAS para CONSUMIDAS.
 * - Utiliza chaves de idempotência para evitar duplicidade em disparos de rede.
 */

"use client";

import { useEffect, useRef, useState } from "react";

type StatusRapidoOSProps = {
  ordemId: string;
  statusAtual: string;
};

type Tecnico = {
  id: string;
  name: string;
};

type TentativaPronto = {
  key: string;
  orderId: string;
  expectedCurrentStatus: string;
  technicianUserId: string;
};

const STATUS_OPTIONS = [
  { value: "RECEBIDO", label: "Recebido" },
  { value: "EM_ANALISE", label: "Em análise" },
  { value: "AGUARDANDO_PECA", label: "Aguardando peça" },
  { value: "EM_REPARO", label: "Em reparo" },
  { value: "PRONTO", label: "Pronto" },
] as const;

const nomesStatus = Object.fromEntries(
  STATUS_OPTIONS.map((item) => [item.value, item.label])
);

function mensagemEhSucesso(mensagem: string) {
  return mensagem.toLowerCase().includes("sucesso");
}

/**
 * Componente que renderiza a barra de status rápida e modal de confirmação de conclusão técnica.
 * 
 * @param props.ordemId - Identificador da ordem de serviço
 * @param props.statusAtual - Status atual registrado no banco
 */
export default function StatusRapidoOS({
  ordemId,
  statusAtual,
}: StatusRapidoOSProps) {
  const [status, setStatus] = useState(statusAtual);
  const [technicianUserId, setTechnicianUserId] = useState("");
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregandoTecnicos, setCarregandoTecnicos] = useState(false);
  const [erroTecnicos, setErroTecnicos] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [tentativaPronto, setTentativaPronto] = useState<TentativaPronto | null>(null);
  const requestEmAndamentoRef = useRef(false);

  const precisaTecnico = status === "PRONTO";
  const statusMudou = status !== statusAtual;

  useEffect(() => {
    if (!precisaTecnico) {
      setTechnicianUserId("");
      setTecnicos([]);
      setErroTecnicos("");
      setCarregandoTecnicos(false);
      return;
    }

    const controller = new AbortController();
    setCarregandoTecnicos(true);
    setErroTecnicos("");

    fetch("/api/ordens/tecnicos", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || "Não foi possível carregar os técnicos.");
        }
        return Array.isArray(data?.tecnicos) ? (data.tecnicos as Tecnico[]) : [];
      })
      .then((lista) => {
        setTecnicos(lista);
        setTechnicianUserId((atual) =>
          lista.some((tecnico) => tecnico.id === atual) ? atual : ""
        );
        if (lista.length === 0) {
          setErroTecnicos(
            "Nenhum técnico ativo cadastrado. Cadastre ou ative um técnico antes de concluir a OS."
          );
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTecnicos([]);
        setTechnicianUserId("");
        setErroTecnicos(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os técnicos."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregandoTecnicos(false);
      });

    return () => controller.abort();
  }, [precisaTecnico]);

  async function salvarStatus() {
    setMensagem("");

    if (!statusMudou) {
      setMensagem("Escolha um status diferente do atual.");
      return;
    }

    if (precisaTecnico && !technicianUserId) {
      setMensagem("Selecione o técnico responsável pelo serviço.");
      return;
    }

    if (requestEmAndamentoRef.current) return;
    requestEmAndamentoRef.current = true;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      setSalvando(true);

      let tentativa: TentativaPronto | null = null;
      if (precisaTecnico) {
        const tentativaCompativel =
          tentativaPronto &&
          tentativaPronto.orderId === ordemId &&
          tentativaPronto.expectedCurrentStatus === statusAtual &&
          tentativaPronto.technicianUserId === technicianUserId
            ? tentativaPronto
            : null;

        if (tentativaCompativel) {
          tentativa = tentativaCompativel;
        } else {
          if (typeof globalThis.crypto?.randomUUID !== "function") {
            setMensagem("Não foi possível preparar a confirmação com segurança.");
            return;
          }
          tentativa = {
            key: globalThis.crypto.randomUUID(),
            orderId: ordemId,
            expectedCurrentStatus: statusAtual,
            technicianUserId,
          };
          setTentativaPronto(tentativa);
        }
      }

      const controller = precisaTecnico ? new AbortController() : null;
      if (controller) {
        timeoutId = setTimeout(() => controller.abort(), 30_000);
      }

      const response = await fetch(`/api/ordens/${ordemId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(tentativa ? { "Idempotency-Key": tentativa.key } : {}),
        },
        body: JSON.stringify(
          tentativa
            ? {
                status: "PRONTO",
                expectedCurrentStatus: tentativa.expectedCurrentStatus,
                confirmation: true,
                technicianUserId: tentativa.technicianUserId,
              }
            : { status }
        ),
        ...(controller ? { signal: controller.signal } : {}),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 409) {
          setTentativaPronto(null);
          setMensagem(
            data?.message ||
              "A OS foi alterada. Atualize os dados antes de tentar novamente."
          );
          setTimeout(() => window.location.reload(), 500);
          return;
        }
        if (response.status !== 503 && response.status !== 408) {
          setTentativaPronto(null);
        }
        setMensagem(data?.message || "Erro ao alterar status.");
        return;
      }

      setTentativaPronto(null);
      setMensagem("Status alterado com sucesso.");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      if (
        precisaTecnico &&
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        setMensagem("A resposta demorou mais que o esperado. Tente novamente.");
        return;
      }
      setMensagem(
        precisaTecnico
          ? "Não foi possível confirmar a resposta. Tente novamente."
          : "Erro ao alterar status."
      );
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      requestEmAndamentoRef.current = false;
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-5">
        <p className="text-sm font-bold text-blue-600">Status</p>
        <h2 className="text-2xl font-black tracking-tight">Alterar andamento</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          Status atual:{" "}
          <strong className="text-slate-800 dark:text-slate-300">
            {nomesStatus[statusAtual] || statusAtual}
          </strong>
          . Para cancelar, use a tela própria de cancelamento.
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
              Novo status
            </label>
            <select
              value={status}
              disabled={salvando}
              onChange={(event) => {
                setStatus(event.target.value);
                setMensagem("");
                setTentativaPronto(null);
              }}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={salvarStatus}
              disabled={
                salvando ||
                !statusMudou ||
                (precisaTecnico &&
                  (carregandoTecnicos || !technicianUserId))
              }
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              {salvando
                ? "Salvando..."
                : tentativaPronto && precisaTecnico
                  ? "Tentar novamente"
                  : "Salvar status"}
            </button>
          </div>
        </div>

        {precisaTecnico && (
          <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/40 p-4 ring-1 ring-blue-100 dark:ring-blue-900/60">
            <label className="mb-1 block text-sm font-black text-blue-700 dark:text-blue-400">
              Técnico responsável pelo serviço *
            </label>

            <select
              value={technicianUserId}
              disabled={salvando || carregandoTecnicos}
              onChange={(event) => {
                const novoTecnicoId = event.target.value;
                setTechnicianUserId(novoTecnicoId);
                setTentativaPronto((tentativa) =>
                  tentativa && tentativa.technicianUserId !== novoTecnicoId
                    ? null
                    : tentativa
                );
                setMensagem("");
              }}
              className="w-full rounded-xl border border-blue-200 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800"
            >
              <option value="">
                {carregandoTecnicos
                  ? "Carregando técnicos..."
                  : "Selecione um técnico"}
              </option>
              {tecnicos.map((tecnico) => (
                <option key={tecnico.id} value={tecnico.id}>
                  {tecnico.name}
                </option>
              ))}
            </select>

            <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
              O percentual de participação é aplicado automaticamente pelo
              servidor conforme o cadastro atual do técnico e fica registrado
              na OS quando ela é marcada como pronta.
            </p>

            {erroTecnicos && (
              <p className="mt-2 text-xs font-black text-red-700 dark:text-red-400">
                {erroTecnicos}
              </p>
            )}
          </div>
        )}

        {mensagem && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-bold ring-1 ${
              mensagemEhSucesso(mensagem)
                ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
            }`}
          >
            {mensagem}
          </div>
        )}
      </div>
    </section>
  );
}
