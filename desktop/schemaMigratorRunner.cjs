const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_LIMIT_BYTES = 1024 * 1024;

function failure(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    mode: "apply",
    database: extra.database || null,
    pending: [],
    applied: [],
    backupPath: null,
    schemaVersion: null,
    migrationId: null,
    durationMs: extra.durationMs || 0,
    exitCode: extra.exitCode ?? null,
    ...extra,
  };
}

function isExistingFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveSchemaMigratorCli({
  appPath,
  resourcesPath,
  runnerDirectory = __dirname,
  cliPath,
} = {}) {
  if (cliPath !== undefined) {
    if (!path.isAbsolute(cliPath) || !isExistingFile(cliPath)) return null;
    return path.normalize(cliPath);
  }

  const candidates = [
    appPath && path.join(appPath, "scripts", "schema-migrator", "cli.cjs"),
    path.resolve(runnerDirectory, "..", "scripts", "schema-migrator", "cli.cjs"),
    resourcesPath &&
      path.join(resourcesPath, "app", "scripts", "schema-migrator", "cli.cjs"),
  ].filter(Boolean);

  return candidates.find(isExistingFile) || null;
}

function runSchemaMigrator({
  appPath,
  resourcesPath,
  databasePath,
  backupDir,
  executablePath = process.execPath,
  cliPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  outputLimitBytes = DEFAULT_OUTPUT_LIMIT_BYTES,
} = {}) {
  const startedAt = performance.now();
  const database = path.basename(String(databasePath || "")) || null;

  if (!path.isAbsolute(String(databasePath || ""))) {
    return Promise.resolve(
      failure("MIGRATION_DATABASE_PATH_INVALID", "Caminho do banco deve ser absoluto.", {
        database,
      })
    );
  }
  if (!isExistingFile(databasePath)) {
    return Promise.resolve(
      failure("MIGRATION_DATABASE_NOT_FOUND", "Banco de dados não encontrado.", {
        database,
      })
    );
  }
  if (!path.isAbsolute(String(backupDir || ""))) {
    return Promise.resolve(
      failure("MIGRATION_BACKUP_PATH_INVALID", "Diretório de backup deve ser absoluto.", {
        database,
      })
    );
  }

  const resolvedCli = resolveSchemaMigratorCli({
    appPath,
    resourcesPath,
    cliPath,
  });
  if (!resolvedCli) {
    return Promise.resolve(
      failure("MIGRATION_SCRIPT_NOT_FOUND", "Script do migrador não encontrado.", {
        database,
      })
    );
  }

  const args = [
    resolvedCli,
    "--db",
    path.normalize(databasePath),
    "--apply",
    "--json",
    "--backup-dir",
    path.normalize(backupDir),
  ];

  return new Promise((resolve) => {
    let child;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout = [];
    const stderr = [];
    let terminalCode = null;
    let settled = false;
    let timer = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ...result,
        durationMs: Math.round(performance.now() - startedAt),
      });
    };

    const stopFor = (code, message) => {
      if (terminalCode) return;
      terminalCode = code;
      try {
        child.kill();
      } catch {}
      setTimeout(() => {
        finish(failure(code, message, { database }));
      }, 2_000).unref();
    };

    try {
      const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1" };
      delete env.DATABASE_URL;
      child = spawn(executablePath, args, {
        cwd: path.dirname(resolvedCli),
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      finish(
        failure("MIGRATION_PROCESS_ERROR", "Não foi possível iniciar o migrador.", {
          database,
        })
      );
      return;
    }

    timer = setTimeout(() => {
      stopFor("MIGRATION_TIMEOUT", "Tempo limite do migrador excedido.");
    }, Math.min(Math.max(1, timeoutMs), DEFAULT_TIMEOUT_MS));

    const collect = (target, chunk, stream) => {
      const size = Buffer.byteLength(chunk);
      if (stream === "stdout") stdoutBytes += size;
      else stderrBytes += size;
      if (
        stdoutBytes > outputLimitBytes ||
        stderrBytes > outputLimitBytes ||
        stdoutBytes > DEFAULT_OUTPUT_LIMIT_BYTES ||
        stderrBytes > DEFAULT_OUTPUT_LIMIT_BYTES
      ) {
        stopFor("MIGRATION_OUTPUT_LIMIT", "Limite de saída do migrador excedido.");
        return;
      }
      target.push(Buffer.from(chunk));
    };

    child.stdout.on("data", (chunk) => collect(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk) => collect(stderr, chunk, "stderr"));
    child.on("error", () => {
      finish(
        failure("MIGRATION_PROCESS_ERROR", "Não foi possível executar o migrador.", {
          database,
        })
      );
    });
    child.on("close", (exitCode) => {
      if (terminalCode) {
        finish(failure(terminalCode, "Execução do migrador interrompida.", { database }));
        return;
      }

      const output = Buffer.concat(stdout).toString("utf8").trim();
      let response;
      try {
        response = JSON.parse(output);
      } catch {
        finish(
          failure("MIGRATION_INVALID_RESPONSE", "Resposta inválida do migrador.", {
            database,
            exitCode,
          })
        );
        return;
      }

      if (!response || typeof response !== "object" || typeof response.ok !== "boolean") {
        finish(
          failure("MIGRATION_INVALID_RESPONSE", "Resposta inválida do migrador.", {
            database,
            exitCode,
          })
        );
        return;
      }

      finish({
        ...response,
        database,
        exitCode,
        ok: response.ok === true && exitCode === 0,
        code:
          response.ok === true && exitCode === 0
            ? response.code || "OK"
            : response.code || "MIGRATION_PROCESS_ERROR",
      });
    });
  });
}

module.exports = {
  DEFAULT_OUTPUT_LIMIT_BYTES,
  DEFAULT_TIMEOUT_MS,
  resolveSchemaMigratorCli,
  runSchemaMigrator,
};
