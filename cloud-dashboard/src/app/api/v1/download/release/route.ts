/**
 * @file route.ts
 * @description Ponto de terminação da API REST (/api/v1/download/release) para download direto da Release do Nio-OS.
 * Atua como um Proxy de Streaming reverso inteligente: obtém o executável instalador (.exe) diretamente
 * dos servidores de release em nuvem nos bastidores e encaminha o fluxo binário (ReadableStream) em tempo real
 * para o cliente, ocultando completamente o repositório e a conta do GitHub na entrega.
 *
 * @module CloudDashboard/API/v1/Download/Release
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Repositório padrão onde os binários de instalação são publicados nos bastidores */
const RELEASES_REPO = "ericknio/nio-os-releases";

/** URL de fallback estável caso a API de releases esteja indisponível */
const FALLBACK_DOWNLOAD_URL =
  "https://github.com/ericknio/nio-os-releases/releases/download/v0.1.4/Nio-OS.Setup.0.1.4.exe";

/** Nome padrão do arquivo executável entregue ao cliente */
const DEFAULT_FILENAME = "Nio-OS.Setup.0.1.4.exe";

/**
 * Consulta a URL direta do binário executável da versão estável mais recente.
 * 
 * @returns {Promise<{ downloadUrl: string; fileName: string }>} URL do binário e nome do arquivo.
 */
async function resolveReleaseBinary(): Promise<{ downloadUrl: string; fileName: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: {
        "User-Agent": "Nio-OS-Cloud-Dashboard",
        Accept: "application/vnd.github.v3+json",
      },
      signal: controller.signal,
      next: { revalidate: 300 }, // Cache de metadados por 5 minutos
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const assetExe = Array.isArray(data.assets)
        ? data.assets.find(
            (a: { name?: string; browser_download_url?: string }) =>
              String(a?.name || "").toLowerCase().endsWith(".exe")
          )
        : null;

      if (assetExe && assetExe.browser_download_url) {
        return {
          downloadUrl: assetExe.browser_download_url,
          fileName: assetExe.name || DEFAULT_FILENAME,
        };
      }
    }
  } catch (err) {
    console.warn("Aviso ao consultar metadados da release, utilizando URL de fallback:", err);
  }

  return {
    downloadUrl: FALLBACK_DOWNLOAD_URL,
    fileName: DEFAULT_FILENAME,
  };
}

/**
 * Processa a requisição GET realizando o Proxy de Streaming do instalador executável.
 * O servidor busca o arquivo nos bastidores e transmite os pacotes diretamente ao cliente,
 * mascarando a origem e definindo os cabeçalhos nativos de anexo para download imediato.
 * 
 * @returns {Promise<Response>} Resposta de fluxo binário (stream) com Content-Disposition.
 */
export async function GET() {
  const { downloadUrl, fileName } = await resolveReleaseBinary();

  try {
    // Faz a requisição servidor-a-servidor seguindo os redirecionamentos do storage de origem
    const upstream = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "Nio-OS-Release-Proxy",
      },
      redirect: "follow",
    });

    if (!upstream.ok || !upstream.body) {
      console.error(`Erro ao buscar binário no upstream (${upstream.status}):`, upstream.statusText);
      return new NextResponse("Falha ao obter o pacote de instalação. Tente novamente mais tarde.", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const headers = new Headers();
    headers.set("Content-Disposition", `attachment; filename="${fileName}"`);
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream"
    );

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    // Cache no navegador e CDN para otimizar transferências
    headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
    headers.set("Access-Control-Allow-Origin", "*");

    // Retorna o fluxo binário diretamente para o cliente em tempo real
    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Erro no streaming do arquivo de release:", error);
    return new NextResponse("Erro interno ao transmitir arquivo.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * Trata requisições HTTP OPTIONS pré-voo (CORS preflight).
 * 
 * @returns {Promise<NextResponse>} Resposta HTTP 204 No Content com cabeçalhos CORS liberados.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
