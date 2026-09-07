#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const apiRoot = path.join(root, "app", "api");

const EXPLICIT_AUTH_CALLS = [
  "exigirPermissaoApi(",
  "exigirAdministradorApi(",
  "obterUsuarioLogado(",
  "exigirGerenciarUsuarios(",
];

const PUBLIC_HANDLERS = new Set([
  "app/api/auth/login/route.ts#POST",
  "app/api/auth/logout/route.ts#POST",
  "app/api/auth/me/route.ts#GET",
  "app/api/auth/setup/route.ts#GET",
  "app/api/local/health/route.ts#GET",
]);

const SESSION_ONLY_READS = new Set([
  "app/api/configuracoes/route.ts#GET",
  "app/api/produtos/upload/[arquivo]/route.ts#GET",
  "app/api/runtime/uploads/[...path]/route.ts#GET",
  "app/api/uploads/produtos/[arquivo]/route.ts#GET",
]);

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalize(value) {
  return value.replace(/\\/g, "/");
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function walk(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(absolute, output);
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      output.push({
        absolute,
        relative: normalize(path.relative(root, absolute)),
      });
    }
  }

  return output;
}

function exportedMethods(content) {
  const methods = [];
  const regex =
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;

  for (const match of content.matchAll(regex)) {
    methods.push({
      method: match[1],
      index: match.index ?? 0,
    });
  }

  return methods;
}

function findSignatureEnd(content, start) {
  const openParen = content.indexOf("(", start);
  if (openParen < 0) return -1;

  let depth = 0;
  let state = "code";
  let quote = "";

  for (let i = openParen; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1] || "";

    if (state === "line") {
      if (ch === "\n") state = "code";
      continue;
    }

    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        i++;
      }
      continue;
    }

    if (state === "string") {
      if (ch === "\\") {
        i++;
        continue;
      }

      if (ch === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      state = "line";
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      state = "block";
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      state = "string";
      quote = ch;
      continue;
    }

    if (ch === "(") {
      depth++;
      continue;
    }

    if (ch === ")") {
      depth--;
      if (depth === 0) {
        return content.indexOf("{", i + 1);
      }
    }
  }

  return -1;
}

function extractBody(content, start) {
  const bodyStart = findSignatureEnd(content, start);
  if (bodyStart < 0) return "";

  let depth = 0;
  let state = "code";
  let quote = "";

  for (let i = bodyStart; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1] || "";

    if (state === "line") {
      if (ch === "\n") state = "code";
      continue;
    }

    if (state === "block") {
      if (ch === "*" && next === "/") {
        state = "code";
        i++;
      }
      continue;
    }

    if (state === "string") {
      if (ch === "\\") {
        i++;
        continue;
      }

      if (ch === quote) {
        state = "code";
        quote = "";
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      state = "line";
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      state = "block";
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      state = "string";
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0) {
        return content.slice(bodyStart, i + 1);
      }
    }
  }

  return "";
}

function functionBody(content, functionName) {
  const patterns = [
    `async function ${functionName}(`,
    `function ${functionName}(`,
  ];

  for (const pattern of patterns) {
    const index = content.indexOf(pattern);
    if (index >= 0) return extractBody(content, index);
  }

  return "";
}

