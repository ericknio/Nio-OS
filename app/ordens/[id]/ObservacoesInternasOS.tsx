"use client";

// app/ordens/[id]/ObservacoesInternasOS.tsx
// v1.1.0 - Observações internas com trava local de permissão antes do fetch

import { useEffect, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";
import { formatarDataHora } from "@/lib/formatadores";

type ObservacaoInterna = {
  id: string;
  serviceOrderId: string;
  userName: string;
  note: string;
  createdAt: string;
};

type ObservacoesInternasOSProps = {
  ordemId: string;
};

const LIMITE_OBSERVACAO = 3000;

function mensagemEhSucesso(mensagem: string) {
  return mensagem.toLowerCase().includes("sucesso");
}

function CardMensagem({ mensagem }: { mensagem: string }) {
  if (!mensagem) return null;

  return (
    <span
      className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
        mensagemEhSucesso(mensagem)
          ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
          : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
      }`}
    >
      {mensagem}
    </span>
  );
}

export default function ObservacoesInternasOS({
  ordemId,
}: ObservacoesInternasOSProps) {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVerObservacoes =
    !carregandoPermissoes && tem("ordens.observacoes");

  const [observacoes, setObservacoes] = useState<ObservacaoInterna[]>([]);
  const [note, setNote] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  async function carregarObservacoes() {
    if (!ordemId || !podeVerObservacoes) return;

    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch(`/api/ordens/${ordemId}/observacoes`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar observações.");
        setObservacoes([]);
        return;
      }

      setObservacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar observações."
      );
      setObservacoes([]);
    } finally {
      setCarregando(false);
    }
  }

  async function salvarObservacao() {
    setMensagem("");

    const texto = note.trim();

    if (!podeVerObservacoes) {
      setMensagem("Você não tem permissão para registrar observações internas.");
      return;
    }

    if (!texto) {
      setMensagem("Digite uma observação antes de salvar.");
      return;
    }

    if (texto.length > LIMITE_OBSERVACAO) {
      setMensagem(`A observação deve ter no máximo ${LIMITE_OBSERVACAO} caracteres.`);
      return;
    }

    try {
      setSalvando(true);

      const response = await fetch(`/api/ordens/${ordemId}/observacoes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: texto,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao salvar observação.");
        return;
      }

      setNote("");
      setMensagem("Observação salva com sucesso.");

      await carregarObservacoes();
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao salvar observação."
      );
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (carregandoPermissoes) return;

    if (!podeVerObservacoes) {
      setCarregando(false);
      setObservacoes([]);
      return;
    }

    carregarObservacoes();
  }, [carregandoPermissoes, podeVerObservacoes, ordemId]);

  if (carregandoPermissoes) {
    return (
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        Verificando permissão das observações internas...
      </section>
    );
  }

  if (!podeVerObservacoes) {
    return (
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-red-200">
        <p className="text-sm font-bold text-red-700 dark:text-red-400">
          Você não tem permissão para acessar observações internas desta OS.
        </p>
      </section>
    );
  }

  const caracteresRestantes = LIMITE_OBSERVACAO - note.length;
  const limiteExcedido = caracteresRestantes < 0;

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">Interno</p>

          <h2 className="text-2xl font-black tracking-tight">
            Observações internas
          </h2>

          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Registre acompanhamentos técnicos, avisos e informações que não vão
            para impressão.
          </p>
        </div>

        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-600 dark:text-slate-400">
          {observacoes.length} registro(s)
        </span>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
        <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
          Nova observação
        </label>

        <textarea
          value={note}
          disabled={salvando}
          maxLength={LIMITE_OBSERVACAO + 200}
          onChange={(event) => {
            setNote(event.target.value);
            setMensagem("");
          }}
          rows={4}
          placeholder="Exemplo: cliente pediu urgência, aparelho chegou com arranhão, aguardando retorno..."
          className="w-full resize-none rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800"
        />

        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={`text-xs font-bold ${
              limiteExcedido ? "text-red-700 dark:text-red-400" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {limiteExcedido
              ? `Excedeu ${Math.abs(caracteresRestantes)} caractere(s).`
              : `${caracteresRestantes} caractere(s) restante(s).`}
          </p>

          <p className="text-xs font-semibold text-slate-400">
            O operador será registrado pelo usuário logado.
          </p>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={salvarObservacao}
            disabled={salvando || limiteExcedido}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar observação"}
          </button>

          <CardMensagem mensagem={mensagem} />
        </div>
      </div>

      <div className="mt-5">
        {carregando ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
            Carregando observações...
          </div>
        ) : observacoes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
            Nenhuma observação interna registrada ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {observacoes.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100"
              >
                <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <strong className="text-sm font-black text-slate-900 dark:text-white">
                    {item.userName || "Sistema"}
                  </strong>

                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {formatarDataHora(item.createdAt)}
                  </span>
                </div>

                <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
                  {item.note}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
