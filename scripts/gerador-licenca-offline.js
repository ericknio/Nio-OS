"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const {
  LICENSE_SCHEMA,
  PRODUCT,
  KEY_ID,
  signedEnvelopeBytes,
  base64urlEncode,
} = require("../desktop/license-core.cjs");

function todayLocalDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { cliente: "", meses: 1, inst: "", fing: "" };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--cliente" && args[i + 1]) result.cliente = args[++i];
    else if (args[i] === "--meses" && args[i + 1]) result.meses = parseInt(args[++i], 10);
    else if (args[i] === "--inst" && args[i + 1]) result.inst = args[++i];
    else if (args[i] === "--fing" && args[i + 1]) result.fing = args[++i];
  }
  return result;
}

async function main() {
  const args = parseArgs();

  let privateKeyPath = path.join(
    os.homedir(),
    "Nio-License-Keys",
    "Nio-OS",
    "nio-os-license-private.ed25519.pem"
  );

  if (!fs.existsSync(privateKeyPath)) {
    const execDir = path.dirname(process.execPath);
    const cwdDir = process.cwd();
    const localKeyExec = path.join(execDir, "nio-os-license-private.ed25519.pem");
    const localKeyCwd = path.join(cwdDir, "nio-os-license-private.ed25519.pem");
    
    if (fs.existsSync(localKeyExec)) {
      privateKeyPath = localKeyExec;
    } else if (fs.existsSync(localKeyCwd)) {
      privateKeyPath = localKeyCwd;
    } else {
      console.log(JSON.stringify({ ok: false, error: `Chave privada não encontrada no PC nem junto ao executável.` }));
      process.exit(0);
    }
  }

  if (!args.cliente) {
    console.log(JSON.stringify({ ok: false, error: "Nome do cliente é obrigatório." }));
    process.exit(0);
  }

  if (![1, 6, 12].includes(args.meses)) {
    console.log(JSON.stringify({ ok: false, error: "Duração inválida. Escolha 1, 6 ou 12." }));
    process.exit(0);
  }

  const now = new Date();
  const issuedOn = todayLocalDate(now);
  const expiresOn = todayLocalDate(addMonths(now, args.meses));
  
  // Gera um License ID aleatório
  const licenseId = "NIO-" + crypto.randomBytes(8).toString("hex").toUpperCase();

  const payload = {
    product: PRODUCT,
    licenseId,
    clientName: args.cliente,
    installationId: args.inst || "",
    machineFingerprint: args.fing || "",
    issuedOn,
    expiresOn,
    plan: "PRO",
    features: {},
  };

  const envelope = {
    schema: LICENSE_SCHEMA,
    keyId: KEY_ID,
    payload,
  };

  const privateKeyPem = fs.readFileSync(privateKeyPath, "utf8");
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  const envelopeBytes = signedEnvelopeBytes(envelope);
  const signatureBuffer = crypto.sign(null, envelopeBytes, privateKey);
  const signature = base64urlEncode(signatureBuffer);

  const finalLicense = {
    ...envelope,
    signature,
  };

  const outFileName = `license-${args.cliente.replace(/[^a-z0-9]/gi, "_").toLowerCase()}-${licenseId}.nio`;
  // Salva no Desktop para o admin localizar facilmente
  const outPath = path.join(os.homedir(), "Desktop", outFileName);

  fs.writeFileSync(outPath, JSON.stringify(finalLicense, null, 2), "utf8");

  console.log(JSON.stringify({ 
    ok: true, 
    file: outPath, 
    licenseId, 
    issuedOn, 
    expiresOn, 
    meses: args.meses 
  }));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }));
  process.exit(0);
});
