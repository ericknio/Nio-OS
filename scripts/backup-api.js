const path = require("path");

const logs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function registrar(tipo, args) {
  const texto = args.map((arg) => {
    if (arg instanceof Error) return arg.message;
    if (typeof arg === "string") return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }).join(" ").trim();

  if (texto) logs.push(`[${tipo}] ${texto}`);
}

console.log = (...args) => registrar("log", args);
console.warn = (...args) => registrar("warn", args);
console.error = (...args) => registrar("error", args);

function escreverJson(payload, erro = false) {
  const saida = JSON.stringify({ ...payload, logs }, null, 2);
  if (erro) {
    process.stderr.write(saida);
  } else {
    process.stdout.write(saida);
  }
}

function normalizarBackup(backup) {
  if (!backup || typeof backup !== "object") return null;

  const nome = path.basename(String(backup.nome || backup.caminho || backup.path || ""));
  if (!nome) return null;

  return {
    nome,
    caminho: nome,
    banco: backup.banco ? path.basename(String(backup.banco)) : undefined,
    temBanco: Boolean(backup.temBanco || backup.hasDatabase || backup.banco),
    temUploads: Boolean(backup.temUploads || backup.hasUploads || backup.uploads),
    criadoEm: backup.criadoEm || backup.createdAt || backup.data || undefined,
  };
}

async function main() {
  const acao = String(process.argv[2] || "list").trim();
  const core = require("./backup-core");

  if (acao === "list") {
    const backups = typeof core.listarBackups === "function" ? core.listarBackups() : [];
    escreverJson({
      ok: true,
      backups: backups.map(normalizarBackup).filter(Boolean),
    });
    return;
  }

  if (acao === "create") {
    if (typeof core.criarBackup !== "function") {
      throw new Error("Função criarBackup não encontrada em scripts/backup-core.js.");
    }

    const backup = core.criarBackup();

    escreverJson({
      ok: true,
      message: "Backup criado com sucesso.",
      backup: normalizarBackup(backup),
    });
    return;
  }

  if (acao === "restore-last") {
    if (typeof core.restaurarBackupMaisRecente !== "function") {
      throw new Error("Função restaurarBackupMaisRecente não encontrada em scripts/backup-core.js.");
    }

    const resultado = core.restaurarBackupMaisRecente();

    escreverJson({
      ok: true,
      message: "Backup restaurado com sucesso.",
      backup: normalizarBackup(resultado?.backup),
    });
    return;
  }

  throw new Error(`Ação de backup inválida: ${acao}`);
}

main().catch((error) => {
  escreverJson(
    {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    },
    true
  );
  process.exit(1);
});
