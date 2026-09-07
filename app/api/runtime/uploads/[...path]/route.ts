import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexto = {
  params: Promise<{ path?: string[] }> | { path?: string[] };
};

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

function partesSeguras(partes: string[]) {
  return partes
    .map((parte) => decodeURIComponent(String(parte || "")).trim())
    .filter(Boolean)
    .map((parte) => path.basename(parte))
    .filter((parte) => parte && parte !== "." && parte !== "..");
}

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
