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
  backups?: unknown[];
  backup?: unknown;
  logs?: string[];
};

type BackupItemSeguro = {
  nome: string;
  caminho: string;
  banco?: string;
  temBanco: boolean;
  temUploads: boolean;
  criadoEm?: string;
};

let backupEmAndamento = false;

function texto(valor: unknown) {
  return String(valor || "").trim();
}

function nomeArquivo(valor: unknown) {
  const limpo = texto(valor);
  if (!limpo) return "";
  return path.basename(limpo);
}

function booleano(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

function limparLog(valor: unknown) {
  return texto(valor).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
}

function limitarLogs(logs: unknown) {
  if (!Array.isArray(logs)) return [];
  return logs.map(limparLog).filter(Boolean).slice(0, 40);
}

function tentarJson(textoJson: string): BackupApiResponse | null {
  try {
    return JSON.parse(textoJson) as BackupApiResponse;
  } catch {
    return null;
  }
}

function lerJson(textoJson: string): BackupApiResponse {
  const bruto = String(textoJson || "").trim();

  const direto = tentarJson(bruto);
  if (direto) return direto;

  const linhas = bruto
    .split(/\r?\n/g)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .reverse();

  for (const linha of linhas) {
    if (!linha.startsWith("{") || !linha.endsWith("}")) continue;
    const json = tentarJson(linha);
    if (json) return json;
  }

  throw new Error("Resposta inválida do processo de backup.");
}

function normalizarBackup(item: unknown): BackupItemSeguro | null {
  if (!item || typeof item !== "object") return null;

  const backup = item as Record<string, unknown>;

  const nome =
    nomeArquivo(backup.nome) ||
    nomeArquivo(backup.caminho) ||
    nomeArquivo(backup.path);

  if (!nome) return null;

  const banco = nomeArquivo(backup.banco || backup.database || backup.sql);

  return {
    nome,
    caminho: nome,
    banco: banco || undefined,
    temBanco:
      booleano(backup.temBanco) ||
      booleano(backup.hasDatabase) ||
      Boolean(banco),
    temUploads:
      booleano(backup.temUploads) ||
      booleano(backup.hasUploads) ||
      booleano(backup.uploads),
    criadoEm:
      texto(backup.criadoEm || backup.createdAt || backup.data) || undefined,
  };
}

function normalizarBackups(backups: unknown) {
  if (!Array.isArray(backups)) return [];

  return backups
    .map(normalizarBackup)
    .filter((backup): backup is BackupItemSeguro => Boolean(backup));
}

function candidatosScriptBackup() {
  const bases = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "..", ".."),
    path.resolve(process.cwd(), "..", "..", ".."),
  ];

  return [...new Set(bases)].map((base) =>
    path.join(base, "scripts", "backup-api.js")
  );
}

function localizarScriptBackup() {
  const candidatos = candidatosScriptBackup();
  const encontrado = candidatos.find((script) => existsSync(script));

  if (encontrado) return encontrado;

  throw new Error(
    `Script de backup não encontrado. Procurado em: ${candidatos.join(" | ")}`
  );
}

function executarBackupApi(acao: "list" | "create") {
  const scriptPath = localizarScriptBackup();

  const resultado = spawnSync(process.execPath, [scriptPath, acao], {
    cwd: path.dirname(path.dirname(scriptPath)),
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: acao === "create" ? 180_000 : 60_000,
    maxBuffer: 1024 * 1024 * 5,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NIO_OS_BACKUP_API: "1",
    },
  });

  const stdout = String(resultado.stdout || "").trim();
  const stderr = String(resultado.stderr || "").trim();

  if (resultado.error) {
    const mensagem =
      resultado.error.name === "ETIMEDOUT"
        ? "Tempo limite excedido ao executar o backup."
        : `Não foi possível executar o processo de backup: ${resultado.error.message}`;

    throw new Error(mensagem);
  }

  if (resultado.status !== 0) {
    const fonteErro = stderr || stdout;

    if (fonteErro) {
      const erro = lerJson(fonteErro);
      throw new Error(erro.message || "Erro ao executar backup.");
    }

    throw new Error("Erro ao executar backup.");
  }

  const data = lerJson(stdout);

  if (data.ok === false) {
    throw new Error(data.message || "O processo de backup retornou falha.");
  }

  return data;
}

async function exigirAcessoBackup() {
  const acesso = await exigirPermissaoApi("configuracoes.editar");

  if (!acesso.ok) {
    return { response: acesso.response };
  }

  if (acesso.usuario.role !== SystemUserRole.ADMIN) {
    return {
      response: NextResponse.json(
        { message: "Apenas administradores podem acessar backup e restauração." },
        { status: 403 }
      ),
    };
  }

  return { usuario: acesso.usuario };
}

export async function GET() {
  try {
    const acesso = await exigirAcessoBackup();

    if ("response" in acesso) return acesso.response;

    const data = executarBackupApi("list");

    return NextResponse.json({ backups: normalizarBackups(data.backups) });
  } catch (error) {
    console.error("Erro ao listar backups:", error);

    return NextResponse.json(
      { message: "Não foi possível listar os backups do sistema." },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const acesso = await exigirAcessoBackup();

    if ("response" in acesso) return acesso.response;

    if (backupEmAndamento) {
      return NextResponse.json(
        { message: "Já existe uma operação de backup em andamento." },
        { status: 409 }
      );
    }

    backupEmAndamento = true;

    try {
      const data = executarBackupApi("create");

      return NextResponse.json({
        message: data.message || "Backup criado com sucesso.",
        backup: normalizarBackup(data.backup),
        logs: limitarLogs(data.logs),
      });
    } finally {
      backupEmAndamento = false;
    }
  } catch (error) {
    console.error("Erro ao criar backup:", error);

    return NextResponse.json(
      { message: "Não foi possível criar o backup do sistema." },
      { status: 500 }
    );
  }
}
