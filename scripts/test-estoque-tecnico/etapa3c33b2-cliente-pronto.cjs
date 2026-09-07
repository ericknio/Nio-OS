const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../../app/ordens/[id]/StatusRapidoOS.tsx");
const source = fs.readFileSync(file, "utf8");
let assertions = 0;
function check(value) { assert.equal(Boolean(value), true); assertions += 1; }

check(source.includes("globalThis.crypto?.randomUUID"));
check(source.includes("globalThis.crypto.randomUUID()"));
check(source.includes("useRef, useState"));
check(source.includes("const requestEmAndamentoRef = useRef(false)"));
check(source.includes("if (requestEmAndamentoRef.current) return"));
check(source.includes("requestEmAndamentoRef.current = true"));
check(source.includes("requestEmAndamentoRef.current = false"));
check(source.includes("AbortController"));
check(source.includes("controller.abort(), 30_000"));
check(source.includes("clearTimeout(timeoutId)"));
check(source.includes('error.name === "AbortError"'));
check(source.includes("A resposta demorou mais que o esperado. Tente novamente."));
check(source.includes("maxLength={120}"));
check(!source.includes("Math.random"));
check(source.includes('"Idempotency-Key": tentativa.key'));
check(source.includes('status: "PRONTO"'));
check(source.includes("expectedCurrentStatus: tentativa.expectedCurrentStatus"));
check(source.includes("confirmation: true"));
check(source.includes("technicianResponsible: tentativa.technicianResponsible"));
check(source.includes("tentativaPronto.expectedCurrentStatus === statusAtual"));
check(source.includes("tentativaPronto.technicianResponsible === tecnicoValidado"));
check(source.includes("setTentativaPronto(null)"));
check(source.includes("response.status !== 503"));
check(source.includes("response.status !== 408"));
check(source.includes("response.status === 409"));
check(source.includes("window.location.reload()"));
check(source.includes("setSalvando(true)"));
check(source.includes("disabled={salvando || !statusMudou}"));
check(source.includes("body: JSON.stringify({ status })") || source.includes(": { status },"));
check(!source.includes("localStorage"));
check(!source.includes("sessionStorage"));
check(!source.includes("console.log"));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\n");
