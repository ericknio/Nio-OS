#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const expected = {
  "package.json": "5c372e34202ca8dc8ed6224701c850ca3f601a404df3a562b45cce1a56737897",
  "desktop/main.cjs": "82d285b54cd1cc293e9ae0674402ac8f7106277a31499e696a7c0a0d62047a45",
  "scripts/preparar-env-sqlite-local.js": "33825aae7e3863c932f028cf6c7affcf694b835dc398a6b4eb7063537639ed2d",
  "app/api/runtime/uploads/[...path]/route.ts": "7181c7f0f89a2bec7bf567dfe7484b0a78c720b614943e0dba4f2ed5da4d8eb6",
  "app/api/ordens/[id]/anexos/route.ts": "827afa97081d1cb161fd164aa7ce20c3704ac8ea8ae134ce911e21145f85bf37",
  "app/api/ordens/[id]/anexos/[anexoId]/route.ts": "915803efb7b337719d663acff6ccd30fb586c1f9374b713888f610f6c84224f4",
  "app/api/uploads/anexos/[arquivo]/route.ts": "f46c93edef2353eac28297c086be73cf673d5c660f6329062a1d6fc6247f7476",
  "app/api/produtos/upload/[arquivo]/route.ts": "5d4825d6ff8c43ce34cc8e6b9a2237bfe9832fa71c00f09dea33dea3004dfcdd",
  "app/api/uploads/produtos/[arquivo]/route.ts": "bbacc1d19544cc2f15363a10cabbb6aac37a21365ed9e419f7f7e1ee71a8cdff",
  "app/api/relatorios/pdf/route.ts": "4dbb22ab90eae55a585c2ae0668b1ee8c072a55335ada73a7dd8b73d89614bdb",
  "REDEFINIR-MODO-DESKTOP.bat": "1c15180fe11310d7917cdc5658a70bd3502ba45f33b260854b0a3cd35402957e",
  "REDEFINIR-MODO-DESKTOP.ps1": "2974673437c158dd8ee0b43995818bdaafced60125c4ce040030ff1864d846b4"
};

