const fs = require("fs");
const path = require("path");

const raiz = process.cwd();
const pastaSaida = path.join(raiz, "dist-local");

function agoraFormatado() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join("-");
}

function deveIgnorar(nome) {
  return [
    "node_modules",
    ".next",
    ".git",
    ".turbo",
    ".vercel",
    "dist-local",
  ].includes(nome);
}

function copiarArquivo(relativo, destinoRaiz) {
  const origem = path.join(raiz, relativo);
  const destino = path.join(destinoRaiz, relativo);

  if (!fs.existsSync(origem)) return false;

  fs.mkdirSync(path.dirname(destino), {
    recursive: true,
  });

  fs.copyFileSync(origem, destino);
  return true;
}

function copiarPasta(relativo, destinoRaiz) {
  const origem = path.join(raiz, relativo);
  const destino = path.join(destinoRaiz, relativo);

  if (!fs.existsSync(origem)) return false;

  fs.cpSync(origem, destino, {
    recursive: true,
    force: true,
    filter: (caminho) => {
      const nome = path.basename(caminho);

      if (deveIgnorar(nome)) return false;
      if (nome.startsWith("uploads-antes-restore-")) return false;
      if (nome.startsWith("storage-antes-restore-")) return false;
      if (nome.endsWith(".tmp")) return false;

      return true;
    },
  });

  return true;
}

function criarPastasLocais(destinoRaiz) {
  const pastas = [
    "data",
    "backups",
    "storage/uploads/anexos",
    "public/uploads",
  ];

  for (const pasta of pastas) {
    fs.mkdirSync(path.join(destinoRaiz, pasta), {
      recursive: true,
    });
  }
}

function criarAvisoEnv(destinoRaiz) {
  const conteudo = [
    "IMPORTANTE",
    "",
    "O arquivo .env original nao foi copiado por seguranca.",
    "",
    "Este pacote usa SQLite local em data/nio-os.db.",
    "",
    "Computador servidor:",
    "1. Execute preparar-local.bat",
    "2. Escolha a opcao 1 para preparar o servidor",
    "3. Execute start-local.bat",
    "",
    "Outro computador da rede:",
    "1. Execute conectar-cliente.bat ou start-local.bat",
    "2. Escolha a opcao cliente",
    "3. Informe o IP e a porta do servidor",
    "",
    "Nao rode preparar-local.bat em modo servidor no computador cliente.",
    "",
  ].join("
");

  fs.writeFileSync(
    path.join(destinoRaiz, "LEIA-ANTES-DE-INSTALAR.txt"),
    conteudo,
    "utf8"
  );
}

function main() {
  console.log("====================================");
  console.log(" Nio-OS - Gerar pacote local");
  console.log("====================================");
  console.log("");

  fs.mkdirSync(pastaSaida, {
    recursive: true,
  });

  const nomePacote = `Nio-OS-Instalacao-${agoraFormatado()}`;
  const destinoPacote = path.join(pastaSaida, nomePacote);

  fs.rmSync(destinoPacote, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(destinoPacote, {
    recursive: true,
  });

  const arquivos = [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "proxy.ts",
    "start-local.bat",
    "preparar-local.bat",
    "criar-pacote-local.bat",
    "conectar-cliente.bat",
    ".env.example",
    "README-INSTALACAO-LOCAL.md",
  ];

  const pastas = [
    "app",
    "lib",
    "prisma",
    "public",
    "scripts",
  ];

  console.log("Copiando arquivos...");
  for (const arquivo of arquivos) {
    if (copiarArquivo(arquivo, destinoPacote)) {
      console.log(`OK  ${arquivo}`);
    }
  }

  console.log("");
  console.log("Copiando pastas...");
  for (const pasta of pastas) {
    if (copiarPasta(pasta, destinoPacote)) {
      console.log(`OK  ${pasta}`);
    }
  }

  criarPastasLocais(destinoPacote);
  criarAvisoEnv(destinoPacote);

  console.log("");
  console.log("====================================");
  console.log(" Pacote criado com sucesso!");
  console.log("====================================");
  console.log(destinoPacote);
  console.log("");
  console.log("Agora voce pode copiar essa pasta para outro computador.");
}

main();
