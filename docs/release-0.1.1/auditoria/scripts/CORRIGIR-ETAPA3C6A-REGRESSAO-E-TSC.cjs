#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const testRelative =
  "scripts/test-estoque-tecnico/etapa3c4e-resultado-financeiro-os.cjs";
const runnerRelative =
  "scripts/test-estoque-tecnico/etapa3c6-regressao-geral.cjs";

const oldAssertion = "has(api, \"lucroBruto: custoRastreado ? receitaLiquida - custoPecas : null\", \"lucro não é inventado sem custo rastreado\");";
const newAssertion = "ok(\n  api.includes(\"lucroBruto: custoRastreado ? receitaLiquida - custoPecas : null\") ||\n    (\n      api.includes(\"const lucroBruto = custoRastreado\") &&\n      api.includes(\"? moeda(receitaLiquida - custoPecas)\") &&\n      api.includes(\": null;\")\n    ),\n  \"lucro não é inventado sem custo rastreado\"\n);";
const runnerExpected = "#!/usr/bin/env node\n\"use strict\";\n\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\nconst { spawnSync } = require(\"node:child_process\");\n\nconst root = process.cwd();\nconst testDir = path.join(root, \"scripts\", \"test-estoque-tecnico\");\nconst withBuild = process.argv.includes(\"--build\");\n\nconst tests = [\n  \"etapa3c1-core.cjs\",\n  \"etapa3c21-endurecimento.cjs\",\n  \"etapa3c2-servicos.cjs\",\n  \"etapa3c31-reserva-os.cjs\",\n  \"etapa3c32-alteracao-liberacao.cjs\",\n  \"etapa3c33a-consumo-pronto.cjs\",\n  \"etapa3c34a-cancelamento.cjs\",\n  \"etapa3c34b-integracao-cancelamento.cjs\",\n  \"etapa3c35a-estorno-manual.cjs\",\n  \"etapa3c35b-integracao-estorno.cjs\",\n  \"etapa3c4a-api-estoque-tecnico.cjs\",\n  \"etapa3c4b-tela-estoque-tecnico.cjs\",\n  \"etapa3c4c-pecas-os.cjs\",\n  \"etapa3c4d-pecas-valores-nova-os.cjs\",\n  \"etapa3c4e-resultado-financeiro-os.cjs\",\n  \"etapa3c5a1-projecao-cancelamento.cjs\",\n  \"etapa3c5a-tecnico-snapshot.cjs\",\n  \"etapa3c5b-config-tecnico.cjs\",\n  \"etapa3c5c-selecao-tecnico-pronto.cjs\",\n  \"etapa3c5e-aba-lucro-tecnico.cjs\"\n];\n\nfunction run(command, args, label) {\n  const startedAt = Date.now();\n  console.log(`\\n[3C.6] >>> ${label}`);\n\n  const result = spawnSync(command, args, {\n    cwd: root,\n    stdio: \"inherit\",\n    shell: false,\n  });\n\n  const durationMs = Date.now() - startedAt;\n  const ok = result.status === 0 && !result.error;\n\n  console.log(\n    `[3C.6] ${ok ? \"OK\" : \"FALHOU\"} ${label} (${(durationMs / 1000).toFixed(1)}s)`\n  );\n\n  return {\n    label,\n    ok,\n    status: result.status,\n    durationMs,\n    error: result.error ? String(result.error.message || result.error) : null,\n  };\n}\n\nfunction main() {\n  if (!fs.existsSync(testDir)) {\n    throw new Error(`Pasta de testes não encontrada: ${testDir}`);\n  }\n\n  const missing = tests.filter((name) => !fs.existsSync(path.join(testDir, name)));\n  if (missing.length > 0) {\n    throw new Error(\n      `Runner 3C.6 não iniciado. Teste(s) ausente(s): ${missing.join(\", \")}`\n    );\n  }\n\n  console.log(\"[3C.6] Regressão consolidada do Estoque Técnico\");\n  console.log(`[3C.6] Testes atuais: ${tests.length}`);\n  console.log(\n    \"[3C.6] Ignorados por supersessão: etapa3c33b1-integracao-rota-status.cjs, etapa3c33b2-cliente-pronto.cjs, etapa3c5d-relatorio-lucro-tecnico.cjs e arquivos .bak\"\n  );\n\n  const results = tests.map((name) =>\n    run(process.execPath, [path.join(testDir, name)], name)\n  );\n\n  const nextDev = path.join(root, \".next\", \"dev\");\n  if (fs.existsSync(nextDev)) {\n    console.log(\"\\n[3C.6] Limpando .next/dev antes do TypeScript...\");\n    fs.rmSync(nextDev, { recursive: true, force: true });\n  }\n\n  const npx = process.platform === \"win32\" ? \"npx.cmd\" : \"npx\";\n  const npm = process.platform === \"win32\" ? \"npm.cmd\" : \"npm\";\n\n  const typecheck = run(npx, [\"tsc\", \"--noEmit\"], \"TypeScript: npx tsc --noEmit\");\n  results.push(typecheck);\n\n  const failuresBeforeBuild = results.filter((item) => !item.ok);\n  let build = null;\n\n  if (withBuild && failuresBeforeBuild.length === 0) {\n    build = run(npm, [\"run\", \"build\"], \"Build: npm run build\");\n    results.push(build);\n  } else if (withBuild) {\n    console.log(\"\\n[3C.6] Build não executado porque há falha(s) anterior(es).\");\n  }\n\n  const failures = results.filter((item) => !item.ok);\n  const totalDurationMs = results.reduce((total, item) => total + item.durationMs, 0);\n\n  const summary = {\n    ok: failures.length === 0,\n    stage: \"3C.6\",\n    testsSelected: tests.length,\n    typecheck: typecheck.ok,\n    buildRequested: withBuild,\n    build: build ? build.ok : null,\n    failures: failures.map((item) => item.label),\n    durationMs: totalDurationMs,\n    ignoredSuperseded: [\n      \"etapa3c33b1-integracao-rota-status.cjs\",\n      \"etapa3c33b2-cliente-pronto.cjs\",\n      \"etapa3c5d-relatorio-lucro-tecnico.cjs\",\n      \"*.bak-*\"\n    ],\n  };\n\n  console.log(\"\\n[3C.6] RESUMO\");\n  console.log(JSON.stringify(summary));\n\n  if (!summary.ok) process.exitCode = 1;\n}\n\ntry {\n  main();\n} catch (error) {\n  console.error(\"\\n[3C.6] ERRO:\", error instanceof Error ? error.message : error);\n  process.exitCode = 1;\n}\n";
const runnerFixed = "#!/usr/bin/env node\n\"use strict\";\n\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\nconst { spawnSync } = require(\"node:child_process\");\n\nconst root = process.cwd();\nconst testDir = path.join(root, \"scripts\", \"test-estoque-tecnico\");\nconst withBuild = process.argv.includes(\"--build\");\n\nconst tests = [\n  \"etapa3c1-core.cjs\",\n  \"etapa3c21-endurecimento.cjs\",\n  \"etapa3c2-servicos.cjs\",\n  \"etapa3c31-reserva-os.cjs\",\n  \"etapa3c32-alteracao-liberacao.cjs\",\n  \"etapa3c33a-consumo-pronto.cjs\",\n  \"etapa3c34a-cancelamento.cjs\",\n  \"etapa3c34b-integracao-cancelamento.cjs\",\n  \"etapa3c35a-estorno-manual.cjs\",\n  \"etapa3c35b-integracao-estorno.cjs\",\n  \"etapa3c4a-api-estoque-tecnico.cjs\",\n  \"etapa3c4b-tela-estoque-tecnico.cjs\",\n  \"etapa3c4c-pecas-os.cjs\",\n  \"etapa3c4d-pecas-valores-nova-os.cjs\",\n  \"etapa3c4e-resultado-financeiro-os.cjs\",\n  \"etapa3c5a1-projecao-cancelamento.cjs\",\n  \"etapa3c5a-tecnico-snapshot.cjs\",\n  \"etapa3c5b-config-tecnico.cjs\",\n  \"etapa3c5c-selecao-tecnico-pronto.cjs\",\n  \"etapa3c5e-aba-lucro-tecnico.cjs\"\n];\n\nfunction run(command, args, label) {\n  const startedAt = Date.now();\n  console.log(`\\n[3C.6] >>> ${label}`);\n\n  const result = spawnSync(command, args, {\n    cwd: root,\n    stdio: \"inherit\",\n    shell: false,\n  });\n\n  const durationMs = Date.now() - startedAt;\n  const ok = result.status === 0 && !result.error;\n\n  console.log(\n    `[3C.6] ${ok ? \"OK\" : \"FALHOU\"} ${label} (${(durationMs / 1000).toFixed(1)}s)`\n  );\n\n  return {\n    label,\n    ok,\n    status: result.status,\n    durationMs,\n    error: result.error ? String(result.error.message || result.error) : null,\n  };\n}\n\nfunction main() {\n  if (!fs.existsSync(testDir)) {\n    throw new Error(`Pasta de testes não encontrada: ${testDir}`);\n  }\n\n  const missing = tests.filter((name) => !fs.existsSync(path.join(testDir, name)));\n  if (missing.length > 0) {\n    throw new Error(\n      `Runner 3C.6 não iniciado. Teste(s) ausente(s): ${missing.join(\", \")}`\n    );\n  }\n\n  console.log(\"[3C.6] Regressão consolidada do Estoque Técnico\");\n  console.log(`[3C.6] Testes atuais: ${tests.length}`);\n  console.log(\n    \"[3C.6] Ignorados por supersessão: etapa3c33b1-integracao-rota-status.cjs, etapa3c33b2-cliente-pronto.cjs, etapa3c5d-relatorio-lucro-tecnico.cjs e arquivos .bak\"\n  );\n\n  const results = tests.map((name) =>\n    run(process.execPath, [path.join(testDir, name)], name)\n  );\n\n  const nextDev = path.join(root, \".next\", \"dev\");\n  if (fs.existsSync(nextDev)) {\n    console.log(\"\\n[3C.6] Limpando .next/dev antes do TypeScript...\");\n    fs.rmSync(nextDev, { recursive: true, force: true });\n  }\n\n  const tscPath = path.join(root, \"node_modules\", \"typescript\", \"bin\", \"tsc\");\n\n  if (!fs.existsSync(tscPath)) {\n    throw new Error(`TypeScript local não encontrado: ${tscPath}`);\n  }\n\n  const typecheck = run(\n    process.execPath,\n    [tscPath, \"--noEmit\"],\n    \"TypeScript: npx tsc --noEmit\"\n  );\n  results.push(typecheck);\n\n  const failuresBeforeBuild = results.filter((item) => !item.ok);\n  let build = null;\n\n  if (withBuild && failuresBeforeBuild.length === 0) {\n    const buildCommand =\n      process.platform === \"win32\"\n        ? {\n            command: process.env.ComSpec || \"cmd.exe\",\n            args: [\"/d\", \"/s\", \"/c\", \"npm run build\"],\n          }\n        : {\n            command: \"npm\",\n            args: [\"run\", \"build\"],\n          };\n\n    build = run(\n      buildCommand.command,\n      buildCommand.args,\n      \"Build: npm run build\"\n    );\n    results.push(build);\n  } else if (withBuild) {\n    console.log(\"\\n[3C.6] Build não executado porque há falha(s) anterior(es).\");\n  }\n\n  const failures = results.filter((item) => !item.ok);\n  const totalDurationMs = results.reduce((total, item) => total + item.durationMs, 0);\n\n  const summary = {\n    ok: failures.length === 0,\n    stage: \"3C.6\",\n    testsSelected: tests.length,\n    typecheck: typecheck.ok,\n    buildRequested: withBuild,\n    build: build ? build.ok : null,\n    failures: failures.map((item) => item.label),\n    durationMs: totalDurationMs,\n    ignoredSuperseded: [\n      \"etapa3c33b1-integracao-rota-status.cjs\",\n      \"etapa3c33b2-cliente-pronto.cjs\",\n      \"etapa3c5d-relatorio-lucro-tecnico.cjs\",\n      \"*.bak-*\"\n    ],\n  };\n\n  console.log(\"\\n[3C.6] RESUMO\");\n  console.log(JSON.stringify(summary));\n\n  if (!summary.ok) process.exitCode = 1;\n}\n\ntry {\n  main();\n} catch (error) {\n  console.error(\"\\n[3C.6] ERRO:\", error instanceof Error ? error.message : error);\n  process.exitCode = 1;\n}\n";

