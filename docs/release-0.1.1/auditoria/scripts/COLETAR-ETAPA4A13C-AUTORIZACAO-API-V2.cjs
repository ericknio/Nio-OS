#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = process.cwd();
const apiRoot = path.join(root, "app", "api");
const output = path.join(root, "ETAPA4A13C_AUDITORIA_AUTORIZACAO_API.json");

const MAX_FILE_BYTES = 160 * 1024;

const AUTH_MARKERS = [
  "exigirPermissaoApi(",
  "exigirAdministradorApi(",
  "obterUsuarioLogado(",
  "usuarioTemPermissao(",
  "bootstrapDesktopValido(",
];

const PUBLIC_PATHS = new Set([
  "app/api/auth/login/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/auth/setup/route.ts",
  "app/api/local/health/route.ts",
]);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalize(p) {
  return p.replace(/\\/g, "/");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".next" ||
        entry.name === "release" ||
        entry.name === "backups"
      ) {
        continue;
      }

      walk(absolute, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name !== "route.ts") continue;

    const relative = normalize(path.relative(root, absolute));

    if (relative.includes(".bak-")) continue;

    out.push({ absolute, relative });
  }

  return out;
}

function extractMethods(content) {
  const methods = [];
  const regex =
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;

  for (const match of content.matchAll(regex)) {
    methods.push(match[1]);
  }

  return [...new Set(methods)];
}

function findMarkers(content) {
  return AUTH_MARKERS.filter((marker) => content.includes(marker));
}

function importedSecurityHelpers(content) {
  const helpers = [];

  for (const name of [
    "exigirPermissaoApi",
    "exigirAdministradorApi",
    "obterUsuarioLogado",
    "usuarioTemPermissao",
  ]) {
    if (content.includes(name)) helpers.push(name);
  }

  return [...new Set(helpers)];
}

function main() {
  if (!fs.existsSync(apiRoot)) {
    throw new Error("Pasta app/api não encontrada.");
  }

  const routes = walk(apiRoot)
    .sort((a, b) => a.relative.localeCompare(b.relative))
    .map(({ absolute, relative }) => {
      const stat = fs.statSync(absolute);

      if (stat.size > MAX_FILE_BYTES) {
        return {
          path: relative,
          sizeBytes: stat.size,
          skipped: "FILE_TOO_LARGE",
        };
      }

      const buffer = fs.readFileSync(absolute);
      const content = buffer.toString("utf8");
      const methods = extractMethods(content);
      const markers = findMarkers(content);
      const publicRoute = PUBLIC_PATHS.has(relative);
      const mutating = methods.some((method) =>
        ["POST", "PUT", "PATCH", "DELETE"].includes(method)
      );

      return {
        path: relative,
        sizeBytes: stat.size,
        sha256: sha256(buffer),
        methods,
        publicRoute,
        mutating,
        authMarkers: markers,
        importedSecurityHelpers: importedSecurityHelpers(content),
        hasServerSideAuthMarker: publicRoute || markers.length > 0,
        content,
      };
    });

  const suspicious = routes
    .filter((route) => !route.skipped)
    .filter((route) => !route.publicRoute && !route.hasServerSideAuthMarker)
    .map((route) => ({
      path: route.path,
      methods: route.methods,
      mutating: route.mutating,
    }));

  const mutatingWithoutAuthMarker = routes
    .filter((route) => !route.skipped)
    .filter(
      (route) =>
        route.mutating &&
        !route.publicRoute &&
        !route.hasServerSideAuthMarker
    )
    .map((route) => ({
      path: route.path,
      methods: route.methods,
    }));

  const report = {
    ok: true,
    stage: "4A.13C-AUDITORIA-AUTORIZACAO-API",
    generatedAt: new Date().toISOString(),
    safety: {
      readOnly: true,
      databaseRead: false,
      databaseChanged: false,
      envRead: false,
      runtimeConfigRead: false,
      buildExecuted: false,
      installerBuildExecuted: false,
    },
    summary: {
      routeFiles: routes.length,
      publicRoutes: routes.filter((route) => route.publicRoute).length,
      routesWithAuthMarker: routes.filter(
        (route) => !route.publicRoute && route.hasServerSideAuthMarker
      ).length,
      suspiciousRoutes: suspicious.length,
      mutatingWithoutAuthMarker: mutatingWithoutAuthMarker.length,
    },
    suspicious,
    mutatingWithoutAuthMarker,
    routes,
  };

  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      stage: report.stage,
      report: path.basename(output),
      ...report.summary,
      databaseChanged: false,
      buildExecuted: false,
    })
  );
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage: "4A.13C-AUDITORIA-AUTORIZACAO-API",
      message: error instanceof Error ? error.message : String(error),
      databaseChanged: false,
      buildExecuted: false,
    })
  );
  process.exit(1);
}
