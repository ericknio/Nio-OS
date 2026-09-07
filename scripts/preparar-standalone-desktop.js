// scripts/preparar-standalone-desktop.js
// Nio-OS Desktop V11
// Sanitiza o standalone antes do Electron Builder e impede dados reais/artefatos de build no pacote.

const fs = require("fs");
const path = require("path");

const raiz = process.cwd();

function normalizar(caminho) {
  return caminho.replace(/\\/g, "/");
}

function relativo(caminho) {
  return normalizar(path.relative(raiz, caminho));
}

function deveIgnorar(origem) {
  const rel = relativo(origem);

  return (
    rel === "data" ||
    rel.startsWith("data/") ||
    rel === "backups" ||
    rel.startsWith("backups/") ||
    rel === "storage" ||
    rel.startsWith("storage/") ||
    rel === "public/uploads" ||
    rel.startsWith("public/uploads/")
  );
}

function garantirPasta(destino) {
  fs.mkdirSync(destino, { recursive: true });
}

function remover(caminho) {
  if (fs.existsSync(caminho)) {
    fs.rmSync(caminho, { recursive: true, force: true });
  }
}

function copiar(origem, destino) {
  if (!fs.existsSync(origem)) return false;
  if (deveIgnorar(origem)) return false;

  const stat = fs.statSync(origem);

  if (stat.isDirectory()) {
    garantirPasta(destino);

    for (const item of fs.readdirSync(origem)) {
      copiar(path.join(origem, item), path.join(destino, item));
    }

    return true;
  }

  garantirPasta(path.dirname(destino));
  fs.copyFileSync(origem, destino);
  return true;
}

function copiarLimpando(origem, destino) {
  if (!fs.existsSync(origem)) return false;
  remover(destino);
  return copiar(origem, destino);
}

function removerEnvRecursivo(base) {
  let removidos = 0;
  if (!fs.existsSync(base)) return removidos;

  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        pilha.push(completo);
        continue;
      }

      if (item.isFile() && /^\.env(?:\.|$)/i.test(item.name)) {
        fs.rmSync(completo, { force: true });
        removidos += 1;
      }
    }
  }

  return removidos;
}

function removerPublicUploadsRecursivo(base) {
  let removidos = 0;
  if (!fs.existsSync(base)) return removidos;

  const pilha = [base];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(base, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (!item.isDirectory()) continue;

      if (
        item.name.toLowerCase() === "uploads" &&
        relativoAtual === "public"
      ) {
        fs.rmSync(completo, { recursive: true, force: true });
        removidos += 1;
        continue;
      }

      pilha.push(completo);
    }
  }

  return removidos;
}

function limparArtefatosGerados(standalone) {
  const removidos = [];

  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os", "backups"]) {
    const alvo = path.join(standalone, nome);

    if (fs.existsSync(alvo)) {
      fs.rmSync(alvo, { recursive: true, force: true });
      removidos.push(nome);
    }
  }

  for (const item of fs.readdirSync(standalone, { withFileTypes: true })) {
    if (
      item.isDirectory() &&
      item.name.toLowerCase().startsWith("logs-build-")
    ) {
      fs.rmSync(path.join(standalone, item.name), {
        recursive: true,
        force: true,
      });
      removidos.push(item.name);
    }
  }

  return removidos;
}

function validarStandalone(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os", "backups"]) {
    if (fs.existsSync(path.join(standalone, nome))) {
      throw new Error("Artefato de build proibido no standalone: " + nome);
    }
  }

  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = normalizar(path.relative(standalone, atual));
    const dentroDoNextInterno =
      relativoAtual === ".next" || relativoAtual.startsWith(".next/");

    for (const item of fs.readdirSync(atual, { withFileTypes: true })) {
      const completo = path.join(atual, item.name);

      if (item.isSymbolicLink()) {
        throw new Error("Link simbólico recusado no standalone: " + completo);
      }

      if (item.isDirectory()) {
        const ehPublicUploadsEstatico =
          item.name.toLowerCase() === "uploads" &&
          relativoAtual === "public";

        if (ehPublicUploadsEstatico) {
          throw new Error("public/uploads encontrado no standalone: " + completo);
        }

        pilha.push(completo);
        continue;
      }

      if (/^\.env(?:\.|$)/i.test(item.name)) {
        throw new Error("Arquivo de ambiente encontrado no standalone: " + completo);
      }

      if (/^nio-os\.(?:db|sqlite|sqlite3)$/i.test(item.name)) {
        throw new Error("Banco de runtime encontrado no standalone: " + completo);
      }
    }
  }
}

function main() {
  const standalone = path.join(raiz, ".next", "standalone");

  if (!fs.existsSync(standalone)) {
    console.error("ERRO: .next/standalone nao encontrado.");
    console.error('Verifique output: "standalone" e rode npm run build.');
    process.exit(1);
  }

  const artefatosRemovidos = limparArtefatosGerados(standalone);
  const uploadsRemovidosAntes = removerPublicUploadsRecursivo(standalone);
  const envRemovidosAntes = removerEnvRecursivo(standalone);

  copiarLimpando(
    path.join(raiz, ".next", "static"),
    path.join(standalone, ".next", "static")
  );

  copiarLimpando(
    path.join(raiz, "public"),
    path.join(standalone, "public")
  );

  copiarLimpando(
    path.join(raiz, "prisma"),
    path.join(standalone, "prisma")
  );

  copiarLimpando(
    path.join(raiz, "node_modules", ".prisma"),
    path.join(standalone, "node_modules", ".prisma")
  );

  copiarLimpando(
    path.join(raiz, "node_modules", "@prisma", "client"),
    path.join(standalone, "node_modules", "@prisma", "client")
  );

  const uploadsRemovidosDepois = removerPublicUploadsRecursivo(standalone);
  const envRemovidosDepois = removerEnvRecursivo(standalone);

  validarStandalone(standalone);

  console.log("====================================");
  console.log(" Standalone desktop V11 preparado.");
  console.log("====================================");
  console.log("Dados reais ficam fora de Program Files.");
  console.log(
    "Artefatos de build removidos do standalone: " + artefatosRemovidos.length
  );
  console.log(
    "Pastas public/uploads removidas: " +
      (uploadsRemovidosAntes + uploadsRemovidosDepois)
  );
  console.log(
    "Arquivos de ambiente removidos: " +
      (envRemovidosAntes + envRemovidosDepois)
  );
}

main();

;/* NIO_OS_4A16F3_REMOVE_BAK_FROM_STANDALONE */
(() => {
  const __nioFs = require("node:fs");
  const __nioPath = require("node:path");
  const __nioRoot = __nioPath.resolve(process.cwd(), ".next", "standalone");
  let __nioRemoved = 0;

  function __nioWalk(dir) {
    if (!__nioFs.existsSync(dir)) return;

    for (const entry of __nioFs.readdirSync(dir, { withFileTypes: true })) {
      const full = __nioPath.join(dir, entry.name);

      if (entry.isDirectory()) {
        __nioWalk(full);
        continue;
      }

      if (entry.isFile() && /\.bak-[^/\\]+$/i.test(entry.name)) {
        __nioFs.rmSync(full, { force: true });
        __nioRemoved++;
      }
    }
  }

  __nioWalk(__nioRoot);
  console.log(`[desktop:prepare] backups .bak-* removidos do standalone: ${__nioRemoved}`);
})();

