const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const raiz = process.env.NIO_OS_DATA_DIR || process.env.NIO_OS_RUNTIME_DIR || process.cwd();
const pastaBackups = path.join(raiz, "backups");
const pastaUploadsPublicos = path.join(raiz, "public", "uploads");
const pastaStorage = path.join(raiz, "storage");
const caminhoEnv = path.join(raiz, ".env");

function logPadrao(mensagem) {
  console.log(mensagem);
}

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

function garantirPasta(caminho) {
  fs.mkdirSync(caminho, { recursive: true });
}

function lerEnv() {
  if (!fs.existsSync(caminhoEnv)) {
    throw new Error("Arquivo .env não encontrado na raiz do projeto.");
  }

  return fs
    .readFileSync(caminhoEnv, "utf8")
    .split(/\r?\n/)
    .reduce((env, linha) => {
      const texto = linha.trim();

      if (!texto || texto.startsWith("#")) return env;

      const indice = texto.indexOf("=");

      if (indice === -1) return env;

      const chave = texto.slice(0, indice).trim();
      let valor = texto.slice(indice + 1).trim();

      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }

      env[chave] = valor;
      return env;
    }, {});
}

function obterDatabaseUrl() {
  const databaseUrl = lerEnv().DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL não encontrada no arquivo .env.");
  }

  return String(databaseUrl).trim();
}

function detectarBanco() {
  const databaseUrl = obterDatabaseUrl();

  if (
    databaseUrl.startsWith("postgresql://") ||
    databaseUrl.startsWith("postgres://")
  ) {
    return {
      tipo: "postgresql",
      url: limparDatabaseUrlPostgres(databaseUrl),
    };
  }

  if (databaseUrl.startsWith("file:")) {
    return {
      tipo: "sqlite",
      caminho: resolverCaminhoSqlite(databaseUrl),
    };
  }

  throw new Error(
    "DATABASE_URL não suportada para backup. Use PostgreSQL ou SQLite file:."
  );
}

function limparDatabaseUrlPostgres(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    url.search = "";
    return url.toString();
  } catch {
    return String(databaseUrl).split("?")[0];
  }
}

function resolverCaminhoSqlite(databaseUrl) {
  let caminho = String(databaseUrl).replace(/^file:/, "").split("?")[0];

  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    // mantém caminho original se não for URI encoded
  }

  if (!caminho) {
    throw new Error("Caminho SQLite inválido na DATABASE_URL.");
  }

  if (path.isAbsolute(caminho)) {
    return caminho;
  }

  // No Prisma, caminhos file:./dev.db são relativos à pasta prisma/.
  return path.resolve(raiz, "prisma", caminho);
}

function localizarBinarioPostgres(nome) {
  const candidatos = [
    nome,
    `C:\\Program Files\\PostgreSQL\\18\\bin\\${nome}.exe`,
    `C:\\Program Files\\PostgreSQL\\17\\bin\\${nome}.exe`,
    `C:\\Program Files\\PostgreSQL\\16\\bin\\${nome}.exe`,
    `C:\\Program Files\\PostgreSQL\\15\\bin\\${nome}.exe`,
    `C:\\Program Files\\PostgreSQL\\14\\bin\\${nome}.exe`,
  ];

  for (const caminho of candidatos) {
    if (caminho === nome) {
      const teste = spawnSync(nome, ["--version"], {
        stdio: "ignore",
        shell: false,
      });

      if (!teste.error && teste.status === 0) return nome;
      continue;
    }

    if (fs.existsSync(caminho)) return caminho;
  }

  return null;
}

function executarBinario(nome, argumentos, logger = logPadrao) {
  const binario = localizarBinarioPostgres(nome);

  if (!binario) {
    throw new Error(
      [
        `Não foi possível encontrar o ${nome}.`,
        "",
        "Verifique se o PostgreSQL está instalado.",
        "Pastas esperadas:",
        `C:\\Program Files\\PostgreSQL\\18\\bin\\${nome}.exe`,
        `C:\\Program Files\\PostgreSQL\\17\\bin\\${nome}.exe`,
        `C:\\Program Files\\PostgreSQL\\16\\bin\\${nome}.exe`,
      ].join("\n")
    );
  }

  logger(`Usando ${nome} em: ${binario}`);

  const resultado = spawnSync(binario, argumentos, {
    encoding: "utf8",
    shell: false,
  });

  if (resultado.stdout) logger(resultado.stdout.trim());
  if (resultado.stderr) logger(resultado.stderr.trim());

  if (resultado.error) {
    throw new Error(`Não foi possível executar o ${nome} em: ${binario}`);
  }

  if (resultado.status !== 0) {
    throw new Error(`${nome} falhou. Verifique a mensagem acima.`);
  }
}

