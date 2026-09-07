"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Anexo = {
  id: string;
  serviceOrderId: string;
  fileName: string;
  originalName: string;
  url: string;
  mimeType?: string | null;
  size?: number | null;
  createdAt: string;
};

type AnexosOSProps = {
  ordemId: string;
};

const LIMITE_MB = 5;
const TIPOS_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function formatarTamanho(size?: number | null) {
  const valor = Number(size || 0);

  if (!valor) return "-";
  if (valor < 1024) return `${valor} B`;
  if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;

  return `${(valor / 1024 / 1024).toFixed(1)} MB`;
}

function formatarDataHora(data?: string | null) {
  if (!data) return "-";

  const d = new Date(data);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR");
}

function mensagemEhSucesso(mensagem: string) {
  const texto = mensagem.toLowerCase();

  return texto.includes("sucesso") || texto.includes("removido");
}

function ehImagem(anexo: Anexo) {
  return Boolean(anexo.mimeType?.startsWith("image/"));
}

export default function AnexosOS({ ordemId }: AnexosOSProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [excluindoId, setExcluindoId] = useState("");
  const [mensagem, setMensagem] = useState("");

  async function carregarAnexos() {
    try {
      setCarregando(true);

      const response = await fetch(`/api/ordens/${ordemId}/anexos`, {
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao carregar anexos.");
        setAnexos([]);
        return;
      }

      setAnexos(Array.isArray(data) ? data : []);
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao carregar anexos."
      );
      setAnexos([]);
    } finally {
      setCarregando(false);
    }
  }

  function selecionarArquivo(file?: File | null) {
    setMensagem("");

    if (!file) {
      setArquivo(null);
      return;
    }

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setArquivo(null);
      setMensagem("Arquivo inválido. Envie JPG, PNG, WEBP ou PDF.");
      return;
    }

    if (file.size > LIMITE_MB * 1024 * 1024) {
      setArquivo(null);
      setMensagem(`Arquivo muito grande. Limite máximo: ${LIMITE_MB}MB.`);
      return;
    }

    setArquivo(file);
  }

  async function enviarAnexo() {
    setMensagem("");

    if (!arquivo) {
      setMensagem("Selecione um arquivo antes de enviar.");
      return;
    }

    try {
      setEnviando(true);

      const formData = new FormData();
      formData.append("file", arquivo);

      const response = await fetch(`/api/ordens/${ordemId}/anexos`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao enviar anexo.");
        return;
      }

      setArquivo(null);

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      setMensagem("Anexo enviado com sucesso.");
      await carregarAnexos();
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao enviar anexo."
      );
    } finally {
      setEnviando(false);
    }
  }

  async function excluirAnexo(anexo: Anexo) {
    const confirmar = confirm(
      `Deseja realmente excluir o anexo "${anexo.originalName}"?`
    );

    if (!confirmar) return;

    try {
      setMensagem("");
      setExcluindoId(anexo.id);

      const response = await fetch(
        `/api/ordens/${ordemId}/anexos/${anexo.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMensagem(data?.message || "Erro ao excluir anexo.");
        return;
      }

      setMensagem("Anexo removido com sucesso.");
      await carregarAnexos();
    } catch (error) {
      setMensagem(
        error instanceof Error ? error.message : "Erro ao excluir anexo."
      );
    } finally {
      setExcluindoId("");
    }
  }

  useEffect(() => {
    if (ordemId) carregarAnexos();
  }, [ordemId]);

  return (
    <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">Arquivos</p>

          <h2 className="text-2xl font-black tracking-tight">Anexos da OS</h2>

          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
            Envie fotos do aparelho, defeito, comprovantes ou documentos.
          </p>
        </div>

        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-600 dark:text-slate-400">
          {anexos.length} anexo(s)
        </span>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
        <label className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
          Selecionar arquivo
        </label>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={enviando}
            onChange={(event) => selecionarArquivo(event.target.files?.[0])}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800"
          />

          <button
            type="button"
            onClick={enviarAnexo}
            disabled={enviando || !arquivo}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Enviando..." : "Enviar anexo"}
          </button>
        </div>

        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Permitido: JPG, PNG, WEBP ou PDF. Limite máximo: {LIMITE_MB}MB.
        </p>

        {arquivo && (
          <p className="mt-2 text-xs font-black text-blue-700 dark:text-blue-400">
            Selecionado: {arquivo.name} • {formatarTamanho(arquivo.size)}
          </p>
        )}

        {mensagem && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ring-1 ${
              mensagemEhSucesso(mensagem)
                ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
            }`}
          >
            {mensagem}
          </div>
        )}
      </div>

      <div className="mt-5">
        {carregando ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
            Carregando anexos...
          </div>
        ) : anexos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
            Nenhum anexo enviado ainda.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {anexos.map((anexo) => (
              <article
                key={anexo.id}
                className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3 ring-1 ring-slate-100"
              >
                {ehImagem(anexo) ? (
                  <button
                    type="button"
                    onClick={() => window.open(anexo.url, "_blank")}
                    className="mb-3 block w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <Image
                      src={anexo.url}
                      alt={anexo.originalName}
                      width={640}
                      height={360}
                      className="h-40 w-full object-cover"
                      unoptimized
                    />
                  </button>
                ) : (
                  <div className="mb-3 flex h-28 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-black text-slate-500 dark:text-slate-400">
                    PDF / Documento
                  </div>
                )}

                <div>
                  <p className="break-all text-sm font-black text-slate-900 dark:text-white">
                    {anexo.originalName}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatarTamanho(anexo.size)} •{" "}
                    {formatarDataHora(anexo.createdAt)}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(anexo.url, "_blank")}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-slate-800"
                  >
                    Abrir
                  </button>

                  <button
                    type="button"
                    onClick={() => excluirAnexo(anexo)}
                    disabled={excluindoId === anexo.id}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {excluindoId === anexo.id ? "Excluindo..." : "Excluir"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}