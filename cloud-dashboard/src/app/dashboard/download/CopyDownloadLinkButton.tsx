/**
 * @file CopyDownloadLinkButton.tsx
 * @description Componente interativo (Client Component) para cópia ágil do link direto de download da Release.
 * Permite que revendedores parceiros copiem o link seguro do instalador com um único clique para envio
 * imediato via WhatsApp, e-mail ou Telegram para seus clientes finais, com feedback tátil e visual de confirmação.
 * Resolve automaticamente rotas relativas para links absolutos usando a origem do domínio atual.
 *
 * @module CloudDashboard/Components/CopyDownloadLinkButton
 */

"use client";

import { useState } from "react";

/**
 * Propriedades esperadas pelo botão de cópia de link de download.
 */
interface CopyDownloadLinkButtonProps {
  /** URL de download do executável instalador (.exe) — pode ser absoluta ou relativa como '/api/v1/download/release' */
  url: string;
  /** Rótulo opcional para exibição no botão */
  label?: string;
}

/**
 * Renderiza o botão interativo para copiar o link de download para a área de transferência.
 * 
 * Funcionalidades:
 * - Conversão automática de rota relativa em link absoluto completo (`https://seu-dominio.com/...`).
 * - Acesso à API nativa `navigator.clipboard.writeText`.
 * - Feedback instantâneo com troca de ícone e mensagem de "Link Copiado!" por 2,5 segundos.
 * - Tratamento gracioso de fallback caso a permissão da área de transferência falhe.
 * 
 * @param {CopyDownloadLinkButtonProps} props - Propriedades do componente.
 * @returns {JSX.Element} Botão interativo estilizado.
 */
export default function CopyDownloadLinkButton({
  url,
  label = "Copiar Link de Download",
}: CopyDownloadLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  /**
   * Obtém a URL absoluta para compartilhamento externo.
   */
  const getAbsoluteUrl = () => {
    if (typeof window !== "undefined" && url.startsWith("/")) {
      return `${window.location.origin}${url}`;
    }
    return url;
  };

  const handleCopy = async () => {
    const textToCopy = getAbsoluteUrl();

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback para navegadores legados se necessário
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (err) {
        console.error("Falha ao copiar link:", err);
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Link copiado para a área de transferência" : "Copiar link de download"}
      className={`min-h-[46px] px-4 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer border ${
        copied
          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-md shadow-emerald-950/40 scale-[1.02]"
          : "bg-[#141a29] text-gray-200 hover:text-white hover:bg-[#1a2236] border-gray-700/80 active:scale-95"
      }`}
    >
      {copied ? (
        <>
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-bold text-emerald-300">Link Copiado com Sucesso!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
