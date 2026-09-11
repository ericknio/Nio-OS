/**
 * @file route.ts
 * @description Endpoint para inicialização do executável de instalação de nova versão (`Nio-OS Setup <versão>.exe`).
 * Localiza o executável em diretórios candidatos de atualização (`AppData/Local/Nio-OS/updates` ou `release/`)
 * e dispara o instalador como subprocesso independente no Windows (`detached: true`, `subprocess.unref()`).
 */

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";

/**
 * Localiza e executa o instalador da versão alvo do Nio-OS.
 * 
 * Etapas:
 * 1. Mapeia diretórios candidatos (updates no AppData e pasta release local).
 * 2. Seleciona o executável de maior precedência correspondente à versão solicitada.
 * 3. Dispara o instalador desanexado do runtime para permitir que o usuário atualize mesmo com o app aberto.
 * 
 * @param req - Requisição HTTP com JSON contendo `version`
 * @returns JSON informando se o processo foi iniciado com sucesso
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const versaoAlvo = String(body.version || "0.1.4").replace(/^v/i, "");

    // Buscar executável correspondente
    const pastaAppData =
      process.env.LOCALAPPDATA ||
      path.join(process.env.USERPROFILE || "C:", "AppData", "Local");
    const pastaUpdates = path.join(pastaAppData, "Nio-OS", "updates");
    const releaseDir = path.resolve(process.cwd(), "release");
    const devReleaseDir = "C:\\projetos\\sistema-os\\release";

    const candidatos = [
      path.join(pastaUpdates, `Nio-OS Setup ${versaoAlvo}.exe`),
      path.join(pastaUpdates, "Nio-OS Setup 0.1.4.exe"),
      path.join(releaseDir, `Nio-OS Setup ${versaoAlvo}.exe`),
      path.join(devReleaseDir, `Nio-OS Setup ${versaoAlvo}.exe`),
      path.join(releaseDir, "Nio-OS Setup 0.1.4.exe"),
      path.join(devReleaseDir, "Nio-OS Setup 0.1.4.exe"),
      path.join(releaseDir, "Nio-OS Setup 0.1.3.exe"),
      path.join(devReleaseDir, "Nio-OS Setup 0.1.3.exe"),
    ];

    let executavelEncontrado = "";

    // 1. Procurar nas opções candidatas
    for (const c of candidatos) {
      if (fs.existsSync(c)) {
        executavelEncontrado = c;
        break;
      }
    }

    // 2. Se não encontrar o exato, buscar em pastaUpdates
    if (!executavelEncontrado && fs.existsSync(pastaUpdates)) {
      const arquivos = fs.readdirSync(pastaUpdates);
      const setups = arquivos
        .filter((f) => f.startsWith("Nio-OS Setup") && f.endsWith(".exe"))
        .sort()
        .reverse();

      if (setups.length > 0) {
        executavelEncontrado = path.join(pastaUpdates, setups[0]);
      }
    }

    // 3. Se não encontrar, buscar o setup mais recente na pasta release
    if (!executavelEncontrado && fs.existsSync(releaseDir)) {
      const arquivos = fs.readdirSync(releaseDir);
      const setups = arquivos
        .filter((f) => f.startsWith("Nio-OS Setup") && f.endsWith(".exe"))
        .sort()
        .reverse();

      if (setups.length > 0) {
        executavelEncontrado = path.join(releaseDir, setups[0]);
      }
    }

    if (executavelEncontrado && fs.existsSync(executavelEncontrado)) {
      if (process.platform === "win32") {
        const subprocess = spawn(executavelEncontrado, [], {
          detached: true,
          stdio: "ignore",
        });
        subprocess.unref();

        return NextResponse.json({
          ok: true,
          iniciado: true,
          mensagem: `Instalador do Nio-OS iniciado com sucesso (${path.basename(
            executavelEncontrado
          )}).`,
          arquivo: path.basename(executavelEncontrado),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      iniciado: false,
      mensagem:
        "O instalador foi preparado e estará disponível para execução manual ou via download.",
      arquivo: executavelEncontrado ? path.basename(executavelEncontrado) : null,
    });
  } catch (error) {
    console.error("Erro ao acionar instalador:", error);
    return NextResponse.json(
      {
        ok: false,
        message: "Não foi possível disparar o instalador automaticamente.",
      },
      { status: 500 }
    );
  }
}
