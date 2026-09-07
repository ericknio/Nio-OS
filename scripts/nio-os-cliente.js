const fs = require("fs");
const os = require("os");
const http = require("http");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const raiz = process.cwd();
const pastaData = path.join(raiz, "data");
const configPath = path.join(pastaData, "cliente-servidor.json");
const portaPadrao = Number(process.env.PORT || 3000);
const timeoutMs = 350;
const concorrencia = 64;

function log(msg = "") {
  console.log(msg);
}

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (resposta) => {
    rl.close();
    resolve(String(resposta || "").trim());
  }));
}

function salvarConfig(url) {
  fs.mkdirSync(pastaData, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({ url, atualizadoEm: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

function lerConfig() {
  if (!fs.existsSync(configPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return typeof data.url === "string" ? data.url.trim() : null;
  } catch {
    return null;
  }
}

function testarUrl(url) {
  return new Promise((resolve) => {
    const endpoint = `${url.replace(/\/$/, "")}/api/local/health`;
    const req = http.get(endpoint, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          resolve(Boolean(json && json.ok && json.app === "NIO_OS_LOCAL"));
        } catch {
          resolve(false);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.on("error", () => resolve(false));
  });
}

function listarIpsParaBusca() {
  const interfaces = os.networkInterfaces();
  const bases = new Set();

  for (const itens of Object.values(interfaces)) {
    for (const item of itens || []) {
      if (item.family !== "IPv4" || item.internal) continue;

      const partes = item.address.split(".");
      if (partes.length !== 4) continue;

      bases.add(`${partes[0]}.${partes[1]}.${partes[2]}`);
    }
  }

  const ips = [];

  for (const base of bases) {
    for (let i = 1; i <= 254; i += 1) {
      ips.push(`${base}.${i}`);
    }
  }

  return ips;
}

async function descobrirServidor() {
  const ips = listarIpsParaBusca();

  if (ips.length === 0) return null;

  log(`Procurando servidor Nio-OS na rede (${ips.length} endereco(s))...`);

  let indice = 0;
  let encontrado = null;

  async function worker() {
    while (!encontrado && indice < ips.length) {
      const ip = ips[indice++];
      const url = `http://${ip}:${portaPadrao}`;

      if (await testarUrl(url)) {
        encontrado = url;
        return;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concorrencia, ips.length) }, () => worker());
  await Promise.all(workers);

  return encontrado;
}

function abrirJanela(url) {
  const script = path.join(raiz, "scripts", "abrir-janela-app.js");
  const resultado = spawnSync(process.execPath, [script, url], {
    stdio: "inherit",
    shell: false,
  });

  return resultado.status === 0;
}

async function main() {
  log("============================================");
  log(" Nio-OS - Cliente de rede");
  log("============================================");
  log("");
  log("Este modo nao cria banco, nao restaura backup e nao inicia servidor.");
  log("");

  const salvo = lerConfig();

  if (salvo) {
    log(`Testando servidor salvo: ${salvo}`);

    if (await testarUrl(salvo)) {
      log("Servidor salvo encontrado.");
      abrirJanela(salvo);
      return;
    }

    log("Servidor salvo nao respondeu. Procurando novamente...");
    log("");
  }

  const descoberto = await descobrirServidor();

  if (descoberto) {
    log("");
    log(`Servidor encontrado: ${descoberto}`);
    salvarConfig(descoberto);
    abrirJanela(descoberto);
    return;
  }

  log("");
  log("Nao encontrei automaticamente o servidor na rede.");
  log("Informe manualmente o IP ou o nome do computador servidor.");
  log("Exemplos: 192.168.1.50 ou SERVIDOR-NIO");
  log("");

  const host = await perguntar("Servidor: ");

  if (!host) {
    throw new Error("Servidor nao informado.");
  }

  const portaTexto = await perguntar(`Porta [${portaPadrao}]: `);
  const porta = portaTexto || String(portaPadrao);
  const url = host.startsWith("http://") || host.startsWith("https://")
    ? host
    : `http://${host}:${porta}`;

  if (!(await testarUrl(url))) {
    throw new Error(`Nao consegui conectar em ${url}`);
  }

  salvarConfig(url);
  abrirJanela(url);
}

main().catch((error) => {
  console.error("");
  console.error("ERRO AO CONECTAR:");
  console.error(error instanceof Error ? error.message : error);
  console.error("");
  process.exit(1);
});
