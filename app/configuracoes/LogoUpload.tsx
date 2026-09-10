/**
 * @file app/configuracoes/LogoUpload.tsx
 * @description Componente de Upload e Gestão da Logomarca da Loja (Frontend).
 * 
 * Funcionalidades:
 * - Permite trocar a logomarca da empresa exibida nos comprovantes e relatórios.
 * - Validações de segurança: formato estrito PNG e tamanho limite de 2MB.
 * - Pré-visualização imediata da imagem antes da submissão para `/api/configuracoes/logo`.
 */

"use client";

import { useState } from "react";

type LogoUploadProps = {
  podeEditar?: boolean;
};

function mensagemEhSucesso(mensagem: string) {
  return mensagem.toLowerCase().includes("sucesso");
}

/**
 * Componente que renderiza o seletor e preview da logomarca da empresa.
 * 
 * @param props.podeEditar - Flag indicando se o usuário possui permissão para trocar a logo
 */
export default function LogoUpload({ podeEditar = true }: LogoUploadProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState(`/uploads/logo.png?v=${Date.now()}`);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  function selecionarArquivo(file: File | null) {
    setMensagem("");

    if (!podeEditar) {
      setArquivo(null);
      setMensagem("Você não tem permissão para alterar a logo.");
      return;
    }

    if (!file) {
      setArquivo(null);
      return;
    }

    const ehPng =
      file.type === "image/png" || file.name.toLowerCase().endsWith(".png");

    if (!ehPng) {
      setArquivo(null);
      setMensagem("Escolha uma imagem no formato PNG.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
      setArquivo(null);
      setMensagem("A logo deve ter no máximo 2MB.");
      return;
    }

    setArquivo(file);
    setPreview(URL.createObjectURL(file));
  }

  async function enviarLogo() {
    if (!podeEditar) {
      setMensagem("Você não tem permissão para alterar a logo.");
      return;
    }

    if (!arquivo) {
      setMensagem("Escolha uma imagem PNG antes de salvar.");
      return;
    }

    try {
      setSalvando(true);
      setMensagem("");

      const formData = new FormData();
      formData.append("logo", arquivo);

      const response = await fetch("/api/configuracoes/logo", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao atualizar logo.");
        return;
      }

      setPreview(data?.logoUrl || `/uploads/logo.png?v=${Date.now()}`);
      setArquivo(null);
      setMensagem("Logo atualizada com sucesso.");
    } catch {
      setMensagem("Erro ao atualizar logo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-5">
        <p className="text-sm font-bold text-blue-600">Identidade visual</p>

        <h2 className="text-2xl font-black tracking-tight">Logo do sistema</h2>

        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
          Envie uma logo em PNG. Ela será usada no menu lateral e nos documentos
          impressos.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[170px_1fr] md:items-center">
        <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-3xl bg-slate-50 dark:bg-slate-800/50 ring-1 ring-slate-200 dark:ring-slate-800">
          <img
            src={preview}
            alt="Logo atual"
            className="h-full w-full object-contain"
            onError={() => {
              setPreview(
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='24' fill='%23f1f5f9'/%3E%3Ctext x='80' y='83' text-anchor='middle' font-size='14' font-family='Arial' fill='%2364758b'%3ESem logo%3C/text%3E%3C/svg%3E"
              );
            }}
          />
        </div>

        <div className="space-y-4">
          <input
            type="file"
            accept="image/png,.png"
            disabled={!podeEditar || salvando}
            onChange={(event) => {
              selecionarArquivo(event.target.files?.[0] || null);
            }}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-semibold text-slate-900 dark:text-slate-100 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400"
          />

          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3.5 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400 ring-1 ring-slate-200/60 dark:ring-slate-800">
            <p>Formato permitido: PNG.</p>
            <p>Tamanho máximo: 2MB.</p>
            <p>Arquivo salvo em: public/uploads/logo.png.</p>
          </div>

          {mensagem && (
            <div
              className={`rounded-xl p-3 text-xs font-bold ring-1 ${
                mensagemEhSucesso(mensagem)
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
                  : "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/30"
              }`}
            >
              {mensagem}
            </div>
          )}

          <button
            type="button"
            onClick={enviarLogo}
            disabled={!podeEditar || salvando || !arquivo}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/25 transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{salvando ? "Salvando..." : "Salvar logo"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}