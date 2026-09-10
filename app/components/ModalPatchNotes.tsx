/**
 * @file app/components/ModalPatchNotes.tsx
 * @description Modal interativo de Notas de Atualização (Patch Notes / Changelog).
 * 
 * Funcionalidades:
 * - Detecção automática no primeiro login após um update de versão através de `localStorage` (`nio_os_last_seen_patch_notes`).
 * - Abertura manual para inspeção de histórico via tela de atualizações (`/configuracoes/atualizacoes`).
 * - Apresentação de novidades classificadas em Destaques, Melhorias e Correções com badges estilizadas.
 */

"use client";

import { useEffect, useState } from "react";
import {
  HISTORICO_RELEASES,
  ReleaseInfo,
  VERSAO_ATUAL_SISTEMA,
  compararVersoes,
} from "@/lib/versoesSistema";

const STORAGE_KEY = "nio_os_last_seen_patch_notes";

interface ModalPatchNotesProps {
  versaoEspecifica?: string;
  abrirManualmente?: boolean;
  onClose?: () => void;
}

/**
 * Componente modal de Changelog e notas de versão.
 * 
 * @param props.versaoEspecifica Versão opcional a ser exibida (se omitida, exibe a versão atual do sistema).
 * @param props.abrirManualmente Se verdadeiro, ignora o storage e abre imediatamente.
 * @param props.onClose Callback acionado ao fechar a modal.
 */
export default function ModalPatchNotes({
  versaoEspecifica,
  abrirManualmente = false,
  onClose,
}: ModalPatchNotesProps) {
  const [aberto, setAberto] = useState(false);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  useEffect(() => {
    // Se foi solicitado abrir manualmente para uma versão específica
    if (abrirManualmente) {
      const versaoAlvo = versaoEspecifica || VERSAO_ATUAL_SISTEMA;
      const r =
        HISTORICO_RELEASES.find((item) => item.version === versaoAlvo) ||
        HISTORICO_RELEASES[0];
      setRelease(r);
      setAberto(true);
      return;
    }

    // Caso contrário, verificar se é a primeira vez que o usuário vê a versão atual instalada
    try {
      const ultimaVista = localStorage.getItem(STORAGE_KEY);

      // Se nunca viu ou se a versão atual do sistema for superior à última vista
      if (!ultimaVista || compararVersoes(VERSAO_ATUAL_SISTEMA, ultimaVista) > 0) {
        const r =
          HISTORICO_RELEASES.find(
            (item) => item.version === VERSAO_ATUAL_SISTEMA
          ) || HISTORICO_RELEASES[0];

        setRelease(r);
        setAberto(true);
      }
    } catch {
      // Ignorar erros de localStorage em ambientes com restrição de storage
    }
  }, [abrirManualmente, versaoEspecifica]);

  function fecharModal() {
    try {
      // Salvar que o usuário já visualizou as notas desta versão atual
      localStorage.setItem(STORAGE_KEY, VERSAO_ATUAL_SISTEMA);
    } catch {}

    setAberto(false);
    if (onClose) onClose();
  }

  if (!aberto || !release) return null;

  const itensAdicionados = release.itens.filter((i) => i.tipo === "adicionado");
  const itensModificados = release.itens.filter((i) => i.tipo === "modificado");
  const itensCorrigidos = release.itens.filter((i) => i.tipo === "corrigido");

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl transition-all">
        {/* Header Decorativo */}
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 text-white sm:p-7">
          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-wider backdrop-blur-md">
                <span>🚀 Notas de Atualização</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-blue-900">
                  v{release.version}
                </span>
              </div>

              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                {release.titulo}
              </h2>

              <p className="mt-1 text-xs font-semibold text-blue-100/90">
                Lançado em {release.data}
              </p>
            </div>

            <button
              onClick={fecharModal}
              className="rounded-full bg-black/20 p-2 text-white/80 transition hover:bg-black/40 hover:text-white"
              title="Fechar"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="relative z-10 mt-3 text-sm font-medium text-white/90">
            {release.resumo}
          </p>

          {/* Efeito sutil de brilho de fundo */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        </div>

        {/* Conteúdo com scroll */}
        <div className="max-h-[60vh] space-y-6 overflow-y-auto p-6 sm:p-7">
          {/* Adicionado */}
          {itensAdicionados.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  O que foi adicionado ({itensAdicionados.length})
                </h3>
              </div>

              <div className="space-y-2.5">
                {itensAdicionados.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3.5 dark:border-emerald-900/30 dark:bg-emerald-950/20"
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.titulo}
                    </p>
                    {item.descricao && (
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.descricao}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modificado */}
          {itensModificados.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </span>
                <h3 className="text-sm font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Melhorias e Modificações ({itensModificados.length})
                </h3>
              </div>

              <div className="space-y-2.5">
                {itensModificados.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3.5 dark:border-amber-900/30 dark:bg-amber-950/20"
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.titulo}
                    </p>
                    {item.descricao && (
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.descricao}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Corrigido */}
          {itensCorrigidos.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">
                  Correções de Bugs ({itensCorrigidos.length})
                </h3>
              </div>

              <div className="space-y-2.5">
                {itensCorrigidos.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3.5 dark:border-blue-900/30 dark:bg-blue-950/20"
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {item.titulo}
                    </p>
                    {item.descricao && (
                      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                        {item.descricao}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com botão de confirmação */}
        <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Você pode rever as notas a qualquer momento em <strong>Configurações &gt; Atualizações</strong>.
          </p>

          <button
            onClick={fecharModal}
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:from-blue-500 hover:to-indigo-500 active:scale-95"
          >
            Entendido, continuar para o sistema
          </button>
        </div>
      </div>
    </div>
  );
}