function copiarPastaSeExistir(origem, destino, logger = logPadrao, nome = "pasta") {
  if (!fs.existsSync(origem)) {
    logger(`${nome} não encontrada. Pulando.`);
    return false;
  }

  fs.cpSync(origem, destino, {
    recursive: true,
    force: true,
    filter: (caminho) => {
      const nomeArquivo = path.basename(caminho);

      if (nomeArquivo.endsWith(".tmp")) return false;
      if (nomeArquivo.startsWith(".~")) return false;
      if (nomeArquivo.startsWith("uploads-antes-restore-")) return false;
      if (nomeArquivo.startsWith("storage-antes-restore-")) return false;

      return true;
    },
  });

  return true;
}

function copiarBancoSqlite(caminhoBanco, destinoBanco, logger = logPadrao) {
  if (!fs.existsSync(caminhoBanco)) {
    throw new Error(`Banco SQLite não encontrado em: ${caminhoBanco}`);
  }

  logger(`Banco SQLite: ${caminhoBanco}`);

  fs.copyFileSync(caminhoBanco, destinoBanco);

  for (const sufixo of ["-wal", "-shm"]) {
    const auxiliar = `${caminhoBanco}${sufixo}`;

    if (fs.existsSync(auxiliar)) {
      fs.copyFileSync(auxiliar, `${destinoBanco}${sufixo}`);
    }
  }
}

function salvarInfoBackup(pastaBackup, info) {
  fs.writeFileSync(
    path.join(pastaBackup, "backup-info.json"),
    JSON.stringify(
      {
        sistema: "Nio-OS",
        criadoEm: new Date().toISOString(),
        ...info,
        observacao:
          "Este backup inclui banco e pastas de arquivos locais quando existirem. O arquivo .env não é copiado por segurança.",
      },
      null,
      2
    ),
    "utf8"
  );
}

function listarBackups() {
  if (!fs.existsSync(pastaBackups)) return [];

  return fs
    .readdirSync(pastaBackups, { withFileTypes: true })
    .filter((item) => item.isDirectory() && !item.name.startsWith("."))
    .map((item) => {
      const caminho = path.join(pastaBackups, item.name);
      const bancoPostgres = path.join(caminho, "banco.sql");
      const bancoSqlite = path.join(caminho, "banco.sqlite");
      const uploads = path.join(caminho, "uploads");
      const storage = path.join(caminho, "storage");
      const infoPath = path.join(caminho, "backup-info.json");
      const stat = fs.statSync(caminho);

      let info = null;

      if (fs.existsSync(infoPath)) {
        try {
          info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
        } catch {
          info = null;
        }
      }

      const temBancoPostgres = fs.existsSync(bancoPostgres);
      const temBancoSqlite = fs.existsSync(bancoSqlite);

      return {
        nome: item.name,
        caminho,
        banco: temBancoSqlite ? bancoSqlite : bancoPostgres,
        bancoPostgres,
        bancoSqlite,
        tipoBanco: temBancoSqlite ? "sqlite" : "postgresql",
        temBanco: temBancoPostgres || temBancoSqlite,
        temUploads: fs.existsSync(uploads),
        temStorage: fs.existsSync(storage),
        criadoEm: info?.criadoEm || stat.mtime.toISOString(),
        criadoEmMs: stat.mtimeMs,
      };
    })
    .filter((backup) => backup.temBanco)
    .sort((a, b) => b.criadoEmMs - a.criadoEmMs);
}

function backupMaisRecente() {
  const backups = listarBackups();

  if (backups.length === 0) {
    throw new Error("Nenhum backup válido encontrado na pasta backups.");
  }

  return backups[0];
}

function criarBackup({ logger = logPadrao } = {}) {
  garantirPasta(pastaBackups);

  const banco = detectarBanco();
  const nome = `backup-${agoraFormatado()}`;
  const pastaFinal = path.join(pastaBackups, nome);
  const pastaTemp = path.join(pastaBackups, `.${nome}.tmp`);

  if (fs.existsSync(pastaTemp)) {
    fs.rmSync(pastaTemp, {
      recursive: true,
      force: true,
    });
  }

  garantirPasta(pastaTemp);

  try {
    logger(`Criando backup em: ${pastaFinal}`);
    logger("");
    logger(`1/4 Backup do banco ${banco.tipo.toUpperCase()}...`);

    if (banco.tipo === "postgresql") {
      executarBinario(
        "pg_dump",
        [
          `--dbname=${banco.url}`,
          "--clean",
          "--if-exists",
          "--no-owner",
          "--no-privileges",
          "--format=plain",
          `--file=${path.join(pastaTemp, "banco.sql")}`,
        ],
        logger
      );
    } else {
      copiarBancoSqlite(banco.caminho, path.join(pastaTemp, "banco.sqlite"), logger);
    }

    logger("");
    logger("2/4 Copiando public/uploads...");
    const incluiUploads = copiarPastaSeExistir(
      pastaUploadsPublicos,
      path.join(pastaTemp, "uploads"),
      logger,
      "Pasta public/uploads"
    );

    logger("");
    logger("3/4 Copiando storage...");
    const incluiStorage = copiarPastaSeExistir(
      pastaStorage,
      path.join(pastaTemp, "storage"),
      logger,
      "Pasta storage"
    );

    logger("");
    logger("4/4 Salvando informações do backup...");
    salvarInfoBackup(pastaTemp, {
      banco: {
        tipo: banco.tipo,
      },
      inclui: {
        uploadsPublicos: incluiUploads,
        storage: incluiStorage,
      },
    });

    fs.renameSync(pastaTemp, pastaFinal);

    return {
      nome,
      caminho: pastaFinal,
      banco: path.join(
        pastaFinal,
        banco.tipo === "sqlite" ? "banco.sqlite" : "banco.sql"
      ),
      tipoBanco: banco.tipo,
      temUploads: incluiUploads,
      temStorage: incluiStorage,
    };
  } catch (error) {
    fs.rmSync(pastaTemp, {
      recursive: true,
      force: true,
    });

    throw error;
  }
}

