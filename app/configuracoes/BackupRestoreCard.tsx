"use client";

import { useEffect, useState } from "react";

type BackupItem = {
  nome: string;
  caminho: string;
  banco?: string;
  temBanco?: boolean;
  temUploads?: boolean;
  criadoEm?: string;
};

type BackupResponse = {
  backups?: BackupItem[];
  message?: string;
  logs?: string[];
};

type BackupRestoreCardProps = {
  podeEditar?: boolean;
};

const BACKUP_AUTO_CONFIG = {
  ativo: true,
  frequencia: "1 vez por dia ao iniciar o sistema",
  retencao: "30 dias",
  minimo: "10 backups",
  maximo: "60 backups",
};

function formatarDataHora(data?: string | null) {
  if (!data) return "-";

  const d = new Date(data);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR");
}

function nomeCurto(caminho?: string) {
  if (!caminho) return "-";

  const partes = caminho.split(/[\\/]/);
  return partes[partes.length - 1] || caminho;
}

function mensagemEhSucesso(mensagem: string) {
  const texto = mensagem.toLowerCase();

  return (
    texto.includes("sucesso") ||
    texto.includes("criado") ||
    texto.includes("restaurado")
  );
}

export default function BackupRestoreCard({
  podeEditar = true,
}: BackupRestoreCardProps) {
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [confirmacao, setConfirmacao] = useState("");

  async function carregarBackups() {
    if (!podeEditar) {
      setBackups([]);
      setCarregando(false);
      return;
    }

    try {
      setCarregando(true);
      setMensagem("");

      const response = await fetch("/api/backups", {
        cache: "no-store",
      });

      const data = (await response.json().catch(() => null)) as
        | BackupResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao listar backups.");
        setBackups([]);
        return;
      }

      setBackups(Array.isArray(data?.backups) ? data.backups : []);
    } catch {
      setMensagem("Erro ao listar backups.");
      setBackups([]);
    } finally {
      setCarregando(false);
    }
  }

  async function gerarBackup() {
    if (!podeEditar || processando) return;

    try {
      setProcessando(true);
      setMensagem("");
      setLogs([]);

      const response = await fetch("/api/backups", {
        method: "POST",
      });

      const data = (await response.json().catch(() => null)) as
        | BackupResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao gerar backup.");
        return;
      }

      setMensagem(data?.message || "Backup criado com sucesso.");
      setLogs(Array.isArray(data?.logs) ? data.logs.filter(Boolean) : []);

      await carregarBackups();
    } catch {
      setMensagem("Erro ao gerar backup.");
    } finally {
      setProcessando(false);
    }
  }

  async function restaurarUltimoBackup() {
    if (!podeEditar || processando) return;

    if (confirmacao.trim() !== "RESTAURAR") {
      setMensagem('Digite exatamente "RESTAURAR" para confirmar.');
      return;
    }

    const confirmou = window.confirm(
      "Confirma a restauração do último backup? O banco atual e os uploads podem ser substituídos."
    );

    if (!confirmou) return;

    try {
      setProcessando(true);
      setMensagem("");
      setLogs([]);

      const response = await fetch("/api/backups/restaurar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmacao,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | BackupResponse
        | null;

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao restaurar backup.");
        return;
      }

      setMensagem(
        data?.message ||
          "Backup restaurado com sucesso. Reinicie o sistema se necessário."
      );

      setLogs(Array.isArray(data?.logs) ? data.logs.filter(Boolean) : []);
      setConfirmacao("");

      await carregarBackups();
    } catch {
      setMensagem("Erro ao restaurar backup.");
    } finally {
      setProcessando(false);
    }
  }

  useEffect(() => {
    carregarBackups();
  }, [podeEditar]);

  const ultimoBackup = backups[0] || null;

  if (!podeEditar) {
    return (
      <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
        Backup e restauração disponíveis apenas para usuários autorizados.
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">Segurança local</p>

          <h2 className="text-2xl font-black tracking-tight">
            Backup e restauração
          </h2>

          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Gere cópias do banco de dados e da pasta de uploads. Use restauração
            apenas quando realmente necessário.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarBackups}
          disabled={carregando || processando}
          className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {carregando ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-green-50 p-4 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
          <p className="text-xs font-black uppercase tracking-wide text-green-700 dark:text-green-400">
            Backup automático
          </p>

          <p className="mt-2 text-lg font-black text-green-800">
            {BACKUP_AUTO_CONFIG.ativo ? "Ativo" : "Inativo"}
          </p>

          <p className="mt-1 text-xs font-semibold text-green-700 dark:text-green-400">
            Proteção automática ao iniciar
          </p>
        </div>

        <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700 dark:text-blue-400">
            Frequência
          </p>

          <p className="mt-2 text-sm font-black text-blue-800">
            {BACKUP_AUTO_CONFIG.frequencia}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-200 dark:ring-slate-800">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Retenção
          </p>

          <p className="mt-2 text-sm font-black text-slate-800 dark:text-slate-300">
            {BACKUP_AUTO_CONFIG.retencao}
          </p>

          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Backups antigos são removidos automaticamente.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Limite
          </p>

          <p className="mt-2 text-sm font-black">
            Mínimo: {BACKUP_AUTO_CONFIG.minimo}
          </p>

          <p className="mt-1 text-sm font-black">
            Máximo: {BACKUP_AUTO_CONFIG.maximo}
          </p>
        </div>
      </div>

      {mensagem && (
        <div
          className={`mb-5 rounded-2xl p-4 text-sm font-bold ring-1 ${
            mensagemEhSucesso(mensagem)
              ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
              : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
          }`}
        >
          {mensagem}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-5 ring-1 ring-slate-100">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              Último backup
            </p>

            {ultimoBackup ? (
              <div className="mt-3 space-y-2">
                <p className="text-base font-black text-slate-900 dark:text-white">
                  {ultimoBackup.nome || nomeCurto(ultimoBackup.caminho)}
                </p>

                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Criado em: {formatarDataHora(ultimoBackup.criadoEm)}
                </p>

                <div className="flex flex-wrap gap-2 pt-2">
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:bg-green-900/20 dark:ring-green-500/30">
                    Banco SQL
                  </span>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${
                      ultimoBackup.temUploads
                        ? "bg-blue-50 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-800"
                    }`}
                  >
                    {ultimoBackup.temUploads ? "Com uploads" : "Sem uploads"}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">
                Nenhum backup encontrado.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={gerarBackup}
            disabled={processando}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-5 py-3 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            <span>{processando ? "Processando..." : "Gerar backup agora"}</span>
          </button>

          <div className="rounded-xl bg-amber-500/10 p-3.5 text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/25">
            Antes de alterações importantes, gere um backup manual. O backup
            automático é diário, mas o manual protege mudanças feitas no mesmo
            dia.
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 p-5 ring-1 ring-red-500/20">
            <p className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              Restaurar último backup
            </p>

            <p className="mt-1.5 text-xs font-medium leading-relaxed text-red-800/80 dark:text-red-300/80">
              A restauração substitui o banco atual e troca os uploads pela
              versão do backup mais recente.
            </p>

            <label className="mt-4 block text-xs font-bold text-red-700 dark:text-red-400">
              Digite RESTAURAR para confirmar
            </label>

            <input
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
              placeholder="RESTAURAR"
              disabled={processando || backups.length === 0}
              className="mt-1.5 w-full rounded-xl border border-red-300/80 dark:border-red-900/50 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <button
              type="button"
              onClick={restaurarUltimoBackup}
              disabled={
                processando ||
                backups.length === 0 ||
                confirmacao.trim() !== "RESTAURAR"
              }
              className="mt-3 w-full rounded-xl bg-red-600 hover:bg-red-500 px-5 py-3 text-xs font-bold text-white shadow-md shadow-red-600/20 transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {processando ? "Processando..." : "Restaurar último backup"}
            </button>
          </div>

          <div className="rounded-2xl bg-slate-950 p-4 text-white ring-1 ring-white/10">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Logs da última operação</p>

            {logs.length === 0 ? (
              <p className="mt-3 text-xs font-medium text-slate-500">
                Nenhum log para exibir.
              </p>
            ) : (
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 text-xs leading-5 text-slate-300 font-mono">
                {logs.join("\n")}
              </pre>
            )}
          </div>
        </div>
      </div>

      {backups.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Backups encontrados
          </p>

          <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200/80 dark:ring-slate-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Backup</th>
                  <th className="p-3">Criado em</th>
                  <th className="p-3">Banco</th>
                  <th className="p-3">Uploads</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {backups.map((backup) => (
                  <tr
                    key={backup.nome || backup.caminho}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="p-3 font-bold text-slate-900 dark:text-white">
                      {backup.nome || nomeCurto(backup.caminho)}
                    </td>

                    <td className="p-3 font-medium text-slate-600 dark:text-slate-400">
                      {formatarDataHora(backup.criadoEm)}
                    </td>

                    <td className="p-3">
                      {backup.temBanco ? (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30">
                          OK
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-300 ring-1 ring-red-500/30">
                          Não
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      {backup.temUploads ? (
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30">
                          OK
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
                          Não
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
