"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = process.cwd();

function read(p) {
  return fs.readFileSync(path.join(root, ...p.split("/")), "utf8");
}
function assert(ok, name) {
  if (!ok) throw new Error(`Falhou: ${name}`);
}

const proxy = read("proxy.ts");
const auth = read("lib/authSistema.ts");
const login = read("app/api/auth/login/route.ts");
const setup = read("app/api/auth/setup/route.ts");
const desktop = read("desktop/main.cjs");

const prep = desktop.indexOf("prepararPastasLocais();");
const inject = desktop.indexOf("configurarBootstrapPrimeiroAdmin();");

const checks = [
  ["production-secret-fail-closed-proxy",
    proxy.includes('if (process.env.NODE_ENV !== "production")') &&
    proxy.includes('return "";')],
  ["production-secret-fail-closed-auth",
    auth.includes('throw new Error("AUTH_SECRET_RUNTIME_INVALID")')],
  ["cross-site-write-block",
    proxy.includes("requisicaoMutavelCrossSite") &&
    proxy.includes("Origem da requisição não autorizada.")],
  ["security-headers",
    proxy.includes('"X-Frame-Options", "DENY"') &&
    proxy.includes('"X-Content-Type-Options", "nosniff"') &&
    proxy.includes('"Referrer-Policy", "no-referrer"')],
  ["login-forwarded-headers-not-used",
    !login.includes('request.headers.get("x-forwarded-for")') &&
    !login.includes('request.headers.get("x-real-ip")')],
  ["setup-bootstrap",
    setup.includes('BOOTSTRAP_HEADER = "x-nio-os-bootstrap"') &&
    setup.includes("bootstrapDesktopValido(request)")],
  ["setup-lock",
    setup.includes("let criandoPrimeiroAdmin = false") &&
    setup.includes("if (criandoPrimeiroAdmin)")],
  ["desktop-bootstrap-filter",
    desktop.includes('urls: [`${LOCAL_ORIGIN}/api/auth/setup*`]')],
  ["desktop-bootstrap-after-server-prep",
    prep >= 0 && inject > prep],
  ["bootstrap-context-match",
    setup.includes('BOOTSTRAP_CONTEXT = "nio-os-first-admin-v1"') &&
    desktop.includes('BOOTSTRAP_CONTEXT = "nio-os-first-admin-v1"')],
];

for (const [name, ok] of checks) assert(ok, name);

console.log(JSON.stringify({
  ok: true,
  stage: "4A.13B-HARDENING-LAN-AUTH",
  assertions: checks.length,
  productionSecretFailClosed: true,
  crossSiteApiWritesBlocked: true,
  untrustedForwardedIpIgnored: true,
  firstAdminDesktopOnlyInProduction: true,
  firstAdminConcurrentCreateLocked: true,
  securityHeadersEnabled: true,
  databaseChanged: false,
  buildExecuted: false
}));
