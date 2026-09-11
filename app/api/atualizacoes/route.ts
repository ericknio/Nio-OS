/**
 * @file route.ts
 * @description Endpoint para verificação de novas versões do Nio-OS Desktop.
 * Realiza consulta à API do GitHub Releases (`ericknio/nio-os-releases`), processa os changelogs
 * em categorias (adicionado, modificado, corrigido) e compara com a versão atualmente em execução.
 */

import { NextResponse } from "next/server";
import {
  verificarSeHaAtualizacao,
  HISTORICO_RELEASES,
  obterVersaoAtual,
  ReleaseInfo,
  ItemPatchNote,
  TipoItemPatch,
  compararVersoes,
} from "@/lib/versoesSistema";

export const dynamic = "force-dynamic";

/** Repositório padrão do GitHub para busca dos releases e instaladores (.exe). */
const DEFAULT_GITHUB_REPO = "ericknio/nio-os-releases";

/**
 * Consulta os releases mais recentes publicados no repositório do GitHub via API REST.
 * Faz parsing do corpo (body) do release identificando tópicos e buscando o executável (.exe) nos assets.
 * 
 * @param repo - Nome do repositório no formato 'owner/repo'
 * @returns Metadados do release estruturados em ReleaseInfo ou null se indisponível/offline
 */
async function consultarGitHubReleases(repo: string): Promise<ReleaseInfo | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        "User-Agent": "Nio-OS-Desktop-Client",
        Accept: "application/vnd.github.v3+json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.tag_name) return null;

    const version = String(data.tag_name).replace(/^v/i, "").trim();
    const titulo = data.name || `Nio-OS v${version}`;
    const dataFormatada = data.published_at
      ? new Date(data.published_at).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");

    // Localizar executável de instalação nos assets (.exe)
    const assetExe = Array.isArray(data.assets)
      ? data.assets.find((a: any) =>
          String(a?.name || "").toLowerCase().endsWith(".exe")
        )
      : null;

    const tamanhoMb = assetExe?.size
      ? `${Math.round(assetExe.size / (1024 * 1024))} MB`
      : "243 MB";

    // Converter descrição do GitHub em itens do Patch Note
    const body = String(data.body || "").trim();
    const linhas = body.split("\n").map((l) => l.trim()).filter(Boolean);

    const itens: ItemPatchNote[] = [];
    let tipoAtual: TipoItemPatch = "adicionado";

    for (const linha of linhas) {
      if (/adicionado|novidade|novo|\badd\b/i.test(linha)) {
        tipoAtual = "adicionado";
      } else if (/modificado|melhoria|alterado|\bchange\b/i.test(linha)) {
        tipoAtual = "modificado";
      } else if (/corrigido|fix|correção|\bbug\b/i.test(linha)) {
        tipoAtual = "corrigido";
      } else if (linha.startsWith("- ") || linha.startsWith("* ")) {
        itens.push({
          tipo: tipoAtual,
          titulo: linha.replace(/^[-*]\s+/, ""),
        });
      }
    }

    if (itens.length === 0 && body) {
      itens.push({
        tipo: "adicionado",
        titulo: "Novidades da versão",
        descricao: body.substring(0, 300),
      });
    }

    return {
      version,
      titulo,
      data: dataFormatada,
      tamanhoAproximado: tamanhoMb,
      downloadUrl: assetExe?.browser_download_url,
      resumo: body.substring(0, 250) || "Nova versão disponível no GitHub Releases.",
      itens,
    };
  } catch {
    return null;
  }
}

/**
 * Consulta a existência de atualizações pendentes para o sistema.
 * Compara a versão corrente com a última release do GitHub Releases e retorna
 * o histórico de versões e notas de lançamento (Patch Notes).
 * 
 * @returns JSON com flags de atualização, versão atual, release disponível e histórico
 */
export async function GET() {
  try {
    const versaoAtual = obterVersaoAtual();
    const repo = process.env.NIO_OS_GITHUB_REPO || DEFAULT_GITHUB_REPO;

    // 1. Tentar consultar o repositório no GitHub Releases
    const githubRelease = await consultarGitHubReleases(repo);

    let status = {
      temAtualizacao: false,
      versaoAtual,
      versaoMaisRecente: versaoAtual,
      releaseDisponivel: null as ReleaseInfo | null,
    };

    // Se o GitHub retornou uma release válida e mais recente que a versão instalada
    if (githubRelease && compararVersoes(githubRelease.version, versaoAtual) > 0) {
      status = {
        temAtualizacao: true,
        versaoAtual,
        versaoMaisRecente: githubRelease.version,
        releaseDisponivel: githubRelease,
      };
    }

    return NextResponse.json({
      ok: true,
      ...status,
      githubRepo: repo,
      historico: HISTORICO_RELEASES,
      dataVerificacao: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Erro ao verificar atualizações:", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Erro ao consultar servidores de atualização.",
      },
      { status: 500 }
    );
  }
}
