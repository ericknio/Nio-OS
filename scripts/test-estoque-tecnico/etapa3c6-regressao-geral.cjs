#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const testDir = path.join(root, "scripts", "test-estoque-tecnico");
const withBuild = process.argv.includes("--build");

const tests = [
  "etapa3c1-core.cjs",
  "etapa3c21-endurecimento.cjs",
  "etapa3c2-servicos.cjs",
  "etapa3c31-reserva-os.cjs",
  "etapa3c32-alteracao-liberacao.cjs",
  "etapa3c33a-consumo-pronto.cjs",
  "etapa3c34a-cancelamento.cjs",
  "etapa3c34b-integracao-cancelamento.cjs",
  "etapa3c35a-estorno-manual.cjs",
  "etapa3c35b-integracao-estorno.cjs",
  "etapa3c4a-api-estoque-tecnico.cjs",
  "etapa3c4b-tela-estoque-tecnico.cjs",
  "etapa3c4c-pecas-os.cjs",
  "etapa3c4d-pecas-valores-nova-os.cjs",
  "etapa3c4e-resultado-financeiro-os.cjs",
  "etapa3c5a1-projecao-cancelamento.cjs",
  "etapa3c5a-tecnico-snapshot.cjs",
  "etapa3c5b-config-tecnico.cjs",
  "etapa3c5c-selecao-tecnico-pronto.cjs",
  "etapa3c5e-aba-lucro-tecnico.cjs"
];

function run(command, args, label) {
  const startedAt = Date.now();
  console.log(`\n[3C.6] >>> ${label}`);

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  const durationMs = Date.now() - startedAt;
  const ok = result.status === 0 && !result.error;

  console.log(
    `[3C.6] ${ok ? "OK" : "FALHOU"} ${label} (${(durationMs / 1000).toFixed(1)}s)`
  );

  return {
    label,
    ok,
    status: result.status,
    durationMs,
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function main() {
  if (!fs.existsSync(testDir)) {
    throw new Error(`Pasta de testes não encontrada: ${testDir}`);
  }

  const missing = tests.filter((name) => !fs.existsSync(path.join(testDir, name)));
  if (missing.length > 0) {
    throw new Error(
      `Runner 3C.6 não iniciado. Teste(s) ausente(s): ${missing.join(", ")}`
    );
  }

  console.log("[3C.6] Regressão consolidada do Estoque Técnico");
  console.log(`[3C.6] Testes atuais: ${tests.length}`);
  console.log(
    "[3C.6] Ignorados por supersessão: etapa3c33b1-integracao-rota-status.cjs, etapa3c33b2-cliente-pronto.cjs, etapa3c5d-relatorio-lucro-tecnico.cjs e arquivos .bak"
  );

  const results = tests.map((name) =>
    run(process.execPath, [path.join(testDir, name)], name)
  );

  const nextDev = path.join(root, ".next", "dev");
  if (fs.existsSync(nextDev)) {
    console.log("\n[3C.6] Limpando .next/dev antes do TypeScript...");
    fs.rmSync(nextDev, { recursive: true, force: true });
  }

  const tscPath = path.join(root, "node_modules", "typescript", "bin", "tsc");

  if (!fs.existsSync(tscPath)) {
    throw new Error(`TypeScript local não encontrado: ${tscPath}`);
  }

  const typecheck = run(
    process.execPath,
    [tscPath, "--noEmit"],
    "TypeScript: npx tsc --noEmit"
  );
  results.push(typecheck);

  const failuresBeforeBuild = results.filter((item) => !item.ok);
  let build = null;

  if (withBuild && failuresBeforeBuild.length === 0) {
    const buildCommand =
      process.platform === "win32"
        ? {
            command: process.env.ComSpec || "cmd.exe",
            args: ["/d", "/s", "/c", "npm run build"],
          }
        : {
            command: "npm",
            args: ["run", "build"],
          };

    build = run(
      buildCommand.command,
      buildCommand.args,
      "Build: npm run build"
    );
    results.push(build);
  } else if (withBuild) {
    console.log("\n[3C.6] Build não executado porque há falha(s) anterior(es).");
  }

  const failures = results.filter((item) => !item.ok);
  const totalDurationMs = results.reduce((total, item) => total + item.durationMs, 0);

  const summary = {
    ok: failures.length === 0,
    stage: "3C.6",
    testsSelected: tests.length,
    typecheck: typecheck.ok,
    buildRequested: withBuild,
    build: build ? build.ok : null,
    failures: failures.map((item) => item.label),
    durationMs: totalDurationMs,
    ignoredSuperseded: [
      "etapa3c33b1-integracao-rota-status.cjs",
      "etapa3c33b2-cliente-pronto.cjs",
      "etapa3c5d-relatorio-lucro-tecnico.cjs",
      "*.bak-*"
    ],
  };

  console.log("\n[3C.6] RESUMO");
  console.log(JSON.stringify(summary));

  if (!summary.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error("\n[3C.6] ERRO:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
