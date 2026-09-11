/**
 * @file route.ts
 * @description Endpoint para envio e atualização do logotipo da empresa (logo.png).
 * Executa validação de integridade por magic bytes (assinatura 0x89 PNG), limite de tamanho (2MB)
 * e salva o arquivo no diretório seguro de uploads do runtime (`caminhoUploadPublico()`).
 */

import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { caminhoPublicoRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import { textoGarantiaPadrao } from "@/lib/configuracoesPadrao";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Valida se os primeiros 8 bytes do buffer correspondem à assinatura mágica oficial de arquivos PNG.
 * Evita upload malicioso de arquivos renomeados com extensão .png.
 * @param buffer - Buffer do arquivo recebido
 * @returns Verdadeiro se for um arquivo PNG legítimo
 */
function ehPng(buffer: Buffer) {
  const assinaturaPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  return buffer.length >= 8 && buffer.subarray(0, 8).equals(assinaturaPng);
}

/**
 * Recupera as configurações existentes da empresa ou inicializa caso inexistente.
 * @returns Registro CompanySettings
 */
async function obterOuCriarConfiguracoes() {
  const existente = await prisma.companySettings.findFirst();

  if (existente) return existente;

  return prisma.companySettings.create({
    data: {
      companyName: "Minha Empresa",
      primaryColor: "#2563EB",
      defaultWarrantyDays: 90,
      warrantyText: textoGarantiaPadrao,
      footerText:
        "Documento gerado automaticamente pelo sistema de Ordem de Serviço.",
      defaultOperator: "Sistema",
      productsModuleEnabled: true,
    },
  });
}

/**
 * Processa o upload multipart/form-data do logotipo da empresa.
 * 
 * Etapas de processamento:
 * 1. Exige permissão RBAC 'configuracoes.editar'.
 * 2. Verifica presença do arquivo no campo 'logo'.
 * 3. Valida MIME type (image/png) e limite máximo de 2MB.
 * 4. Valida assinatura binária do cabeçalho PNG.
 * 5. Grava fisicamente no diretório de runtime (`caminhoUploadPublico()/logo.png`).
 * 6. Atualiza `logoUrl` no banco SQLite.
 * 7. Retorna a URL com timestamp para quebra de cache do navegador.
 * 
 * @param request - Requisição HTTP com multipart/form-data contendo o campo 'logo'
 * @returns JSON com mensagem de sucesso e logoUrl atualizada
 */
export async function POST(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("configuracoes.editar");

    if (!acesso.ok) {
      return acesso.response;
    }

    const formData = await request.formData().catch(() => null);
    const file = formData?.get("logo");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    if (file.type !== "image/png") {
      return NextResponse.json(
        { message: "Envie uma imagem no formato PNG." },
        { status: 400 }
      );
    }

    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
      return NextResponse.json(
        { message: "A logo deve ter no máximo 2MB." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!ehPng(buffer)) {
      return NextResponse.json(
        { message: "O arquivo enviado não parece ser uma imagem PNG válida." },
        { status: 400 }
      );
    }

    const uploadDir = caminhoUploadPublico();
    const filePath = path.join(uploadDir, "logo.png");

    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, buffer);

    const configuracoes = await obterOuCriarConfiguracoes();

    await prisma.companySettings.update({
      where: {
        id: configuracoes.id,
      },
      data: {
        logoUrl: "/uploads/logo.png",
      },
    });

    return NextResponse.json({
      message: "Logo atualizada com sucesso.",
      logoUrl: `/uploads/logo.png?v=${Date.now()}`,
    });
  } catch (error) {
    console.error("Erro ao atualizar logo:", error);

    return NextResponse.json(
      { message: "Erro ao atualizar logo." },
      { status: 500 }
    );
  }
}