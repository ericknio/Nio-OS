import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { SystemUserRole } from "@prisma/client";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BackupApiResponse = {
  ok?: boolean;
  message?: string;
  resultado?: unknown;
  logs?: string[];
};

let restauracaoEmAndamento = false;

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function limparLog(valor: unknown) {
  return texto(valor)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 500);
}

function limitarLogs(logs: unknown) {
  if (!Array.isArray(logs)) return [];

  return logs.map(limparLog).filter(Boolean).slice(0, 60);
}

function lerJson(textoJson: string): BackupApiResponse {
  try {
    return JSON.parse(textoJson) as BackupApiResponse;
  } catch {
    throw new Error("Resposta inválida do processo de restauração.");
  }
}

function executarRestoreApi() {
  const scriptPath = path.join(process.cwd(), "scripts", "backup-api.js");

  if (!existsSync(scriptPath)) {
    throw new Error("Script de backup não encontrado em scripts/backup-api.js.");
  }

  const resultado = spawnSync(process.execPath, [scriptPath, "restore"], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 240_000,
    maxBuffer: 1024 * 1024 * 5,
  });

  const stdout = String(resultado.stdout || "").trim();
  const stderr = String(resultado.stderr || "").trim();

  if (resultado.error) {
    const mensagem =
      resultado.error.name === "ETIMEDOUT"
        ? "Tempo limite excedido ao restaurar backup."
        : `Não foi possível executar o processo de restauração: ${resultado.error.message}`;

    throw new Error(mensagem);
  }

  if (resultado.status !== 0) {
    const fonteErro = stderr || stdout;

    if (fonteErro) {
      const erro = lerJson(fonteErro);
      throw new Error(erro.message || "Erro ao restaurar backup.");
    }

    throw new Error("Erro ao restaurar backup.");
  }

  const data = lerJson(stdout);

  if (data.ok === false) {
    throw new Error(data.message || "O processo de restauração retornou falha.");
  }

  return data;
}

async function exigirAcessoRestore() {
  const acesso = await exigirPermissaoApi("configuracoes.editar");

  if (!acesso.ok) {
    return {
      response: acesso.response,
    };
  }

  if (acesso.usuario.role !== SystemUserRole.ADMIN) {
    return {
      response: NextResponse.json(
        {
          message:
            "Apenas administradores podem restaurar backup do sistema.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    usuario: acesso.usuario,
  };
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirAcessoRestore();

    if ("response" in acesso) {
      return acesso.response;
    }

    if (restauracaoEmAndamento) {
      return NextResponse.json(
        {
          message: "Já existe uma restauração em andamento.",
        },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const confirmacao = texto((body as Record<string, unknown> | null)?.confirmacao);

    if (confirmacao !== "RESTAURAR") {
      return NextResponse.json(
        {
          message:
            'Para restaurar, envie a confirmação exatamente como "RESTAURAR".',
        },
        { status: 400 }
      );
    }

    restauracaoEmAndamento = true;

    try {
      const data = executarRestoreApi();

      return NextResponse.json({
        message:
          data.message ||
          "Backup restaurado com sucesso. Reinicie o sistema se algum dado antigo continuar aparecendo.",
        resultado: data.resultado,
        logs: limitarLogs(data.logs),
      });
    } finally {
      restauracaoEmAndamento = false;
    }
  } catch (error) {
    console.error("Erro ao restaurar backup:", error);

    return NextResponse.json(
      {
        message: "Não foi possível restaurar o backup. Verifique se o arquivo é válido e tente novamente.",
      },
      { status: 500 }
    );
  }
}
