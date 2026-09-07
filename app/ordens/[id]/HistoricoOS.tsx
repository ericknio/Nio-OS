"use client";

import { useEffect, useState } from "react";

type HistoricoItem = {
  id: string;
  ordemId: string;
  acao: string;
  descricao?: string | null;
  criadoEm: string;
};

type HistoricoOSProps = {
  ordemId: string;
};

function formatarDataHora(data: string) {
  const d = new Date(data);

  if (Number.isNaN(d.getTime())) {
    return "-";
  }

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();

  const hora = String(d.getHours()).padStart(2, "0");
  const minuto = String(d.getMinutes()).padStart(2, "0");

  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

export default function HistoricoOS({ ordemId }: HistoricoOSProps) {
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarHistorico() {
      try {
        setCarregando(true);

        const response = await fetch(`/api/ordens/${ordemId}/historico`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Erro ao carregar histórico");
        }

        const data = await response.json();
        setHistorico(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Erro ao carregar histórico da OS:", error);
        setHistorico([]);
      } finally {
        setCarregando(false);
      }
    }

    if (ordemId) {
      carregarHistorico();
    }
  }, [ordemId]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Histórico da OS
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registro automático das movimentações desta ordem.
          </p>
        </div>

        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-400">
          {historico.length} registro(s)
        </span>
      </div>

      {carregando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando histórico...</p>
      ) : historico.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
          Nenhum histórico registrado ainda.
        </div>
      ) : (
        <div className="space-y-4">
          {historico.map((item, index) => (
            <div key={item.id} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {index + 1}
                </div>

                {index < historico.length - 1 && (
                  <div className="mt-2 h-full min-h-8 w-px bg-slate-200" />
                )}
              </div>

              <div className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {item.acao}
                  </h3>

                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatarDataHora(item.criadoEm)}
                  </span>
                </div>

                {item.descricao && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {item.descricao}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}