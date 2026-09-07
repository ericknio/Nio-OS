import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { caminhoStorageRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    anexoId: string;
  }>;
};

function nomeOperador(usuario: {
  name?: string | null;
  username?: string | null;
  email?: string | null;
} | null | undefined) {
  return (
    String(usuario?.name || usuario?.username || usuario?.email || "").trim() ||
    "Sistema"
  );
}

function caminhosPossiveisDoAnexo(url: string | null | undefined) {
  const valor = String(url || "").split("?")[0].trim();
  const nomeArquivo = path.basename(valor);

  if (!nomeArquivo || nomeArquivo === "." || nomeArquivo === "..") {
    return [];
  }

  const caminhos = [
    caminhoStorageRuntime("uploads", "anexos", nomeArquivo),
    caminhoUploadPublico("anexos", nomeArquivo),
  ];

  if (valor.startsWith("/uploads/") || valor.startsWith("uploads/")) {
    caminhos.push(
      caminhoUploadPublico(valor.replace(/^\/+uploads[\\/]+/, ""))
    );
  }

  return Array.from(new Set(caminhos));
}

async function removerArquivoFisico(url: string | null | undefined) {
  const caminhos = caminhosPossiveisDoAnexo(url);

  for (const caminho of caminhos) {
    try {
      await fs.unlink(caminho);
      return;
    } catch {
      // Se o arquivo físico não existir neste caminho, tenta o próximo.
    }
  }
}


export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.anexos");

    if (!acesso.ok) {
      return acesso.response;
    }

    const userName = nomeOperador(acesso.usuario);

    const { id, anexoId } = await context.params;

    const anexo = await prisma.serviceOrderAttachment.findFirst({
      where: {
        id: anexoId,
        serviceOrderId: id,
      },
    });

    if (!anexo) {
      return NextResponse.json(
        { message: "Anexo não encontrado." },
        { status: 404 }
      );
    }

    await removerArquivoFisico(anexo.url);

    await prisma.serviceOrderAttachment.delete({
      where: {
        id: anexo.id,
      },
    });

    await prisma.serviceOrder.update({
      where: { id },
      data: {
        histories: {
          create: {
            userName,
            action: "ANEXO_REMOVIDO",
            description: `Anexo removido: ${anexo.originalName}`,
          },
        },
      },
    });

    return NextResponse.json({
      message: "Anexo removido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover anexo da OS:", error);

    return NextResponse.json(
      { message: "Erro ao remover anexo da OS." },
      { status: 500 }
    );
  }
}