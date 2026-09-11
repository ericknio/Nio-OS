/**
 * @file route.ts
 * @description Endpoint crítico para restauração de backups completos do sistema Nio-OS.
 * Exige perfil exclusivo de Administrador (ADMIN), valida a palavra-chave de confirmação ("RESTAURAR")
 * para evitar acidentes operacionais e executa o processo de restauração via `scripts/backup-api.js`.
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { SystemUserRole } from "@prisma/client";
import { exigirPermissaoApi } from "@/lib/permissaoApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estrutura de resposta gerada pelo script de restauração.
 */
type BackupApiResponse = {
  ok?: boolean;
  message?: string;
  resultado?: unknown;
  logs?: string[];
};

/** Flag de bloqueio para evitar restaurações simultâneas concorrentes. */
let restauracaoEmAndamento = false;

/**
 * Sanitiza valores de entrada convertendo para string e removendo espaços.
 * @param valor - Dado de entrada
 * @returns String limpa
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Higieniza entradas de log removendo caracteres de controle ASCII.
 * @param valor - Log bruto
 * @returns String tratada
 */
function limparLog(valor: unknown) {
  return texto(valor)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 500);
}

/**
 * Limita os logs de execução a um teto de 60 linhas.
 * @param logs - Array de logs
 * @returns Lista limitada
 */
function limitarLogs(logs: unknown) {
  if (!Array.isArray(logs)) return [];

  return logs.map(limparLog).filter(Boolean).slice(0, 60);
}

/**
 * Realiza o parse seguro do JSON retornado pelo processo de restauração.
 * @param textoJson - String bruta
 * @returns Objeto BackupApiResponse
 */
function lerJson(textoJson: string): BackupApiResponse {
  try {
    return JSON.parse(textoJson) as BackupApiResponse;
  } catch {
    throw new Error("Resposta inválida do processo de restauração.");
  }
}

/**
 * Executa o script `scripts/backup-api.js` com o comando `restore` de forma síncrona com timeout de 4 minutos.
 * @returns Resposta JSON do processo de restauração
 */
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

/**
 * Valida se a requisição possui permissão de edição de configurações e perfil ADMIN.
 * @returns Objeto com o usuário autenticado ou resposta de bloqueio HTTP 403
 */
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

/**
 * Executa a restauração de um backup no sistema Nio-OS.
 * 
 * Requisitos e segurança:
 * 1. Acesso restrito a usuários ADMIN com permissão 'configuracoes.editar'.
 * 2. Bloqueia chamadas concorrentes caso uma restauração já esteja em progresso (409).
 * 3. Exige no payload `{ confirmacao: "RESTAURAR" }` para mitigar acionamentos acidentais.
 * 4. Substitui o banco SQLite e arquivos de uploads pelos contidos no snapshot selecionado.
 * 
 * @param request - Requisição HTTP com JSON contendo `confirmacao: "RESTAURAR"`
 * @returns JSON com mensagem de sucesso, resultado e logs de execução
 */
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
