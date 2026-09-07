const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const route = fs.readFileSync(
  path.join(root, "app", "api", "ordens", "[id]", "status", "route.ts"),
  "utf8",
);
let assertions = 0;
function check(value) { assert.equal(Boolean(value), true); assertions += 1; }

check(route.includes('if (statusSolicitado === OrderStatus.PRONTO)'));
check(route.includes("markServiceOrderReadyAndConsumeTechnicalParts("));
check(route.includes('request.headers.get("Idempotency-Key")'));
check(route.includes("requireIdempotencyKey"));
check(route.includes("usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario)"));
check(route.includes('application/json'));
check(route.includes('Object.keys(body).some((key) => !permitidos.has(key))'));
check(route.includes('expectedCurrentStatus: body.expectedCurrentStatus'));
check(route.includes('idempotencyKey,'));
check(route.includes('return respostaErroEstoque(error);'));

const prontoStart = route.indexOf('if (statusSolicitado === OrderStatus.PRONTO)');
const legacyStart = route.indexOf('const ordemExistente = await prisma.serviceOrder.findUnique');
check(prontoStart >= 0 && legacyStart > prontoStart);
const prontoBranch = route.slice(prontoStart, legacyStart);
check(!prontoBranch.includes('prisma.serviceOrder.update'));
check(!prontoBranch.includes('histories: {\n          create'));
check(route.includes('novoStatus === OrderStatus.PRONTO'));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
