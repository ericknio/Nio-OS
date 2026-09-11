/**
 * @file route.ts
 * @description Endpoint catch-all (`[...path]`) para entrega de arquivos de mídia e uploads armazenados
 * dinamicamente no storage de runtime da aplicação.
 *
 * Mecanismos de Proteção e Segurança:
 * 1. Sanitização de Traversal: Sanitiza cada segmento do caminho aplicando `decodeURIComponent`, `path.basename`
 *    e filtrando referências perigosas como `.` ou `..`.
 * 2. Validação de Fronteira (Sandbox): Valida com `path.resolve` se o arquivo de destino reside estritamente
 *    dentro da raiz de uploads do runtime (`caminhoUploadPublico`).
 * 3. Headers Anti-Cache: Emite diretivas estritas de cache (`no-store, no-cache, must-revalidate, max-age=0`)
 *    para assegurar que atualizações de imagens/logos reflitam imediatamente no navegador.
 */

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tipagem do contexto da rota dinâmica catch-all do Next.js App Router.
 */
type Contexto = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

/**
 * Retorna o cabeçalho Content-Type correspondente à extensão do arquivo solicitado.
 *
 * @param arquivo - Nome ou caminho do arquivo
 * @returns String com o tipo MIME apropriado
 */
function mimeType(arquivo: string) {
  const ext = path.extname(arquivo).toLowerCase();

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".pdf") return "application/pdf";

  return "application/octet-stream";
}

/**
 * Sanitiza cada parte do caminho da URL decodificando caracteres URI e isolando apenas
 * o basename de cada segmento para impedir ataques de Directory Traversal.
 *
 * @param partes - Array com os segmentos da URL
 * @returns Array com os segmentos limpos e seguros
 */
function partesSeguras(partes: string[]) {
  return partes
    .map((parte) => decodeURIComponent(String(parte || "")).trim())
    .filter(Boolean)
    .map((parte) => path.basename(parte))
    .filter((parte) => parte && parte !== "." && parte !== "..");
}

/**
 * Monta o caminho absoluto no sistema de arquivos e valida se ele não ultrapassa
 * os limites do diretório de uploads público em runtime.
 *
 * @param partes - Segmentos do caminho relativos à pasta de uploads
 * @throws Error caso o arquivo resolva fora do diretório base
 * @returns Caminho absoluto seguro do arquivo
 */
function caminhoUploadRuntime(partes: string[]) {
  const base = caminhoUploadPublico();
  const seguras = partesSeguras(partes);
  const arquivo = path.resolve(base, ...seguras);
  const baseResolvida = path.resolve(base);

  if (arquivo !== baseResolvida && !arquivo.startsWith(baseResolvida + path.sep)) {
    throw new Error("Caminho de upload inválido.");
  }

  return arquivo;
}

/**
 * Handler GET para entrega do binário do arquivo de upload armazenado em runtime.
 *
 * @param _request - Requisição HTTP recebida
 * @param contexto - Contexto contendo os segmentos dinâmicos da rota
 * @returns Resposta com buffer do arquivo ou status 404
 */
export async function GET(_request: Request, contexto: Contexto) {
  try {
    const params = await contexto.params;
    const partes = Array.isArray(params?.path) ? params.path : [];

    if (partes.length === 0) {
      return NextResponse.json({ message: "Arquivo não informado." }, { status: 400 });
    }

    const arquivo = caminhoUploadRuntime(partes);
    const stat = await fs.stat(arquivo);

    if (!stat.isFile()) {
      return NextResponse.json({ message: "Arquivo não encontrado." }, { status: 404 });
    }

    const buffer = await fs.readFile(arquivo);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType(arquivo),
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("Erro ao carregar upload runtime:", error);
    }

    return NextResponse.json(
      { message: "Arquivo não encontrado." },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