function preservarPastaAtual(caminho, prefixo, logger = logPadrao) {
  if (!fs.existsSync(caminho)) return null;

  const pastaPai = path.dirname(caminho);
  const destino = path.join(pastaPai, `${prefixo}-antes-restore-${agoraFormatado()}`);

  fs.renameSync(caminho, destino);
  logger(`Pasta atual preservada em: ${destino}`);

  return destino;
}

function restaurarUploadsPublicos(pastaBackup, logger = logPadrao) {
  const uploadsBackup = path.join(pastaBackup, "uploads");

  if (!fs.existsSync(uploadsBackup)) {
    logger("Backup não possui public/uploads. Pulando uploads públicos.");
    return null;
  }

  garantirPasta(path.dirname(pastaUploadsPublicos));
  const uploadsAntigos = preservarPastaAtual(
    pastaUploadsPublicos,
    "uploads",
    logger
  );

  fs.cpSync(uploadsBackup, pastaUploadsPublicos, {
    recursive: true,
    force: true,
  });

  return uploadsAntigos;
}

function restaurarStorage(pastaBackup, logger = logPadrao) {
  const storageBackup = path.join(pastaBackup, "storage");

  if (!fs.existsSync(storageBackup)) {
    logger("Backup não possui storage. Pulando arquivos protegidos.");
    return null;
  }

  const storageAntigo = preservarPastaAtual(pastaStorage, "storage", logger);

  fs.cpSync(storageBackup, pastaStorage, {
    recursive: true,
    force: true,
  });

  return storageAntigo;
}

function restaurarBancoSqlite(backup, logger = logPadrao) {
  const bancoAtual = detectarBanco();

  if (bancoAtual.tipo !== "sqlite") {
    throw new Error(
      "O backup é SQLite, mas a DATABASE_URL atual não aponta para SQLite."
    );
  }

  garantirPasta(path.dirname(bancoAtual.caminho));

  if (fs.existsSync(bancoAtual.caminho)) {
    const preservado = `${bancoAtual.caminho}.antes-restore-${agoraFormatado()}`;
    fs.renameSync(bancoAtual.caminho, preservado);
    logger(`Banco SQLite atual preservado em: ${preservado}`);
  }

  for (const sufixo of ["-wal", "-shm"]) {
    const auxiliarAtual = `${bancoAtual.caminho}${sufixo}`;
    if (fs.existsSync(auxiliarAtual)) fs.rmSync(auxiliarAtual, { force: true });
  }

  fs.copyFileSync(backup.bancoSqlite, bancoAtual.caminho);

  for (const sufixo of ["-wal", "-shm"]) {
    const auxiliarBackup = `${backup.bancoSqlite}${sufixo}`;
    if (fs.existsSync(auxiliarBackup)) {
      fs.copyFileSync(auxiliarBackup, `${bancoAtual.caminho}${sufixo}`);
    }
  }
}

function restaurarBackupMaisRecente({ logger = logPadrao } = {}) {
  const backup = backupMaisRecente();

  logger(`Restaurando backup: ${backup.caminho}`);
  logger("");
  logger(`1/3 Restaurando banco ${backup.tipoBanco.toUpperCase()}...`);

  if (backup.tipoBanco === "sqlite") {
    restaurarBancoSqlite(backup, logger);
  } else {
    const bancoAtual = detectarBanco();

    if (bancoAtual.tipo !== "postgresql") {
      throw new Error(
        "O backup é PostgreSQL, mas a DATABASE_URL atual não aponta para PostgreSQL."
      );
    }

    executarBinario(
      "psql",
      [`--dbname=${bancoAtual.url}`, "--file", backup.bancoPostgres],
      logger
    );
  }

  logger("");
  logger("2/3 Restaurando public/uploads...");
  const uploadsAntigos = restaurarUploadsPublicos(backup.caminho, logger);

  logger("");
  logger("3/3 Restaurando storage...");
  const storageAntigo = restaurarStorage(backup.caminho, logger);

  return {
    backup,
    uploadsAntigos,
    storageAntigo,
  };
}

module.exports = {
  criarBackup,
  listarBackups,
  backupMaisRecente,
  restaurarBackupMaisRecente,
};
