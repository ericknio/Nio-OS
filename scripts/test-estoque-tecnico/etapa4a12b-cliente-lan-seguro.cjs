"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");
}

function assert(ok, name) {
  if (!ok) throw new Error(`Falhou: ${name}`);
}

const main = read("desktop/main.cjs");
const preload = read("desktop/preload.cjs");
const health = read("app/api/local/health/route.ts");
const selector = read("desktop/seletor.html");

const checks = [
  ["client-http-only", main.includes('if (url.protocol !== "http:") return "";')],
  ["client-private-ip", main.includes("!ipv4Privado(url.hostname)")],
  ["client-fixed-port", main.includes('(url.port || String(PORTA)) !== String(PORTA)')],
  ["client-no-path-query", main.includes('url.pathname !== "/" || url.search || url.hash')],
  ["exact-health-service", main.includes('payload?.service === "nio-os-local-server"')],
  ["exact-health-protocol", main.includes("payload?.protocolVersion === 1")],
  ["identity-pinning", main.includes("SERVER_IDENTITY_MISMATCH") && main.includes("lastServerIdentity")],
  ["scan-private-only", main.includes("!ipv4Privado(item.address)")],
  ["preload-file-only", preload.includes('globalThis.location?.protocol !== "file:"')],
  ["preload-selector-only", preload.includes('endsWith("/seletor.html")')],
  ["ipc-origin-check", main.includes("function exigirIpcDoSeletor(event)")],
  ["startup-config-migration", main.includes("migrarConfigRoamingLegada();")],
  ["full-data-migration-still-server-path", main.includes("function prepararPastasLocais() {") && main.includes("migrarDadosRoamingLegados();")],
  ["external-protocol-allowlist", main.includes('["http:", "https:"].includes(protocolo)')],
  ["health-hmac", health.includes('createHmac("sha256", secret)')],
  ["health-identity-context", health.includes('IDENTITY_CONTEXT = "nio-os-server-identity-v1"')],
  ["selector-private-ip-example", selector.includes('placeholder="Servidor manual: 192.168.1.6:3000"')],
  ["legacy-startup-no-full-migration", !main.includes('if (!instanceLock) return;\n  migrarDadosRoamingLegados();\n  criarJanelaPrincipal();')],
];

for (const [name, ok] of checks) assert(ok, name);

console.log(JSON.stringify({
  ok: true,
  stage: "4A.12B-CLIENTE-LAN-SEGURO",
  assertions: checks.length,
  arbitraryExternalServerBlocked: true,
  exactHealthRequired: true,
  serverIdentityPinned: true,
  remotePreloadBridgeBlocked: true,
  ipcRestrictedToSelector: true,
  clientStartupDatabaseMigrationBlocked: true,
  databaseChanged: false,
  buildExecuted: false
}));