function abs(relative) {
  return path.join(root, ...relative.split("/"));
}

function read(relative) {
  const file = abs(relative);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${relative}`);
  }
  return fs.readFileSync(file, "utf8");
}

function backup(relative) {
  const file = abs(relative);
  const copy = `${file}.bak-3c6a-${stamp}`;
  fs.copyFileSync(file, copy);
  console.log(`[BACKUP] ${path.basename(copy)}`);
}

function main() {
  const test = read(testRelative);
  const currentRunner = read(runnerRelative);

  if (!test.includes(oldAssertion) && !test.includes(newAssertion)) {
    throw new Error(
      "O teste 3C.4E mudou além do esperado. Nenhum arquivo foi alterado."
    );
  }

  if (currentRunner !== runnerExpected && currentRunner !== runnerFixed) {
    throw new Error(
      "O runner 3C.6 mudou além do esperado. Nenhum arquivo foi alterado."
    );
  }

  const changed = [];

  if (test.includes(oldAssertion)) {
    backup(testRelative);
    fs.writeFileSync(
      abs(testRelative),
      test.replace(oldAssertion, newAssertion),
      "utf8"
    );
    changed.push(testRelative);
    console.log(`[GRAVADO] ${testRelative}`);
  } else {
    console.log(`[OK JÁ CORRIGIDO] ${testRelative}`);
  }

  if (currentRunner !== runnerFixed) {
    backup(runnerRelative);
    fs.writeFileSync(abs(runnerRelative), runnerFixed, "utf8");
    changed.push(runnerRelative);
    console.log(`[GRAVADO] ${runnerRelative}`);
  } else {
    console.log(`[OK JÁ CORRIGIDO] ${runnerRelative}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      stage: "3C.6A",
      changed,
      fix3C4E: "aceita a forma refatorada que mantém lucro null sem custo rastreado",
      fixTypecheck: "executa o TypeScript local via node, sem npx.cmd",
      fixBuildWindows: "executa npm run build via cmd.exe",
      productLogicChanged: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationRequired: false
    })
  );
}

main();