const runtimeStorageContent = "import path from \"node:path\";\n\nfunction raizPadraoWindows() {\n  const base = process.env.LOCALAPPDATA || process.env.APPDATA;\n  return base ? path.join(base, \"Nio-OS\") : process.cwd();\n}\n\nexport function raizDadosRuntime() {\n  const explicit =\n    process.env.NIO_OS_DATA_DIR ||\n    process.env.NIO_OS_RUNTIME_DIR ||\n    process.env.NIO_OS_APPDATA_DIR;\n\n  if (explicit) return path.resolve(explicit);\n\n  if (process.env.NODE_ENV !== \"production\") {\n    return process.cwd();\n  }\n\n  if (process.platform === \"win32\") {\n    return raizPadraoWindows();\n  }\n\n  return path.join(process.env.HOME || process.cwd(), \".nio-os\");\n}\n\nexport function limparPartesCaminho(partes: unknown[]) {\n  return partes\n    .flatMap((parte) => String(parte || \"\").split(/[\\\\/]+/g))\n    .map((parte) => parte.trim())\n    .filter((parte) => parte && parte !== \".\" && parte !== \"..\");\n}\n\nexport function caminhoPublicoRuntime(...partes: unknown[]) {\n  return path.join(\n    raizDadosRuntime(),\n    \"public\",\n    ...limparPartesCaminho(partes),\n  );\n}\n\nexport function caminhoUploadPublico(...partes: unknown[]) {\n  return caminhoPublicoRuntime(\"uploads\", ...partes);\n}\n\nexport function caminhoStorageRuntime(...partes: unknown[]) {\n  return path.join(\n    raizDadosRuntime(),\n    \"storage\",\n    ...limparPartesCaminho(partes),\n  );\n}\n\nexport function caminhoBackupsRuntime(...partes: unknown[]) {\n  return path.join(\n    raizDadosRuntime(),\n    \"backups\",\n    ...limparPartesCaminho(partes),\n  );\n}\n\nexport function caminhoEstaDentro(caminho: string, raiz: string) {\n  const raizResolvida = path.resolve(raiz);\n  const caminhoResolvido = path.resolve(caminho);\n  const relativo = path.relative(raizResolvida, caminhoResolvido);\n\n  return (\n    relativo === \"\" ||\n    (!relativo.startsWith(\"..\") && !path.isAbsolute(relativo))\n  );\n}\n";
const testContent = "#!/usr/bin/env node\n\"use strict\";\n\nconst assert = require(\"node:assert/strict\");\nconst fs = require(\"node:fs\");\nconst path = require(\"node:path\");\n\nconst root = process.cwd();\nlet assertions = 0;\n\nfunction read(relative) {\n  const file = path.join(root, ...relative.split(\"/\"));\n  if (!fs.existsSync(file)) {\n    throw new Error(`Arquivo não encontrado: ${relative}`);\n  }\n  return fs.readFileSync(file, \"utf8\");\n}\n\nfunction check(value, message) {\n  assertions += 1;\n  assert.ok(value, message);\n}\n\nfunction has(text, value, message) {\n  check(text.includes(value), message);\n}\n\nfunction lacks(text, value, message) {\n  check(!text.includes(value), message);\n}\n\nconst runtime = read(\"lib/runtimeStorage.ts\");\nhas(runtime, \"process.env.LOCALAPPDATA || process.env.APPDATA\", \"runtime prioriza LOCALAPPDATA\");\nhas(runtime, 'process.env.NODE_ENV !== \"production\"', \"desenvolvimento permanece no projeto\");\nhas(runtime, \"process.env.NIO_OS_DATA_DIR\", \"runtime aceita raiz explícita\");\nhas(runtime, \"process.env.NIO_OS_RUNTIME_DIR\", \"runtime aceita raiz runtime explícita\");\n\nconst desktop = read(\"desktop/main.cjs\");\nhas(desktop, 'process.env.LOCALAPPDATA || app.getPath(\"appData\")', \"Electron usa LOCALAPPDATA\");\nhas(desktop, \"caminhoRaizRoamingLegada\", \"Electron mantém compatibilidade de upgrade do Roaming\");\nhas(desktop, \"migrarDadosRoamingLegados\", \"Electron migra legado sem sobrescrever destino\");\nhas(desktop, \"Banco SQLite inicial/migrado para LOCALAPPDATA\", \"log não chama destino de APPDATA\");\n\nconst pkg = JSON.parse(read(\"package.json\"));\ncheck(!Object.prototype.hasOwnProperty.call(pkg.scripts, \"prisma:push\"), \"script prisma:push removido\");\ncheck(\n  pkg.scripts[\"local:prepare\"] === \"npm run prisma:generate && npm run build\",\n  \"local:prepare não executa db push\",\n);\nlacks(pkg.scripts[\"local:prepare\"], \"db push\", \"build não chama db push\");\n\nconst envPrep = read(\"scripts/preparar-env-sqlite-local.js\");\nhas(envPrep, '\"NIO_OS_DATA_DIR\"', \"preparação local fixa raiz de dados no projeto\");\nhas(envPrep, '\"NIO_OS_RUNTIME_DIR\"', \"preparação local fixa raiz runtime no projeto\");\n\nconst runtimeUpload = read(\"app/api/runtime/uploads/[...path]/route.ts\");\nhas(runtimeUpload, 'from \"@/lib/runtimeStorage\"', \"rota runtime usa helper central\");\nlacks(runtimeUpload, \"process.env.APPDATA\", \"rota runtime não resolve Roaming própria\");\n\nconst attachCreate = read(\"app/api/ordens/[id]/anexos/route.ts\");\nhas(attachCreate, \"caminhoStorageRuntime\", \"anexo grava em storage runtime\");\nlacks(\n  attachCreate,\n  'path.join(process.cwd(), \"storage\", \"uploads\", \"anexos\")',\n  \"anexo não grava no cwd\",\n);\n\nconst attachDelete = read(\"app/api/ordens/[id]/anexos/[anexoId]/route.ts\");\nhas(attachDelete, \"caminhoStorageRuntime\", \"exclusão usa storage runtime\");\nhas(attachDelete, \"caminhoUploadPublico\", \"exclusão mantém compatibilidade public/uploads\");\n\nconst attachGet = read(\"app/api/uploads/anexos/[arquivo]/route.ts\");\nhas(attachGet, \"caminhoStorageRuntime\", \"leitura protegida usa storage runtime\");\nhas(attachGet, \"caminhoUploadPublico\", \"leitura protegida verifica legado public/uploads\");\n\nfor (const file of [\n  \"app/api/produtos/upload/[arquivo]/route.ts\",\n  \"app/api/uploads/produtos/[arquivo]/route.ts\",\n]) {\n  const text = read(file);\n  has(text, \"caminhoUploadPublico\", `${file} usa upload runtime`);\n  lacks(text, 'path.join(\\n      process.cwd(),', `${file} não monta public pelo cwd`);\n}\n\nconst reportPdf = read(\"app/api/relatorios/pdf/route.ts\");\nhas(reportPdf, \"caminhoUploadPublico\", \"PDF de relatório usa logo runtime\");\nlacks(reportPdf, 'path.resolve(process.cwd(), \"public\")', \"PDF não busca logo no cwd\");\n\nconst resetBat = read(\"REDEFINIR-MODO-DESKTOP.bat\");\nhas(resetBat, \"$env:LOCALAPPDATA\", \"BAT redefine modo no LOCALAPPDATA\");\n\nconst resetPs1 = read(\"REDEFINIR-MODO-DESKTOP.ps1\");\nhas(resetPs1, 'Join-Path $env:LOCALAPPDATA \"Nio-OS\\\\nio-os-desktop-config.json\"', \"PS1 usa caminho atual Local\");\nhas(resetPs1, 'Join-Path $env:APPDATA \"Nio-OS\\\\nio-os-desktop-config.json\"', \"PS1 ainda limpa legado Roaming\");\n\nconsole.log(JSON.stringify({\n  ok: true,\n  stage: \"4A.7A\",\n  assertions,\n  databaseChanged: false,\n  schemaChanged: false,\n  migrationRequired: false,\n  prismaDbPushUsed: false,\n  desktopBuildRun: false\n}));\n";