function validateBackupGuard(content, relative) {
  const handlerBodies = exportedMethods(content).map((item) => ({
    method: item.method,
    body: extractBody(content, item.index),
  }));

  const helperNames = [
    "exigirAcessoBackup",
    "exigirAcessoRestore",
    "exigirAcessoRestauracao",
  ];

  let helperBody = "";
  let helperName = "";

  for (const name of helperNames) {
    const body = functionBody(content, name);
    if (body) {
      helperBody = body;
      helperName = name;
      break;
    }
  }

  const fileHasPermission =
    content.includes('exigirPermissaoApi("configuracoes.editar")');
  const fileHasAdmin =
    content.includes("SystemUserRole.ADMIN");

  assert(
    fileHasPermission,
    `${relative} não exige configuracoes.editar.`
  );
  assert(
    fileHasAdmin,
    `${relative} não exige perfil ADMIN.`
  );

  if (helperBody) {
    assert(
      helperBody.includes('exigirPermissaoApi("configuracoes.editar")'),
      `${relative}: ${helperName} não exige configuracoes.editar.`
    );
    assert(
      helperBody.includes("SystemUserRole.ADMIN"),
      `${relative}: ${helperName} não exige ADMIN.`
    );

    for (const handler of handlerBodies) {
      if (!["GET", "POST"].includes(handler.method)) continue;

      assert(
        handler.body.includes(`${helperName}()`),
        `${relative}#${handler.method} não chama ${helperName}().`
      );
    }

    return {
      ok: true,
      mode: "HELPER",
      helper: helperName,
      permission: "configuracoes.editar",
      adminRequired: true,
    };
  }

  for (const handler of handlerBodies) {
    if (!["GET", "POST"].includes(handler.method)) continue;

    assert(
      handler.body.includes('exigirPermissaoApi("configuracoes.editar")'),
      `${relative}#${handler.method} não exige configuracoes.editar.`
    );
    assert(
      handler.body.includes("SystemUserRole.ADMIN"),
      `${relative}#${handler.method} não exige ADMIN explicitamente.`
    );
  }

  return {
    ok: true,
    mode: "INLINE",
    permission: "configuracoes.editar",
    adminRequired: true,
  };
}

function validateAssetRoutes(routeMap) {
  const legacy = routeMap.get("app/api/produtos/upload/[arquivo]/route.ts");
  const product = routeMap.get("app/api/uploads/produtos/[arquivo]/route.ts");
  const runtime = routeMap.get("app/api/runtime/uploads/[...path]/route.ts");

  assert(legacy, "Rota legada de imagem de produto ausente.");
  assert(product, "Rota atual de imagem de produto ausente.");
  assert(runtime, "Rota runtime de uploads ausente.");

  for (const [name, content] of [
    ["produto legado", legacy],
    ["produto atual", product],
  ]) {
    assert(
      content.includes("path.basename(") &&
        content.includes("caminhoUploadPublico("),
      `Leitura ${name} não mantém resolução segura de arquivo.`
    );
  }

  assert(
    runtime.includes("function partesSeguras(") &&
      runtime.includes("path.resolve(base") &&
      runtime.includes("baseResolvida + path.sep"),
    "Rota runtime de uploads não mantém contenção segura de caminho."
  );
}

function validateProxy() {
  const proxyFile = path.join(root, "proxy.ts");
  assert(fs.existsSync(proxyFile), "proxy.ts ausente.");

  const proxy = fs.readFileSync(proxyFile, "utf8");

  assert(
    proxy.includes('pathname === "/api/local/health"'),
    "Health precisa continuar sendo exceção pública explícita."
  );

  assert(
    proxy.includes('pathname.startsWith("/api") && apiEhPublica(pathname)'),
    "Proxy não mantém allowlist explícita das APIs públicas."
  );

  assert(
    proxy.includes('pathname.startsWith("/api")') &&
      proxy.includes("const autenticado = await tokenValido(token);"),
    "Proxy não mantém autenticação global das APIs não públicas."
  );

  assert(
    proxy.includes('pathname.startsWith("/uploads/anexos")') &&
      proxy.includes('"Arquivo protegido."'),
    "Proxy não mantém bloqueio público de anexos antigos."
  );
}

