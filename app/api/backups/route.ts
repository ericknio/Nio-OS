/**
 * @file route.ts
 * @description Endpoint de gerenciamento de backups locais do Nio-OS.
 * Permite listar os snapshots existentes (GET) e disparar a geração de um novo backup completo (POST),
 * englobando o banco de dados SQLite e arquivos de uploads, via processo filho isolado (`scripts/backup-api.js`).
 * Acesso restrito a usuários com perfil ADMIN.
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
 * Formato de resposta JSON retornado pelo script `backup-api.js`.
 */
type BackupApiResponse = {
  ok?: boolean;
  message?: string;
  backups?: unknown[];
  backup?: unknown;
  logs?: string[];
};

/**
 * Estrutura sanitizada de metadados de um arquivo de backup para consumo seguro pelo frontend.
 */
type BackupItemSeguro = {
  nome: string;
  caminho: string;
  banco?: string;
  temBanco: boolean;
  temUploads: boolean;
  criadoEm?: string;
};

/** Flag em memória para evitar execução concorrente de backups pesados. */
let backupEmAndamento = false;

/**
 * Sanitiza valores de entrada convertendo para string e removendo espaços.
 * @param valor - Dado bruto
 * @returns String limpa
 */
function texto(valor: unknown) {
  return String(valor || "").trim();
}

/**
 * Extrai apenas o nome base do arquivo (basename), impedindo Path Traversal em diretórios.
 * @param valor - Caminho ou nome do arquivo
 * @returns Nome seguro do arquivo
 */
function nomeArquivo(valor: unknown) {
  const limpo = texto(valor);
  if (!limpo) return "";
  return path.basename(limpo);
}

/**
 * Converte valores literais variados para boolean.
 * @param valor - Dado bruto
 * @returns Booleano
 */
function booleano(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

/**
 * Limpa caracteres de controle ASCII e limita o tamanho de mensagens de log.
 * @param valor - Texto de log bruto
 * @returns String higienizada
 */
function limparLog(valor: unknown) {
  return texto(valor).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 500);
}

/**
 * Trata e limita o array de logs a um máximo de 40 entradas.
 * @param logs - Array bruto
 * @returns Lista tratada de logs
 */
function limitarLogs(logs: unknown) {
  if (!Array.isArray(logs)) return [];
  return logs.map(limparLog).filter(Boolean).slice(0, 40);
}

/**
 * Tenta realizar o parse de JSON de forma segura sem lançar exceções.
 * @param textoJson - String JSON
 * @returns Objeto parseado ou null
 */
function tentarJson(textoJson: string): BackupApiResponse | null {
  try {
    return JSON.parse(textoJson) as BackupApiResponse;
  } catch {
    return null;
  }
}

/**
 * Lê e analisa a saída em JSON emitida pelo script de backup, extraindo a última linha válida em caso de logs intermediários.
 * @param textoJson - String bruta de saída do processo
 * @returns Objeto BackupApiResponse
 */
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

/**
 * Normaliza e sanitiza as propriedades de um item de backup individual.
 * @param item - Objeto bruto
 * @returns Objeto BackupItemSeguro ou null
 */
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

/**
 * Filtra e normaliza a coleção completa de backups recebidos.
 * @param backups - Array bruto
 * @returns Lista de backups válidos
 */
function normalizarBackups(backups: unknown) {
  if (!Array.isArray(backups)) return [];

  return backups
    .map(normalizarBackup)
    .filter((backup): backup is BackupItemSeguro => Boolean(backup));
}

/**
 * Retorna os diretórios candidatos onde o script utilitário `scripts/backup-api.js` pode residir.
 * @returns Lista de caminhos absolutos
 */
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

/**
 * Procura fisicamente no sistema de arquivos pelo script de backup.
 * @returns Caminho absoluto do script encontrado
 */
function localizarScriptBackup() {
  const candidatos = candidatosScriptBackup();
  const encontrado = candidatos.find((script) => existsSync(script));

  if (encontrado) return encontrado;

  throw new Error(
    `Script de backup não encontrado. Procurado em: ${candidatos.join(" | ")}`
  );
}

/**
 * Executa o script `backup-api.js` em processo filho síncrono isolado (`spawnSync`).
 * @param acao - Ação a executar ('list' ou 'create')
 * @returns Dados JSON retornados pelo script
 */
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

/**
 * Valida se o usuário autenticado possui perfil de Administrador (ADMIN) para gerenciar backups.
 * @returns Objeto com o usuário autenticado ou resposta de erro 403
 */
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

/**
 * Lista todos os backups locais disponíveis na pasta de dados do sistema.
 * @returns JSON contendo a lista de backups com data, integridade e tamanho
 */
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

/**
 * Dispara a criação de um novo backup completo contendo o banco SQLite e a pasta de uploads.
 * Bloqueia chamadas paralelas com status 409 (Conflict).
 * 
 * @returns JSON com dados do backup recém-gerado e logs de execução
 */
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
