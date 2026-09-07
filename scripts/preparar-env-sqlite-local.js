const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const raiz = process.cwd();
const envPath = path.join(raiz, ".env");
const envExamplePath = path.join(raiz, ".env.example");

const pastas = [
  "data",
  "backups",
  "public/uploads",
  "storage/uploads/anexos",
];

function garantirPasta(relativo) {
  fs.mkdirSync(path.join(raiz, relativo), { recursive: true });
}

function lerArquivoSeExistir(caminho) {
  return fs.existsSync(caminho) ? fs.readFileSync(caminho, "utf8") : "";
}

function atualizarEnv(conteudo, chave, valor) {
  const linha = `${chave}=${valor}`;
  const regex = new RegExp(`^${chave}=.*$`, "m");

  if (regex.test(conteudo)) {
    return conteudo.replace(regex, linha);
  }

  const quebra = conteudo.trim() ? "\r\n" : "";
  return `${conteudo.replace(/\s*$/, "")}${quebra}${linha}\r\n`;
}

function valorEnv(conteudo, chave) {
  const regex = new RegExp(`^${chave}=(.*)$`, "m");
  const match = regex.exec(conteudo);

  if (!match) return "";

  return match[1].trim().replace(/^["']|["']$/g, "");
}

function main() {
  for (const pasta of pastas) {
    garantirPasta(pasta);
  }

  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log("Arquivo .env criado a partir do .env.example.");
    } else {
      fs.writeFileSync(envPath, "", "utf8");
      console.log("Arquivo .env criado.");
    }
  }

  let env = lerArquivoSeExistir(envPath);

  const raizRuntime = raiz.replace(/\\/g, "/");

  env = atualizarEnv(env, "DATABASE_URL", '"file:../data/nio-os.db"');
  env = atualizarEnv(env, "NIO_OS_DATA_DIR", `"${raizRuntime}"`);
  env = atualizarEnv(env, "NIO_OS_RUNTIME_DIR", `"${raizRuntime}"`);
  env = atualizarEnv(env, "NODE_ENV", '"production"');
  env = atualizarEnv(env, "NEXT_TELEMETRY_DISABLED", '"1"');

  if (!valorEnv(env, "PORT")) {
    env = atualizarEnv(env, "PORT", '"3000"');
  }

  const secretAtual = valorEnv(env, "AUTH_SECRET");

  if (!secretAtual || secretAtual.includes("troque-essa-chave")) {
    const secret = crypto.randomBytes(48).toString("hex");
    env = atualizarEnv(env, "AUTH_SECRET", `"${secret}"`);
    console.log("AUTH_SECRET local gerado automaticamente.");
  }

  fs.writeFileSync(envPath, env, "utf8");

  console.log("Ambiente SQLite local configurado.");
  console.log("Banco: data/nio-os.db");
}

main();