function main() {
  assert(fs.existsSync(apiRoot), "app/api não encontrada.");
  validateProxy();

  const routeFiles = walk(apiRoot).sort((a, b) =>
    a.relative.localeCompare(b.relative)
  );

  const routeMap = new Map();
  const handlers = [];
  const failures = [];

  for (const route of routeFiles) {
    const content = fs.readFileSync(route.absolute, "utf8");
    routeMap.set(route.relative, content);

    const isBackupRoute =
      route.relative === "app/api/backups/route.ts" ||
      route.relative === "app/api/backups/restaurar/route.ts";

    let backupGuard = null;

    if (isBackupRoute) {
      backupGuard = validateBackupGuard(content, route.relative);
    }

    for (const exported of exportedMethods(content)) {
      const body = extractBody(content, exported.index);
      const key = `${route.relative}#${exported.method}`;
      const mutating = MUTATING.has(exported.method);
      const explicitAuth = EXPLICIT_AUTH_CALLS.filter((call) =>
        body.includes(call)
      );

      let classification = "";

      if (isBackupRoute && backupGuard?.ok) {
        classification = "BACKUP_ADMIN_GUARDED";
      } else if (key === "app/api/auth/setup/route.ts#POST") {
        if (!body.includes("bootstrapDesktopValido(request)")) {
          failures.push({
            key,
            reason: "POST de primeiro acesso sem bootstrap desktop.",
          });
          classification = "UNCLASSIFIED";
        } else {
          classification = "PUBLIC_BOOTSTRAP_PROTECTED";
        }
      } else if (PUBLIC_HANDLERS.has(key)) {
        classification = "PUBLIC_INTENTIONAL";
      } else if (explicitAuth.length > 0) {
        classification = "EXPLICIT_SERVER_AUTH";
      } else if (!mutating && SESSION_ONLY_READS.has(key)) {
        classification = "SESSION_AUTH_VIA_PROXY_READ_ONLY";
      } else {
        failures.push({
          key,
          reason: mutating
            ? "Mutação sem autorização server-side explícita."
            : "Leitura não classificada sem autorização específica.",
        });
        classification = "UNCLASSIFIED";
      }

      handlers.push({
        key,
        method: exported.method,
        mutating,
        explicitAuth,
        classification,
      });
    }
  }

  validateAssetRoutes(routeMap);

  const userRoutes = [
    "app/api/usuarios-sistema/route.ts",
    "app/api/usuarios-sistema/[id]/route.ts",
    "app/api/usuarios-sistema/reaplicar-permissoes/route.ts",
  ];

  for (const route of userRoutes) {
    const content = routeMap.get(route);

    assert(content, `Rota de usuários ausente: ${route}`);
    assert(
      content.includes("exigirGerenciarUsuarios("),
      `Rota de usuários sem exigirGerenciarUsuarios: ${route}`
    );
    assert(
      content.includes("SystemUserRole.ADMIN"),
      `Rota de usuários sem validação ADMIN explícita: ${route}`
    );
  }

  const mutatingWithoutExplicitServerAuth = handlers.filter(
    (item) =>
      item.mutating &&
      ![
        "EXPLICIT_SERVER_AUTH",
        "PUBLIC_BOOTSTRAP_PROTECTED",
        "PUBLIC_INTENTIONAL",
        "BACKUP_ADMIN_GUARDED",
      ].includes(item.classification)
  );

  const report = {
    ok:
      failures.length === 0 &&
      mutatingWithoutExplicitServerAuth.length === 0,
    stage: "4A.13C.3-AUTORIZACAO-API-VALIDADA",
    routeFiles: routeFiles.length,
    handlers: handlers.length,
    explicitServerAuthHandlers: handlers.filter(
      (item) => item.classification === "EXPLICIT_SERVER_AUTH"
    ).length,
    backupAdminGuardedHandlers: handlers.filter(
      (item) => item.classification === "BACKUP_ADMIN_GUARDED"
    ).length,
    sessionOnlyReadHandlers: handlers.filter(
      (item) => item.classification === "SESSION_AUTH_VIA_PROXY_READ_ONLY"
    ).length,
    intentionalPublicHandlers: handlers.filter(
      (item) => item.classification === "PUBLIC_INTENTIONAL"
    ).length,
    bootstrapProtectedHandlers: handlers.filter(
      (item) => item.classification === "PUBLIC_BOOTSTRAP_PROTECTED"
    ).length,
    mutatingWithoutExplicitServerAuth:
      mutatingWithoutExplicitServerAuth.length,
    unclassifiedHandlers: handlers.filter(
      (item) => item.classification === "UNCLASSIFIED"
    ).length,
    backupPermissionAndAdminConfirmed: true,
    userManagementCoreGuardConfirmed: true,
    uploadPathContainmentConfirmed: true,
    proxyApiSessionGuardConfirmed: true,
    oldAttachmentPublicPathBlocked: true,
    failures,
    databaseChanged: false,
    schemaChanged: false,
    migrationExecuted: false,
    buildExecuted: false,
  };

  console.log(JSON.stringify(report));

  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.13C.3-AUTORIZACAO-API-VALIDADA",
      message:
        error instanceof Error ? error.message : String(error),
      databaseChanged: false,
      buildExecuted: false,
    })
  );
  process.exit(1);
}
