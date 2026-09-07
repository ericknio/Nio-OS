const fs = require("fs");
const path = require("path");

function existe(caminho) {
  return fs.existsSync(caminho);
}

function copiarDiretorio(origem, destino) {
  if (!existe(origem)) return false;
  fs.mkdirSync(destino, { recursive: true });
  fs.cpSync(origem, destino, { recursive: true, force: true });
  return true;
}

function copiarArquivo(origem, destino) {
  if (!existe(origem)) return false;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  return true;
}

function limparArtefatosProibidos(standalone) {
  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os", "backups"]) {
    const alvo = path.join(standalone, nome);
    if (existe(alvo)) {
      try {
        fs.rmSync(alvo, { recursive: true, force: true });
      } catch {
        // se falhar o fs.rmSync, a validação subsequente acusará
      }
    }
  }
}

function validarStandaloneRecursivo(standalone) {
  limparArtefatosProibidos(standalone);

  for (const nome of ["release", "dist-local", "_arquivo_morto_nio_os", "backups"]) {
    if (existe(path.join(standalone, nome))) {
      throw new Error("Artefato de build proibido no standalone: " + nome);
    }
  }

  const pilha = [standalone];

  while (pilha.length > 0) {
    const atual = pilha.pop();
    const relativoAtual = path
      .relative(standalone, atual)
      .replace(/\\/g, "/");
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
          throw new Error("public/uploads proibido no standalone: " + completo);
        }

        pilha.push(completo);
        continue;
      }

      if (/^\.env(?:\.|$)/i.test(item.name)) {
        try {
          fs.rmSync(completo, { force: true });
        } catch {}
        if (existe(completo)) {
          throw new Error("Arquivo de ambiente recusado no standalone: " + completo);
        }
        continue;
      }

      if (/^nio-os\.(?:db|sqlite|sqlite3)$/i.test(item.name)) {
        throw new Error("Banco de runtime recusado no standalone: " + completo);
      }
    }
  }
}

module.exports = async function afterPack(context) {
  const projeto = context.packager.projectDir;
  const appDir = path.join(context.appOutDir, "resources", "app");
  const standaloneDestino = path.join(appDir, ".next", "standalone");
  const standaloneOrigem = path.join(projeto, ".next", "standalone");

  validarStandaloneRecursivo(standaloneOrigem);

  copiarDiretorio(standaloneOrigem, standaloneDestino);
  copiarDiretorio(
    path.join(projeto, ".next", "static"),
    path.join(standaloneDestino, ".next", "static")
  );

  const scriptsDestino = path.join(standaloneDestino, "scripts");

  [
    "backup-api.js",
    "backup-core.js",
    "backup-local.js",
    "restore-local.js",
    "backup-auto.js",
  ].forEach((nome) => {
    copiarArquivo(
      path.join(projeto, "scripts", nome),
      path.join(scriptsDestino, nome)
    );
  });

  validarStandaloneRecursivo(standaloneDestino);

  const server = path.join(standaloneDestino, "server.js");

  if (!existe(server)) {
    throw new Error(
      "Standalone do Next não foi copiado para o pacote: " + server
    );
  }
};

;/* NIO_OS_4A16F3_REJECT_BAK_IN_APP_OUT */
(() => {
  const __nioOriginalAfterPack = module.exports;

  if (typeof __nioOriginalAfterPack !== "function") {
    throw new Error("[4A.16F.3] electron-afterpack-v11n.js deve exportar uma função.");
  }

  module.exports = async function __nioAfterPackBakGuard(context) {
    const result = await __nioOriginalAfterPack.apply(this, arguments);
    const __nioFs = require("node:fs");
    const __nioPath = require("node:path");
    const root = context && context.appOutDir
      ? __nioPath.resolve(context.appOutDir)
      : null;

    if (!root || !__nioFs.existsSync(root)) {
      throw new Error("[4A.16F.3] appOutDir ausente no afterPack.");
    }

    const found = [];

    function walk(dir) {
      for (const entry of __nioFs.readdirSync(dir, { withFileTypes: true })) {
        const full = __nioPath.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(full);
          continue;
        }

        if (entry.isFile() && /\.bak-[^/\\]+$/i.test(entry.name)) {
          found.push(full);
        }
      }
    }

    walk(root);

    if (found.length) {
      const relative = found
        .slice(0, 25)
        .map((file) => __nioPath.relative(root, file))
        .join(", ");

      throw new Error(
        `[4A.16F.3] empacotamento recusado: ${found.length} arquivo(s) .bak-* em appOutDir: ${relative}`
      );
    }

    return result;
  };
})();