function abs(relative) {
  return path.join(root, ...relative.split("/"));
}

function sha256(text) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(text, "utf8"))
    .digest("hex");
}

function readRequired(relative) {
  const file = abs(relative);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo obrigatório não encontrado: ${relative}`);
  }
  return fs.readFileSync(file, "utf8");
}

function validateExact(relative) {
  const current = readRequired(relative);
  const actual = sha256(current);
  if (actual !== expected[relative]) {
    throw new Error(
      `${relative} mudou desde a inspeção 4A.7. ` +
      `Esperado ${expected[relative]}, atual ${actual}. Nenhum arquivo será alterado.`
    );
  }
}

function validateRuntimeStorage() {
  const relative = "lib/runtimeStorage.ts";
  const current = readRequired(relative);

  for (const marker of [
    "raizDadosRuntime",
    "caminhoPublicoRuntime",
    "caminhoUploadPublico",
    "caminhoStorageRuntime",
    "caminhoBackupsRuntime",
  ]) {
    if (!current.includes(marker)) {
      throw new Error(
        `lib/runtimeStorage.ts não contém o marcador esperado: ${marker}. Nenhum arquivo será alterado.`
      );
    }
  }
}

function backupAndWrite(relative, content, changed) {
  const file = abs(relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (current === content) {
      console.log(`[OK JÁ ATUALIZADO] ${relative}`);
      return;
    }

    const backup = `${file}.bak-4a7a-${stamp}`;
    fs.copyFileSync(file, backup);
    console.log(`[BACKUP] ${path.basename(backup)}`);
  }

  fs.writeFileSync(file, content, "utf8");
  changed.push(relative);
  console.log(`[GRAVADO] ${relative}`);
}

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;

  const first = source.indexOf(oldText);
  if (first < 0) {
    throw new Error(`Ponto de patch não encontrado: ${label}`);
  }

  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`Ponto de patch ambíguo: ${label}`);
  }

  return (
    source.slice(0, first) +
    newText +
    source.slice(first + oldText.length)
  );
}

function ensureImport(source, importLine, anchor) {
  if (source.includes(importLine)) return source;
  if (!source.includes(anchor)) {
    throw new Error(`Import anchor não encontrado: ${anchor}`);
  }
  return source.replace(anchor, `${anchor}\n${importLine}`);
}

function patchPackage(source) {
  const pkg = JSON.parse(source);

  delete pkg.scripts["prisma:push"];
  pkg.scripts["local:prepare"] = "npm run prisma:generate && npm run build";

  return JSON.stringify(pkg, null, 2) + "\n";
}

function patchDesktop(source) {
  let next = source
    .replaceAll("%APPDATA%\\Nio-OS", "%LOCALAPPDATA%\\Nio-OS")
    .replaceAll("para APPDATA:", "para LOCALAPPDATA:");

  next = replaceOnce(
    next,
    'app.setPath("userData", path.join(app.getPath("appData"), "Nio-OS"));',
    'app.setPath("userData", path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "Nio-OS"));',
    "Electron userData LOCALAPPDATA"
  );

  const appDataAnchor = `function appDataPath(...partes) {
  return path.join(app.getPath("userData"), ...partes);
}`;

  const legacyHelpers = `function appDataPath(...partes) {
  return path.join(app.getPath("userData"), ...partes);
}

function caminhoRaizRoamingLegada() {
  if (process.platform !== "win32" || !process.env.APPDATA) return "";
  return path.join(process.env.APPDATA, "Nio-OS");
}

function caminhoRoamingLegado(...partes) {
  const raiz = caminhoRaizRoamingLegada();
  return raiz ? path.join(raiz, ...partes) : "";
}`;

  next = replaceOnce(
    next,
    appDataAnchor,
    legacyHelpers,
    "helpers Roaming legado"
  );

  const folderCopyAnchor = `function copiarPastaSeDestinoVazio(origem, destino) {
  if (!origem || !destino) return false;
  if (!fs.existsSync(origem) || !pastaVazia(destino)) return false;

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true, force: true });
  return true;
}`;

  const folderCopyWithMigration = `function copiarPastaSeDestinoVazio(origem, destino) {
  if (!origem || !destino) return false;
  if (!fs.existsSync(origem) || !pastaVazia(destino)) return false;

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true, force: true });
  return true;
}

