/**
 * @file route.ts
 * @description Endpoint catch-all para servir arquivos a partir da rota canônica `/uploads/[...path]`.
 *
 * Mecanismos de Proteção e Regras:
 * 1. Resolução Dinâmica de Runtime: Determina o caminho base de dados em `APPDATA/Nio-OS` (Windows) ou `.nio-os` (Linux/Unix),
 *    ou a partir das variáveis `NIO_OS_DATA_DIR` / `NIO_OS_APPDATA_DIR`.
 * 2. Controle de Acesso a Anexos: Se a requisição apontar para o subdiretório `anexos`, exige sessão ativa via `obterUsuarioLogado()`,
 *    retornando status 401 caso não autenticado.
 * 3. Prevenção de Path Traversal: Sanitiza cada segmento do caminho com `path.basename` e valida se o caminho final
 *    começa estritamente no diretório base de uploads.
 * 4. Headers Anti-Cache: Aplica cabeçalhos agressivos de não-cacheamento para manter consistência imediata com uploads recentes.
 */

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { obterUsuarioLogado } from "@/lib/authSistema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tipagem para o contexto da rota catch-all do Next.js App Router.
 */
type Contexto = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

/**
 * Determina o diretório base de dados da aplicação em runtime, respeitando
 * variáveis de ambiente ou o diretório padrão do sistema operacional do usuário.
 *
 * @returns Caminho absoluto para a pasta de dados do Nio-OS
 */
function raizDadosRuntime() {
  const direto = process.env.NIO_OS_DATA_DIR || process.env.NIO_OS_APPDATA_DIR;

  if (direto) return direto;

  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || process.cwd(), "Nio-OS");
  }

  return path.join(process.env.HOME || process.cwd(), ".nio-os");
}

/**
 * Retorna o MIME type apropriado a partir da extensão do arquivo solicitado.
 *
 * @param arquivo - Nome ou caminho do arquivo
 * @returns MIME type correspondente
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
 * Sanitiza cada parte do caminho da URL decodificando e isolando basenames,
 * impedindo injeção de pontos e subidas de diretório.
 *
 * @param partes - Segmentos da URL
 * @returns Lista de segmentos sanitizados
 */
function partesSeguras(partes: string[]) {
  return partes
    .map((parte) => decodeURIComponent(String(parte || "")).trim())
    .filter(Boolean)
    .map((parte) => path.basename(parte))
    .filter((parte) => parte && parte !== "." && parte !== "..");
}

/**
 * Monta o caminho completo do arquivo de upload no storage de runtime e valida se ele
 * reside estritamente dentro da pasta de uploads autorizada.
 *
 * @param partes - Segmentos do caminho relativos à pasta de uploads
 * @throws Error se o arquivo resolver fora do diretório base
 * @returns Caminho absoluto validado
 */
function caminhoUploadRuntime(partes: string[]) {
  const base = path.join(raizDadosRuntime(), "public", "uploads");
  const seguras = partesSeguras(partes);
  const arquivo = path.resolve(base, ...seguras);
  const baseResolvida = path.resolve(base);

  if (arquivo !== baseResolvida && !arquivo.startsWith(baseResolvida + path.sep)) {
    throw new Error("Caminho de upload inválido.");
  }

  return arquivo;
}

/**
 * Handler GET para entrega do binário do arquivo solicitado via rota `/uploads/[...path]`.
 * Bloqueia o acesso a anexos para usuários não autenticados.
 *
 * @param _request - Requisição HTTP recebida
 * @param contexto - Contexto contendo os segmentos do caminho nos parâmetros
 * @returns Resposta binária com o arquivo ou erro 400/401/404
 */
export async function GET(_request: Request, contexto: Contexto) {
  try {
    const params = await contexto.params;
    const partes = Array.isArray(params?.path) ? params.path : [];

    if (partes.length === 0) {
      return NextResponse.json({ message: "Arquivo não informado." }, { status: 400 });
    }

    const primeiraPasta = String(partes[0] || "").toLowerCase().trim();
    if (primeiraPasta === "anexos") {
      const usuario = await obterUsuarioLogado();
      if (!usuario) {
        return NextResponse.json(
          { message: "Acesso restrito. Faça login para acessar anexos." },
          { status: 401 }
        );
      }
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

