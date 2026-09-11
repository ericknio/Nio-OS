/**
 * @file route.ts
 * @description Endpoint para download em segundo plano e telemetria de progresso do instalador (.exe) de atualização.
 * Salva o instalador baixado na pasta segura `%LOCALAPPDATA%/Nio-OS/updates` e, ao término, dispara o instalador
 * desanexado do processo principal (`child.unref()`).
 */

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

/**
 * Estrutura de status e telemetria do download de nova versão.
 */
type StatusDownload = {
  emAndamento: boolean;
  progresso: number;
  mensagem: string;
  bytesRecebidos: number;
  bytesTotais: number;
  concluido: boolean;
  erro: string | null;
  arquivo: string | null;
};

/**
 * Estado global em memória no processo Node para acompanhamento do download pelo frontend.
 */
const estadoGlobal: StatusDownload = {
  emAndamento: false,
  progresso: 0,
  mensagem: "Aguardando início...",
  bytesRecebidos: 0,
  bytesTotais: 0,
  concluido: false,
  erro: null,
  arquivo: null,
};

/**
 * Retorna o estado atual do progresso de download (percentual, bytes transferidos e status).
 * @returns JSON com o objeto StatusDownload
 */
export async function GET() {
  return NextResponse.json(estadoGlobal);
}

/**
 * Inicia o download assíncrono do instalador do GitHub Releases ou executa pacote local pré-existente.
 * Grava o fluxo binário via stream e executa o instalador .exe de forma desacoplada no Windows.
 * 
 * @param req - Requisição HTTP com JSON contendo `downloadUrl` e `version`
 * @returns JSON indicando início do download ou execução do instalador local
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const downloadUrl = body.downloadUrl as string | undefined;
    const version = String(body.version || "0.1.4").replace(/^v/i, "");

    if (estadoGlobal.emAndamento) {
      return NextResponse.json({
        ok: true,
        emAndamento: true,
        mensagem: "Download já está em andamento.",
      });
    }

    // Pasta segura de destino para os downloads
    const pastaAppData =
      process.env.LOCALAPPDATA ||
      path.join(process.env.USERPROFILE || "C:", "AppData", "Local");
    const pastaUpdates = path.join(pastaAppData, "Nio-OS", "updates");
    fs.mkdirSync(pastaUpdates, { recursive: true });

    const nomeArquivo = `Nio-OS Setup ${version}.exe`;
    const caminhoDestino = path.join(pastaUpdates, nomeArquivo);

    // Se já foi baixado ou é URL remota
    if (downloadUrl && downloadUrl.startsWith("http")) {
      estadoGlobal.emAndamento = true;
      estadoGlobal.progresso = 0;
      estadoGlobal.bytesRecebidos = 0;
      estadoGlobal.bytesTotais = 0;
      estadoGlobal.concluido = false;
      estadoGlobal.erro = null;
      estadoGlobal.arquivo = caminhoDestino;
      estadoGlobal.mensagem = "Iniciando download do pacote...";

      // Iniciar download em background
      (async () => {
        try {
          const response = await fetch(downloadUrl);
          if (!response.ok || !response.body) {
            throw new Error(`Falha no download da nuvem (HTTP ${response.status})`);
          }

          const contentLength = Number(response.headers.get("content-length") || 0);
          estadoGlobal.bytesTotais = contentLength;

          const fileStream = fs.createWriteStream(caminhoDestino);
          const reader = response.body.getReader();

          let received = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
              fileStream.write(Buffer.from(value));
              received += value.length;
              estadoGlobal.bytesRecebidos = received;

              if (contentLength > 0) {
                const perc = Math.min(Math.round((received / contentLength) * 100), 99);
                estadoGlobal.progresso = perc;
                const mbRecebidos = (received / (1024 * 1024)).toFixed(1);
                const mbTotais = (contentLength / (1024 * 1024)).toFixed(1);
                estadoGlobal.mensagem = `Baixando pacote do GitHub (${mbRecebidos} MB / ${mbTotais} MB)...`;
              }
            }
          }

          fileStream.end();
          estadoGlobal.progresso = 100;
          estadoGlobal.concluido = true;
          estadoGlobal.emAndamento = false;
          estadoGlobal.mensagem = "Download concluído com sucesso!";

          // Disparar o instalador baixado
          if (process.platform === "win32" && fs.existsSync(caminhoDestino)) {
            const child = spawn(caminhoDestino, [], {
              detached: true,
              stdio: "ignore",
            });
            child.unref();
          }
        } catch (err: any) {
          console.error("Erro durante o download do update:", err);
          estadoGlobal.erro = err?.message || "Erro durante transferência do arquivo.";
          estadoGlobal.emAndamento = false;
          estadoGlobal.mensagem = "Falha no download.";
        }
      })();

      return NextResponse.json({
        ok: true,
        emAndamento: true,
        mensagem: "Download iniciado.",
      });
    }

    // Se for pacote local (em release/)
    const releaseLocal = path.resolve(process.cwd(), "release", nomeArquivo);
    if (fs.existsSync(releaseLocal)) {
      if (process.platform === "win32") {
        const child = spawn(releaseLocal, [], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      }

      return NextResponse.json({
        ok: true,
        concluido: true,
        mensagem: `Instalador local iniciado (${nomeArquivo}).`,
      });
    }

    return NextResponse.json({
      ok: true,
      mensagem: "Pacote preparado para instalação.",
    });
  } catch (error) {
    console.error("Erro ao iniciar download da atualização:", error);
    return NextResponse.json(
      { ok: false, message: "Erro ao processar solicitação de download." },
      { status: 500 }
    );
  }
}