function migrarDadosRoamingLegados() {
  if (!app.isPackaged) return;

  const raizLegada = caminhoRaizRoamingLegada();
  const raizAtual = app.getPath("userData");

  if (
    !raizLegada ||
    path.resolve(raizLegada) === path.resolve(raizAtual) ||
    !fs.existsSync(raizLegada)
  ) {
    return;
  }

  copiarSeNaoExistir(
    caminhoRoamingLegado("nio-os-desktop-config.json"),
    configPath()
  );

  copiarBancoComAuxiliares(
    caminhoRoamingLegado("data", "nio-os.db"),
    caminhoSqliteLocal()
  );

  copiarPastaSeDestinoVazio(
    caminhoRoamingLegado("public", "uploads"),
    appDataPath("public", "uploads")
  );

  copiarPastaSeDestinoVazio(
    caminhoRoamingLegado("storage"),
    appDataPath("storage")
  );

  copiarPastaSeDestinoVazio(
    caminhoRoamingLegado("backups"),
    appDataPath("backups")
  );
}`;

  next = replaceOnce(
    next,
    folderCopyAnchor,
    folderCopyWithMigration,
    "migração Roaming para Local"
  );

  const prepAnchor = `function prepararPastasLocais() {
  const pastas = [`;

  const prepReplacement = `function prepararPastasLocais() {
  migrarDadosRoamingLegados();

  const pastas = [`;

  next = replaceOnce(
    next,
    prepAnchor,
    prepReplacement,
    "prepararPastasLocais migração"
  );

  const readyAnchor = `app.whenReady().then(() => {
  if (!instanceLock) return;
  criarJanelaPrincipal();`;

  const readyReplacement = `app.whenReady().then(() => {
  if (!instanceLock) return;
  migrarDadosRoamingLegados();
  criarJanelaPrincipal();`;

  next = replaceOnce(
    next,
    readyAnchor,
    readyReplacement,
    "migração antes do autoStart"
  );

  return next;
}

function patchEnvPrep(source) {
  let next = source;

  const anchor = `  env = atualizarEnv(env, "DATABASE_URL", '"file:../data/nio-os.db"');
  env = atualizarEnv(env, "NODE_ENV", '"production"');`;

  const replacement = `  const raizRuntime = raiz.replace(/\\\\/g, "/");

  env = atualizarEnv(env, "DATABASE_URL", '"file:../data/nio-os.db"');
  env = atualizarEnv(env, "NIO_OS_DATA_DIR", \`"\${raizRuntime}"\`);
  env = atualizarEnv(env, "NIO_OS_RUNTIME_DIR", \`"\${raizRuntime}"\`);
  env = atualizarEnv(env, "NODE_ENV", '"production"');`;

  return replaceOnce(
    next,
    anchor,
    replacement,
    "env local com raiz explícita"
  );
}

function patchRuntimeUpload(source) {
  let next = ensureImport(
    source,
    'import { caminhoUploadPublico } from "@/lib/runtimeStorage";',
    'import { NextResponse } from "next/server";'
  );

  const oldRuntimeResolver = [
    "function raizDadosRuntime() {",
    "  const direto = process.env.NIO_OS_DATA_DIR || process.env.NIO_OS_APPDATA_DIR;",
    "",
    "  if (direto) return direto;",
    "",
    '  if (process.platform === "win32") {',
    '    return path.join(process.env.APPDATA || process.cwd(), "Nio-OS");',
    "  }",
    "",
    '  return path.join(process.env.HOME || process.cwd(), ".nio-os");',
    "}",
    "",
    "",
  ].join("\r\n");

  if (next.includes(oldRuntimeResolver)) {
    next = next.replace(oldRuntimeResolver, "");
  } else if (next.includes("function raizDadosRuntime() {")) {
    throw new Error(
      "Resolver local duplicado da rota runtime mudou; nenhum patch seguro foi aplicado."
    );
  }

  next = replaceOnce(
    next,
    'const base = path.join(raizDadosRuntime(), "public", "uploads");',
    "const base = caminhoUploadPublico();",
    "base de uploads runtime"
  );

  return next;
}

function patchAttachCreate(source) {
  let next = ensureImport(
    source,
    'import { caminhoStorageRuntime } from "@/lib/runtimeStorage";',
    'import { exigirPermissaoApi } from "@/lib/permissaoApi";'
  );

  return replaceOnce(
    next,
    'return path.join(process.cwd(), "storage", "uploads", "anexos");',
    'return caminhoStorageRuntime("uploads", "anexos");',
    "storage de anexos"
  );
}

function patchAttachDelete(source) {
  let next = ensureImport(
    source,
    'import { caminhoStorageRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";',
    'import { exigirPermissaoApi } from "@/lib/permissaoApi";'
  );

  const oldBlock = `  const caminhos = [
    path.join(process.cwd(), "storage", "uploads", "anexos", nomeArquivo),
    path.join(process.cwd(), "public", "uploads", "anexos", nomeArquivo),
  ];

  if (valor.startsWith("/uploads/") || valor.startsWith("uploads/")) {
    caminhos.push(path.join(process.cwd(), "public", valor.replace(/^\\/+/, "")));
  }`;

  const newBlock = `  const caminhos = [
    caminhoStorageRuntime("uploads", "anexos", nomeArquivo),
    caminhoUploadPublico("anexos", nomeArquivo),
  ];

  if (valor.startsWith("/uploads/") || valor.startsWith("uploads/")) {
    caminhos.push(
      caminhoUploadPublico(valor.replace(/^\\/+uploads[\\\\/]+/, ""))
    );
  }`;

  return replaceOnce(
    next,
    oldBlock,
    newBlock,
    "caminhos de exclusão de anexos"
  );
}

function patchAttachGet(source) {
  let next = ensureImport(
    source,
    'import { caminhoStorageRuntime, caminhoUploadPublico } from "@/lib/runtimeStorage";',
    'import { exigirPermissaoApi } from "@/lib/permissaoApi";'
  );

  const oldProtected = `  const caminhoProtegido = path.join(
    process.cwd(),
    "storage",
    "uploads",
    "anexos",
    nomeSeguro
  );`;

  const newProtected = `  const caminhoProtegido = caminhoStorageRuntime(
    "uploads",
    "anexos",
    nomeSeguro
  );`;

  next = replaceOnce(
    next,
    oldProtected,
    newProtected,
    "leitura storage de anexo"
  );

  const oldLegacy = `  const caminhoAntigo = path.join(
    process.cwd(),
    "public",
    "uploads",
    "anexos",
    nomeSeguro
  );`;

  const newLegacy = `  const caminhoAntigo = caminhoUploadPublico(
    "anexos",
    nomeSeguro
  );`;

  return replaceOnce(
    next,
    oldLegacy,
    newLegacy,
    "leitura legado public de anexo"
  );
}

function patchProductGet(source) {
  let next = ensureImport(
    source,
    'import { caminhoUploadPublico } from "@/lib/runtimeStorage";',
    'import path from "path";'
  );

  if (next.includes('const filePath = caminhoUploadPublico("produtos", nomeSeguro);')) {
    return next;
  }

  const pattern =
    /    const filePath = path\.join\(\r?\n\s*process\.cwd\(\),\r?\n\s*"public",\r?\n\s*"uploads",\r?\n\s*"produtos",\r?\n\s*nomeSeguro\r?\n\s*\);/;

  if (!pattern.test(next)) {
    throw new Error("Ponto de patch não encontrado: imagem de produto runtime");
  }

  return next.replace(
    pattern,
    '    const filePath = caminhoUploadPublico("produtos", nomeSeguro);'
  );
}

function patchReportPdf(source) {
  let next = ensureImport(
    source,
    'import { caminhoUploadPublico } from "@/lib/runtimeStorage";',
    'import path from "path";'
  );

  const oldBlock = `function caminhoLogoSeguro(logoUrl?: string) {
  const publicDir = path.resolve(process.cwd(), "public");
  const logoLimpa = String(logoUrl || "/uploads/logo.png").split("?")[0];

  if (!logoLimpa.startsWith("/uploads/")) {
    return null;
  }

  const caminhoRelativo = logoLimpa.replace(/^\\/+/, "");
  const caminhoResolvido = path.resolve(publicDir, caminhoRelativo);

  if (!caminhoResolvido.startsWith(publicDir + path.sep)) {
    return null;
  }

  return caminhoResolvido;
}`;

  const newBlock = `function caminhoLogoSeguro(logoUrl?: string) {
  const uploadsDir = path.resolve(caminhoUploadPublico());
  const logoLimpa = String(logoUrl || "/uploads/logo.png").split("?")[0];

  if (!logoLimpa.startsWith("/uploads/")) {
    return null;
  }

  const relativo = logoLimpa.replace(/^\\/+uploads[\\\\/]+/, "");
  const caminhoResolvido = path.resolve(uploadsDir, relativo);
  const dentro =
    caminhoResolvido === uploadsDir ||
    caminhoResolvido.startsWith(uploadsDir + path.sep);

  return dentro ? caminhoResolvido : null;
}`;

  return replaceOnce(
    next,
    oldBlock,
    newBlock,
    "logo PDF no runtime"
  );
}

function patchResetBat(_source) {
  return `@echo off
setlocal
echo Redefinindo modo salvo do Nio-OS Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$paths = @((Join-Path $env:LOCALAPPDATA 'Nio-OS\\nio-os-desktop-config.json'), (Join-Path $env:APPDATA 'Nio-OS\\nio-os-desktop-config.json')); foreach ($p in $paths) { if (Test-Path $p) { Remove-Item -LiteralPath $p -Force; Write-Host ('Removido: ' + $p) } }; if (-not ($paths | Where-Object { Test-Path $_ })) { Write-Host 'Modo redefinido.' }"
pause
`;
}

function patchResetPs1(_source) {
  return `$ErrorActionPreference = "Stop"

$paths = @(
  (Join-Path $env:LOCALAPPDATA "Nio-OS\\nio-os-desktop-config.json"),
  (Join-Path $env:APPDATA "Nio-OS\\nio-os-desktop-config.json")
)

$removidos = 0

foreach ($path in $paths) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "Removido: $path"
    $removidos++
  }
}

if ($removidos -eq 0) {
  Write-Host "Nenhuma escolha salva encontrada."
}
`;
}

function main() {
  for (const relative of Object.keys(expected)) {
    validateExact(relative);
  }
  validateRuntimeStorage();

  const current = Object.fromEntries(
    Object.keys(expected).map((relative) => [
      relative,
      readRequired(relative),
    ])
  );

  const outputs = {
    "package.json": patchPackage(current["package.json"]),
    "desktop/main.cjs": patchDesktop(current["desktop/main.cjs"]),
    "scripts/preparar-env-sqlite-local.js":
      patchEnvPrep(current["scripts/preparar-env-sqlite-local.js"]),
    "app/api/runtime/uploads/[...path]/route.ts":
      patchRuntimeUpload(current["app/api/runtime/uploads/[...path]/route.ts"]),
    "app/api/ordens/[id]/anexos/route.ts":
      patchAttachCreate(current["app/api/ordens/[id]/anexos/route.ts"]),
    "app/api/ordens/[id]/anexos/[anexoId]/route.ts":
      patchAttachDelete(current["app/api/ordens/[id]/anexos/[anexoId]/route.ts"]),
    "app/api/uploads/anexos/[arquivo]/route.ts":
      patchAttachGet(current["app/api/uploads/anexos/[arquivo]/route.ts"]),
    "app/api/produtos/upload/[arquivo]/route.ts":
      patchProductGet(current["app/api/produtos/upload/[arquivo]/route.ts"]),
    "app/api/uploads/produtos/[arquivo]/route.ts":
      patchProductGet(current["app/api/uploads/produtos/[arquivo]/route.ts"]),
    "app/api/relatorios/pdf/route.ts":
      patchReportPdf(current["app/api/relatorios/pdf/route.ts"]),
    "REDEFINIR-MODO-DESKTOP.bat":
      patchResetBat(current["REDEFINIR-MODO-DESKTOP.bat"]),
    "REDEFINIR-MODO-DESKTOP.ps1":
      patchResetPs1(current["REDEFINIR-MODO-DESKTOP.ps1"]),
    "lib/runtimeStorage.ts": runtimeStorageContent,
    "scripts/test-estoque-tecnico/etapa4a7-runtime-paths.cjs": testContent,
  };

  const changed = [];

  // Todas as transformações são calculadas antes da primeira escrita.
  for (const [relative, content] of Object.entries(outputs)) {
    if (typeof content !== "string" || !content.length) {
      throw new Error(`Conteúdo inválido calculado para ${relative}.`);
    }
  }

  for (const [relative, content] of Object.entries(outputs)) {
    backupAndWrite(relative, content, changed);
  }

  console.log(
    JSON.stringify({
      ok: true,
      stage: "4A.7A",
      changed,
      runtimeRootProductionWindows: "%LOCALAPPDATA%\\Nio-OS",
      developmentRoot: "process.cwd() unless NIO_OS_* is explicit",
      roamingUpgradeCompatibility: true,
      prismaDbPushRemovedFromBuildFlow: true,
      productLogicChanged: false,
      databaseChanged: false,
      schemaChanged: false,
      migrationRequired: false,
      desktopBuildRun: false,
      promotionPerformed: false
    })
  );
}

main();
