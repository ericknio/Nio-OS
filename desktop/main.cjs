// desktop/main.cjs
// Nio-OS Desktop V11
// - Janela propria Electron.
// - Modo servidor/cliente salvo.
// - PDFs/recibos/rotas internas dentro do Electron.
// - Build empacotado via Next standalone + electron-builder.
// - Dados reais em %LOCALAPPDATA%\Nio-OS, fora de Program Files.

const {
  app, BrowserWindow, ipcMain, shell, Menu, dialog, session, clipboard,
  safeStorage: nioCloudSafeStorageV1
} = require("electron");
// CLOUD_TOKEN_STORE_ELECTRON_V1
const { createCloudTokenStore: createNioCloudTokenStoreV1 } = require("./cloud-token-store-v1.cjs");

function criarNioCloudTokenStoreV1(userDataDir) {
  return createNioCloudTokenStoreV1({
    safeStorage: nioCloudSafeStorageV1,
    userDataDir
  });
}
// FIM CLOUD_TOKEN_STORE_ELECTRON_V1

// CLOUD_ACTIVATION_RUNTIME_IMPORTS_V1
const { createCloudClient: createNioCloudClientV1 } = require("./cloud-client-v1.cjs");
const { createCloudActivationBridge: createNioCloudActivationBridgeV1 } = require("./cloud-activation-bridge-v1.cjs");
const { resolveCloudConfig: resolveNioCloudConfigV1 } = require("./cloud-config-v1.cjs");
// FIM CLOUD_ACTIVATION_RUNTIME_IMPORTS_V1

const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawn } = require("child_process");

const APP_NAME = "Nio-OS | Ordem de Serviço";
const PORTA = Number(process.env.PORT || 3000);
const LOCAL_ORIGIN = `http://127.0.0.1:${PORTA}`;
const FIREWALL_RULE_NAME = "Nio-OS-LAN-TCP-3000";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SELECTOR_HTML = path.join(__dirname, "seletor.html");
const PRELOAD = path.join(__dirname, "preload.cjs");

let mainWindow = null;
let serverProcess = null;
let iniciandoServidor = false;
let servidorAtual = LOCAL_ORIGIN;
let autoIniciado = false;
let bootstrapHeaderConfigurado = false;
const instanceLock = app.requestSingleInstanceLock();

const BOOTSTRAP_HEADER = "x-nio-os-bootstrap";
const BOOTSTRAP_CONTEXT = "nio-os-first-admin-v1";

if (!instanceLock) {
  app.quit();
}

const internalOrigins = new Set([
  `http://127.0.0.1:${PORTA}`,
  `http://localhost:${PORTA}`,
  `http://0.0.0.0:${PORTA}`,
]);

try {
  app.setName("Nio-OS");

  if (process.platform === "win32") {
    app.setPath("userData", path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "Nio-OS"));
  }
} catch (error) {
  console.error("Nao foi possivel definir userData do Nio-OS:", error);
}

function appDataPath(...partes) {
  return path.join(app.getPath("userData"), ...partes);
}

function caminhoRaizRoamingLegada() {
  if (process.platform !== "win32" || !process.env.APPDATA) return "";
  return path.join(process.env.APPDATA, "Nio-OS");
}

function caminhoRoamingLegado(...partes) {
  const raiz = caminhoRaizRoamingLegada();
  return raiz ? path.join(raiz, ...partes) : "";
}

function configPath() {
  return appDataPath("nio-os-desktop-config.json");
}

function logPath() {
  return appDataPath("nio-os-desktop.log");
}

function log(...partes) {
  const linha = `[${new Date().toISOString()}] ${partes
    .map((parte) =>
      typeof parte === "string" ? parte : JSON.stringify(parte, null, 2)
    )
    .join(" ")}\n`;

  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.appendFileSync(logPath(), linha, "utf8");
  } catch {}

  console.log(...partes);
}

async function abrirArquivoLogTecnico() {
  const arquivo = logPath();

  try {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    if (!fs.existsSync(arquivo)) {
      fs.writeFileSync(arquivo, "", "utf8");
    }

    await shell.openPath(arquivo);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

function escaparPowerShellLiteral(valor) {
  return String(valor).replace(/'/g, "''");
}

function executarPowerShell(script) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        encoded,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    let encerrado = false;

    child.stdout.on("data", (data) => {
      if (stdout.length < 8192) stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      if (stderr.length < 8192) stderr += data.toString();
    });

    child.on("error", (error) => {
      if (encerrado) return;
      encerrado = true;
      resolve({ ok: false, code: -1, stdout, stderr, error: String(error) });
    });

    child.on("close", (code) => {
      if (encerrado) return;
      encerrado = true;
      resolve({
        ok: code === 0,
        code: Number.isInteger(code) ? code : -1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

// FIREWALL_POWERSHELL_HELPER_V1
function caminhoFirewallHelper() {
  return path.join(__dirname, "firewall-helper.ps1");
}

function executarFirewallHelper(modo, elevado = false) {
  const helper = caminhoFirewallHelper();
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-WindowStyle",
    "Hidden",
    "-File",
    helper,
    "-Mode",
    modo,
    "-Exe",
    process.execPath,
    "-Port",
    String(PORTA),
    "-RuleName",
    FIREWALL_RULE_NAME,
  ];

  if (!elevado) {
    return new Promise((resolve) => {
      const child = spawn("powershell.exe", args, {
        windowsHide: true,
        stdio: "ignore",
      });

      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  const psLiteral = (value) => String(value).replace(/'/g, "''");
  const elevatedScript = [
    "$ErrorActionPreference = 'Stop'",
    "& '" +
      psLiteral(helper) +
      "' -Mode '" +
      psLiteral(modo) +
      "' -Exe '" +
      psLiteral(process.execPath) +
      "' -Port " +
      String(PORTA) +
      " -RuleName '" +
      psLiteral(FIREWALL_RULE_NAME) +
      "'",
    "exit $LASTEXITCODE",
  ].join("; ");

  const encoded = Buffer.from(elevatedScript, "utf16le").toString("base64");
  const bootstrap = [
    "$ErrorActionPreference = 'Stop'",
    "$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand','" +
      encoded +
      "')",
    "exit $p.ExitCode",
  ].join("; ");

  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        bootstrap,
      ],
      { windowsHide: true, stdio: "ignore" }
    );

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function garantirFirewallLanServidor() {
  if (process.platform !== "win32" || !app.isPackaged) return true;

  if (!Number.isInteger(PORTA) || PORTA < 1 || PORTA > 65535) {
    log("Firewall LAN nao configurado: porta invalida.", PORTA);
    return false;
  }

  if (await executarFirewallHelper("Verify")) {
    log("Firewall LAN do servidor validado.");
    return true;
  }

  enviarStatus("Configurando acesso seguro do Nio-OS na rede local...", "info");

  if (!(await executarFirewallHelper("Repair", true))) {
    log("Firewall LAN nao foi configurado.");
    return false;
  }

  const ok = await executarFirewallHelper("Verify");
  log(
    ok
      ? "Firewall LAN do servidor configurado e validado."
      : "Firewall LAN continua invalido apos a configuracao."
  );

  return ok;
}

function lerConfig() {
  try {
    const arquivo = configPath();
    if (!fs.existsSync(arquivo)) return {};
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return {};
  }
}

function salvarConfig(parcial) {
  const atual = lerConfig();
  const novo = {
    ...atual,
    ...parcial,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(novo, null, 2), "utf8");
  } catch (error) {
    log("Erro ao salvar configuracao:", String(error));
  }

  return novo;
}

function obterAuthSecretLocal() {
  const atual = lerConfig();

  if (atual.authSecret && String(atual.authSecret).length >= 32) {
    return String(atual.authSecret);
  }

  const secret = crypto.randomBytes(48).toString("hex");
  salvarConfig({ authSecret: secret });
  return secret;
}

function tokenBootstrapPrimeiroAdmin() {
  return crypto
    .createHmac("sha256", obterAuthSecretLocal())
    .update(BOOTSTRAP_CONTEXT)
    .digest("hex");
}

function configurarBootstrapPrimeiroAdmin() {
  if (bootstrapHeaderConfigurado) return;

  const token = tokenBootstrapPrimeiroAdmin();

  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [`${LOCAL_ORIGIN}/api/auth/setup*`],
    },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };

      if (String(details.method || "").toUpperCase() === "POST") {
        requestHeaders[BOOTSTRAP_HEADER] = token;
      }

      callback({ requestHeaders });
    }
  );

  bootstrapHeaderConfigurado = true;
}

function limparModoSalvo() {
  salvarConfig({
    lastMode: "",
    lastServerUrl: "",
    lastServerIdentity: "",
    autoStart: false,
  });
}

function enviarStatus(mensagem, tipo = "") {
  log(mensagem);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("nio-os:status", { mensagem, tipo });
  }
}

function normalizarUrlServidor(valor) {
  const texto = String(valor || "").trim();

  if (!texto) return "";

  if (texto.startsWith("http://") || texto.startsWith("https://")) {
    return texto.replace(/\/+$/, "");
  }

  return `http://${texto.replace(/\/+$/, "")}`;
}

function ipv4Privado(valor) {
  const partes = String(valor || "").split(".").map(Number);

  if (
    partes.length !== 4 ||
    partes.some(
      (parte) =>
        !Number.isInteger(parte) ||
        parte < 0 ||
        parte > 255
    )
  ) {
    return false;
  }

  if (partes[0] === 10) return true;
  if (partes[0] === 192 && partes[1] === 168) return true;

  return (
    partes[0] === 172 &&
    partes[1] >= 16 &&
    partes[1] <= 31
  );
}

function normalizarUrlServidorCliente(valor) {
  const texto = String(valor || "").trim();

  if (!texto || texto.length > 64) return "";

  const candidato = /^https?:\/\//i.test(texto)
    ? texto
    : `http://${texto}`;

  try {
    const url = new URL(candidato);

    if (url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    if (!ipv4Privado(url.hostname)) return "";
    if ((url.port || String(PORTA)) !== String(PORTA)) return "";
    if (url.pathname !== "/" || url.search || url.hash) return "";

    return `http://${url.hostname}:${PORTA}`;
  } catch {
    return "";
  }
}

function origemIpcEhSeletor(event) {
  try {
    const origem =
      event?.senderFrame?.url ||
      event?.sender?.getURL?.() ||
      "";

    const url = new URL(origem);

    if (url.protocol !== "file:") return false;

    const pathname = decodeURIComponent(url.pathname || "")
      .replace(/\\/g, "/")
      .toLowerCase();

    return pathname.endsWith("/seletor.html") || pathname.endsWith("/cloud-login.html");
  } catch {
    return false;
  }
}

function exigirIpcDoSeletor(event) {
  if (!origemIpcEhSeletor(event)) {
    throw new Error("IPC não autorizado fora do seletor local.");
  }
}

function adicionarOrigemInterna(url) {
  try {
    const origem = new URL(url).origin;
    internalOrigins.add(origem);
    servidorAtual = origem;
  } catch {}
}

function urlInterna(url) {
  try {
    const destino = new URL(url);
    return internalOrigins.has(destino.origin);
  } catch {
    return false;
  }
}

function abrirUrlExternaSegura(url) {
  const destino = String(url || "");

  if (!destino || destino.startsWith("about:")) return;

  try {
    const protocolo = new URL(destino).protocol;

    if (!["http:", "https:"].includes(protocolo)) {
      log("Link externo bloqueado por protocolo:", protocolo);
      return;
    }
  } catch {
    return;
  }

  shell.openExternal(destino).catch((error) => {
    log("Erro ao abrir link externo:", destino, String(error));
  });
}

function configurarJanelaDocumento(janela) {
  janela.setMenuBarVisibility(false);

  janela.webContents.setWindowOpenHandler((details) => {
    const destino = String(details?.url || "");

    if (!destino || destino === "about:blank" || destino.startsWith("about:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          title: "Nio-OS | Documento",
          width: 980,
          height: 760,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    if (urlInterna(destino)) {
      criarJanelaInterna(destino, "Nio-OS | Documento");
      return { action: "deny" };
    }

    abrirUrlExternaSegura(destino);
    return { action: "deny" };
  });

  janela.webContents.on("will-navigate", (event, destino) => {
    if (urlInterna(destino)) return;

    event.preventDefault();
    abrirUrlExternaSegura(destino);
  });

  janela.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
}

function criarJanelaInterna(url, titulo = "Nio-OS | Documento") {
  adicionarOrigemInterna(url);

  const janela = new BrowserWindow({
    title: titulo,
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    autoHideMenuBar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  configurarJanelaDocumento(janela);
  janela.loadURL(url);
  return janela;
}

function configurarJanelaPrincipal(win) {
  win.webContents.setWindowOpenHandler((details) => {
    const destino = String(details?.url || "");

    if (!destino || destino === "about:blank" || destino.startsWith("about:")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          title: "Nio-OS | Documento",
          width: 980,
          height: 760,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    if (urlInterna(destino)) {
      criarJanelaInterna(destino, "Nio-OS | Documento");
      return { action: "deny" };
    }

    abrirUrlExternaSegura(destino);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, destino) => {
    if (urlInterna(destino)) return;

    event.preventDefault();
    abrirUrlExternaSegura(destino);
  });

  win.webContents.on("before-input-event", (event, input) => {
    const ctrl = input.control || input.meta;

    if (ctrl && ["+", "-", "=", "0"].includes(input.key)) {
      event.preventDefault();
    }

    if (input.key === "F11") {
      event.preventDefault();
    }

    if (input.key === "F12" && input.type === "keyDown") {
      event.preventDefault();
      abrirArquivoLogTecnico();
    }
  });

  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
}

function criarJanelaPrincipal() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.maximize();
  configurarJanelaPrincipal(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.loadFile(SELECTOR_HTML);

  mainWindow.webContents.once("did-finish-load", () => {
    tentarAutoIniciar();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function tentarAutoIniciar() {
  if (autoIniciado) return;
  autoIniciado = true;

  const config = lerConfig();

  if (config.autoStart === false) return;

  if (config.lastMode === "server") {
    enviarStatus("Abrindo automaticamente como servidor...", "info");
    await iniciarServidor({ salvarModo: false });
    return;
  }

  if (config.lastMode === "client" && config.lastServerUrl) {
    enviarStatus("Conectando automaticamente ao ultimo servidor...", "info");
    await iniciarCliente(config.lastServerUrl, { salvarModo: false });
  }
}

function caminhoSqliteLocal() {
  if (app.isPackaged) {
    return appDataPath("data", "nio-os.db");
  }

  return path.join(PROJECT_ROOT, "data", "nio-os.db");
}

function normalizarPathSQLite(caminho) {
  return caminho.replace(/\\/g, "/");
}

function databaseUrlLocal() {
  return `file:${normalizarPathSQLite(caminhoSqliteLocal())}`;
}

function copiarSeNaoExistir(origem, destino) {
  if (!origem || !destino) return false;
  if (!fs.existsSync(origem) || fs.existsSync(destino)) return false;

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  return true;
}

function copiarBancoComAuxiliares(origem, destino) {
  const ok = copiarSeNaoExistir(origem, destino);

  if (ok) {
    for (const sufixo of ["-wal", "-shm"]) {
      copiarSeNaoExistir(`${origem}${sufixo}`, `${destino}${sufixo}`);
    }
  }

  return ok;
}

function pastaVazia(caminho) {
  if (!fs.existsSync(caminho)) return true;

  try {
    return fs.readdirSync(caminho).length === 0;
  } catch {
    return true;
  }
}

function copiarPastaSeDestinoVazio(origem, destino) {
  if (!origem || !destino) return false;
  if (!fs.existsSync(origem) || !pastaVazia(destino)) return false;

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origem, destino, { recursive: true, force: true });
  return true;
}

function migrarConfigRoamingLegada() {
  if (!app.isPackaged) return;

  const raizLegada = caminhoRaizRoamingLegada();
  const raizAtual = app.getPath("userData");

  if (
    !raizLegada ||
    path.resolve(raizLegada) === path.resolve(raizAtual) ||
    !fs.existsSync(raizLegada)
  ) {
    return;
  }

  copiarSeNaoExistir(
    caminhoRoamingLegado("nio-os-desktop-config.json"),
    configPath()
  );
}

function migrarDadosRoamingLegados() {
  if (!app.isPackaged) return;

  migrarConfigRoamingLegada();

  const raizLegada = caminhoRaizRoamingLegada();
  const raizAtual = app.getPath("userData");

  if (
    !raizLegada ||
    path.resolve(raizLegada) === path.resolve(raizAtual) ||
    !fs.existsSync(raizLegada)
  ) {
    return;
  }

  copiarBancoComAuxiliares(
    caminhoRoamingLegado("data", "nio-os.db"),
    caminhoSqliteLocal()
  );

  copiarPastaSeDestinoVazio(
    caminhoRoamingLegado("public", "uploads"),
    appDataPath("public", "uploads")
  );

  copiarPastaSeDestinoVazio(
    caminhoRoamingLegado("storage"),
    appDataPath("storage")
  );

  copiarPastaSeDestinoVazio(
    caminhoRoamingLegado("backups"),
    appDataPath("backups")
  );
}

function caminhoBancoLegadoInstalado() {
  return path.join(PROJECT_ROOT, "data", "nio-os.db");
}

function caminhoBancoSeed() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "seed", "data", "nio-os.db");
  }

  return path.join(PROJECT_ROOT, "data", "nio-os.db");
}

function escreverEnvRuntime() {
  const envPath = appDataPath(".env");
  const linhas = [
    `DATABASE_URL="${databaseUrlLocal()}"`,
    `NODE_ENV="production"`,
    `PORT="${PORTA}"`,
    `HOST="0.0.0.0"`,
    `HOSTNAME="0.0.0.0"`,
    `COOKIE_SECURE="false"`,
    `NEXT_TELEMETRY_DISABLED="1"`,
    `NIO_OS_DATA_DIR="${normalizarPathSQLite(app.getPath("userData"))}"`,
    `NIO_OS_RUNTIME_DIR="${normalizarPathSQLite(app.getPath("userData"))}"`,
    `AUTH_SECRET="${obterAuthSecretLocal()}"`,
    `NIO_OS_LICENSE_ACTIVE="1"`,
    `NIO_OS_LICENSE_EXPIRES_ON=""`,
    "",
  ];

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, linhas.join("\r\n"), "utf8");
  return envPath;
}

function prepararPastasLocais() {
  migrarDadosRoamingLegados();

  const pastas = [
    appDataPath("data"),
    appDataPath("backups"),
    appDataPath("public", "uploads"),
    appDataPath("storage", "uploads", "anexos"),
  ];

  for (const pasta of pastas) {
    fs.mkdirSync(pasta, { recursive: true });
  }

  if (app.isPackaged) {
    const bancoDestino = caminhoSqliteLocal();
    const fontesBanco = [
      caminhoBancoLegadoInstalado(),
      caminhoBancoSeed(),
    ];

    for (const fonte of fontesBanco) {
      if (fs.existsSync(bancoDestino)) break;

      if (copiarBancoComAuxiliares(fonte, bancoDestino)) {
        log("Banco SQLite inicial/migrado para LOCALAPPDATA:", bancoDestino, "origem:", fonte);
        break;
      }
    }

    copiarPastaSeDestinoVazio(
      path.join(PROJECT_ROOT, "public", "uploads"),
      appDataPath("public", "uploads")
    );

    copiarPastaSeDestinoVazio(
      path.join(PROJECT_ROOT, "storage"),
      appDataPath("storage")
    );
  }

  garantirSchemaCompativel(caminhoSqliteLocal());
  reconciliarEstornosOrdensCanceladasSqlite(caminhoSqliteLocal());

  const envPath = escreverEnvRuntime();
  log("Pasta de dados Nio-OS:", app.getPath("userData"));
  log("DATABASE_URL em uso:", databaseUrlLocal());
  log("Env runtime:", envPath);
}

function reconciliarEstornosOrdensCanceladasSqlite(databasePath) {
  if (!databasePath || !fs.existsSync(databasePath)) return;
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(databasePath);
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name);

      if (!tables.includes("ServiceOrder") || !tables.includes("ServiceOrderPayment")) {
        return;
      }

      const ordensCanceladas = db
        .prepare("SELECT id, osNumber, paidAmount, paymentMethod, updatedAt FROM ServiceOrder WHERE status = 'CANCELADO'")
        .all();

      for (const ordem of ordensCanceladas) {
        const pagamentos = db
          .prepare("SELECT id, amount, paymentMethod, userName, createdAt FROM ServiceOrderPayment WHERE serviceOrderId = ?")
          .all(ordem.id);

        const soma = pagamentos.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const paidAmount = Number(ordem.paidAmount || 0);
        const valorParaEstornar = soma > 0 ? soma : paidAmount > 0 ? paidAmount : 0;

        if (valorParaEstornar > 0) {
          const pagamentosPositivos = pagamentos.filter((p) => Number(p.amount || 0) > 0);
          const ultimo = pagamentosPositivos[pagamentosPositivos.length - 1];
          const forma = ultimo?.paymentMethod || ordem.paymentMethod || "DINHEIRO";
          const operador = ultimo?.userName && ultimo.userName !== "Sistema" ? ultimo.userName : "Sistema";
          const timestampMs = ordem.updatedAt ? new Date(ordem.updatedAt).getTime() : Date.now();
          const dataEstornoMs = Number.isFinite(timestampMs) ? timestampMs : Date.now();
          const novoId = "estorno_" + crypto.randomUUID();
          const historyId = "hist_" + crypto.randomUUID();

          db.exec("BEGIN");
          try {
            db.prepare(`
              INSERT INTO ServiceOrderPayment (id, serviceOrderId, amount, percent, paymentMethod, note, userName, createdAt)
              VALUES (?, ?, ?, 0, ?, 'Estorno / Devolução ao cliente por cancelamento da OS.', ?, ?)
            `).run(novoId, ordem.id, -valorParaEstornar, forma, operador, dataEstornoMs);

            db.prepare("UPDATE ServiceOrder SET paidAmount = 0, paymentPercent = 0 WHERE id = ?").run(ordem.id);

            if (tables.includes("OrderHistory")) {
              db.prepare(`
                INSERT INTO OrderHistory (id, serviceOrderId, userName, action, description, createdAt)
                VALUES (?, ?, ?, 'ESTORNO_PAGAMENTO', ?, ?)
              `).run(
                historyId,
                ordem.id,
                operador,
                `Estorno de pagamento registrado por cancelamento da OS. Valor devolvido ao cliente no caixa: R$ ${valorParaEstornar.toFixed(2).replace(".", ",")} (${forma}).`,
                dataEstornoMs
              );
            }

            db.exec("COMMIT");
            log(`[Reconciliação] Estorno registrado para OS #${ordem.osNumber} no valor de R$ ${valorParaEstornar}`);
          } catch (e) {
            db.exec("ROLLBACK");
            log("Erro ao estornar pagamento na reconciliação SQLite:", e);
          }
        } else if (paidAmount > 0) {
          db.prepare("UPDATE ServiceOrder SET paidAmount = 0, paymentPercent = 0 WHERE id = ?").run(ordem.id);
        }
      }
    } finally {
      db.close();
    }
  } catch (erro) {
    log("Aviso ao reconciliar estornos no SQLite:", erro instanceof Error ? erro.message : String(erro));
  }
}

function garantirSchemaCompativel(databasePath) {
  if (!databasePath || !fs.existsSync(databasePath)) return;
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(databasePath);
    try {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name);

      if (tables.includes("CompanySettings")) {
        const cols = db.prepare("PRAGMA table_info('CompanySettings')").all();
        if (!cols.some((c) => c.name === "osModuleEnabled")) {
          log("Compatibilidade de schema: adicionando coluna osModuleEnabled em CompanySettings...");
          db.exec('ALTER TABLE "CompanySettings" ADD COLUMN "osModuleEnabled" BOOLEAN NOT NULL DEFAULT true');
          log("Coluna osModuleEnabled adicionada com sucesso.");
        }
      }
    } finally {
      db.close();
    }
  } catch (erro) {
    log("Aviso ao verificar compatibilidade do schema:", erro instanceof Error ? erro.message : String(erro));
  }
}

function pastaBackupsSchema() {
  return appDataPath("backups", "schema");
}

function caminhoConfinadoAoAppData(caminho) {
  const raiz = path.resolve(app.getPath("userData"));
  const destino = path.resolve(caminho);
  const relativo = path.relative(raiz, destino);
  return relativo !== "" && !relativo.startsWith("..") && !path.isAbsolute(relativo);
}

async function mostrarFalhaMigracao(resultado) {
  const backupDir = pastaBackupsSchema();
  const detalhes = [
    `Código técnico: ${resultado.code || "MIGRATION_PROCESS_ERROR"}`,
    "Nenhum dado foi apagado.",
    `Backups de schema: ${backupDir}`,
    "Contate o suporte e informe o código técnico.",
  ].join("\n");
  const escolha = await dialog.showMessageBox({
    type: "error",
    title: "Falha ao preparar o banco de dados",
    message: "O Nio-OS não iniciou para proteger seus dados.",
    detail: detalhes,
    buttons: ["Fechar o Nio-OS", "Abrir pasta de backups"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  if (escolha.response === 1 && caminhoConfinadoAoAppData(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    const erro = await shell.openPath(backupDir);
    if (erro) log("Falha ao abrir pasta de backups de schema:", erro);
  }
}

async function executarMigradorSchema() {
  const databasePath = caminhoSqliteLocal();
  const backupDir = pastaBackupsSchema();
  if (!path.isAbsolute(databasePath) || !fs.existsSync(databasePath)) {
    return {
      ok: false,
      code: "MIGRATION_DATABASE_NOT_FOUND",
      database: path.basename(databasePath),
      backupPath: null,
      durationMs: 0,
      message: "Banco runtime não foi localizado após a preparação.",
    };
  }

  const { runSchemaMigrator } = require("./schemaMigratorRunner.cjs");
  return runSchemaMigrator({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    databasePath,
    backupDir,
    executablePath: process.execPath,
  });
}

function caminhoServidorStandalone() {
  return path.join(PROJECT_ROOT, ".next", "standalone", "server.js");
}

function comandoStartServidor() {
  if (app.isPackaged) {
    const serverJs = caminhoServidorStandalone();

    if (!fs.existsSync(serverJs)) {
      throw new Error(
        `Servidor empacotado nao encontrado: ${serverJs}. Rode o build do instalador novamente.`
      );
    }

    return {
      comando: process.execPath,
      args: [serverJs],
      cwd: path.dirname(serverJs),
      envExtra: {
        ELECTRON_RUN_AS_NODE: "1",
      },
    };
  }

  return {
    comando: "cmd.exe",
    args: ["/d", "/s", "/c", `npm run start -- -H 0.0.0.0 -p ${PORTA}`],
    cwd: PROJECT_ROOT,
    envExtra: {},
  };
}

function iniciarProcessoServidor() {
  const { comando, args, cwd, envExtra } = comandoStartServidor();

  enviarStatus(`Iniciando servidor local em ${LOCAL_ORIGIN}...`, "info");
  log("Iniciando servidor:", comando, args.join(" "), "cwd:", cwd);

  serverProcess = spawn(comando, args, {
    cwd,
    env: {
      ...process.env,
      ...envExtra,
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      HOSTNAME: "0.0.0.0",
      PORT: String(PORTA),
      COOKIE_SECURE: "false",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: databaseUrlLocal(),
      AUTH_SECRET: process.env.AUTH_SECRET || obterAuthSecretLocal(),
      NIO_OS_DATA_DIR: app.getPath("userData"),
      NIO_OS_RUNTIME_DIR: app.getPath("userData"),
      NIO_OS_ENV_PATH: appDataPath(".env"),
      NIO_OS_LICENSE_ACTIVE: "1",
      NIO_OS_LICENSE_EXPIRES_ON: "",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => {
    log("[next]", data.toString().trim());
  });

  serverProcess.stderr.on("data", (data) => {
    log("[next:erro]", data.toString().trim());
  });

  serverProcess.on("exit", (code, signal) => {
    log("Servidor encerrado:", { code, signal });
    serverProcess = null;
  });

  serverProcess.on("error", (error) => {
    log("Erro ao iniciar processo servidor:", String(error));
  });
}

async function consultarHealthNioOS(
  baseUrl,
  { timeoutMs = 1200, identityEsperada = "" } = {}
) {
  const base = normalizarUrlServidor(baseUrl);

  if (!base) {
    return {
      ok: false,
      code: "SERVER_URL_INVALID",
      status: 0,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${base}/api/local/health`, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status !== 200) {
      return {
        ok: false,
        code: "SERVER_HEALTH_STATUS_INVALID",
        status: response.status,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return {
        ok: false,
        code: "SERVER_HEALTH_CONTENT_TYPE_INVALID",
        status: response.status,
      };
    }

    const payload = await response.json().catch(() => null);
    const identity = String(payload?.identity || "").toLowerCase();

    const assinaturaValida =
      payload?.ok === true &&
      payload?.app === "Nio-OS" &&
      payload?.service === "nio-os-local-server" &&
      payload?.mode === "server" &&
      payload?.protocolVersion === 1 &&
      /^[a-f0-9]{64}$/.test(identity);

    if (!assinaturaValida) {
      return {
        ok: false,
        code: "SERVER_HEALTH_SIGNATURE_INVALID",
        status: response.status,
      };
    }

    if (
      identityEsperada &&
      identity !== String(identityEsperada).toLowerCase()
    ) {
      return {
        ok: false,
        code: "SERVER_IDENTITY_MISMATCH",
        status: response.status,
      };
    }

    return {
      ok: true,
      code: "NIO_OS_SERVER_VALID",
      licenseActive: payload.licenseActive === true,
      status: response.status,
      identity,
    };
  } catch (error) {
    return {
      ok: false,
      code: "SERVER_HEALTH_UNREACHABLE",
      status: 0,
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function servidorRespondendo(baseUrl) {
  const resultado = await consultarHealthNioOS(baseUrl);

  log("Detector servidor Nio-OS:", baseUrl, {
    status: resultado.status,
    code: resultado.code,
  });

  return resultado.ok;
}

async function validarServidorCliente(baseUrl, identityEsperada = "") {
  const base = normalizarUrlServidorCliente(baseUrl);

  if (!base) {
    return {
      ok: false,
      code: "CLIENT_SERVER_URL_REJECTED",
      message:
        `Use somente IPv4 privado da rede local na porta ${PORTA}, por exemplo 192.168.1.10:${PORTA}.`,
    };
  }

  const resultado = await consultarHealthNioOS(base, {
    identityEsperada,
  });

  // LICENCA_LOCAL_V1_CLIENTE (Desbloqueado para operação local)
  return {
    ...resultado,
    base,
  };
}

async function esperarServidor(baseUrl, tentativas = 120) {
  const base = normalizarUrlServidor(baseUrl) || LOCAL_ORIGIN;

  for (let i = 1; i <= tentativas; i++) {
    enviarStatus(`Iniciando servidor local... Tentativa ${i}/${tentativas}`, "info");

    if (await servidorRespondendo(base)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  return false;
}

async function carregarSistema(baseUrl) {
  const base = normalizarUrlServidor(baseUrl) || LOCAL_ORIGIN;
  adicionarOrigemInterna(base);

  if (!mainWindow || mainWindow.isDestroyed()) {
    criarJanelaPrincipal();
  }

  mainWindow.setTitle(APP_NAME);
  mainWindow.loadURL(`${base}/`);
  enviarStatus(`Conectado em ${base}`, "sucesso");
}


// LICENCA_LOCAL_V1_GATE_SERVIDOR
const licenseCore = require("./license-core.cjs");

function mensagemLicencaLocalV1(code) {
  switch (code) {
    case "LICENSE_NOT_FOUND":
      return "Este computador ainda não está ativado.";
    case "LICENSE_EXPIRED":
      return "A licença deste computador venceu.";
    case "LICENSE_NOT_YET_VALID":
      return "A licença ainda não está dentro do período de validade.";
    case "INSTALLATION_MISMATCH":
    case "MACHINE_MISMATCH":
      return "A licença selecionada pertence a outro computador.";
    case "SIGNATURE_INVALID":
    case "SIGNATURE_FORMAT_INVALID":
    case "LICENSE_KEY_UNKNOWN":
    case "LICENSE_SCHEMA_UNSUPPORTED":
      return "A licença não é válida ou foi alterada.";
    default:
      return "Não foi possível validar a licença deste computador.";
  }
}

// JANELA DE LOGIN CLOUD E DIALOGOS REMOVIDOS (REDIRECIONAMENTO DIRETO EM MAINWINDOW)


// LICENCA_EXPIRADA_RECUPERACAO_V1
function localizarBackupApiRecuperacaoV1() {
  const candidatos = [
    path.join(process.cwd(), "scripts", "backup-api.js"),
    path.join(app.getAppPath(), "scripts", "backup-api.js"),
    path.join(app.getAppPath(), ".next", "standalone", "scripts", "backup-api.js"),
    path.join(process.resourcesPath || "", "app", ".next", "standalone", "scripts", "backup-api.js"),
  ];

  for (const candidato of candidatos) {
    if (candidato && fs.existsSync(candidato)) return candidato;
  }

  throw new Error("Módulo de backup do Nio-OS não foi encontrado.");
}

function lerJsonBackupRecuperacaoV1(stdout) {
  const bruto = String(stdout || "").trim();

  try {
    return JSON.parse(bruto);
  } catch {}

  const linhas = bruto
    .split(/\r?\n/g)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .reverse();

  for (const linha of linhas) {
    if (!linha.startsWith("{") || !linha.endsWith("}")) continue;

    try {
      return JSON.parse(linha);
    } catch {}
  }

  throw new Error("O processo de backup retornou uma resposta inválida.");
}

function criarBackupRecuperacaoV1(userDataDir) {
  const banco = caminhoSqliteLocal();

  if (!path.isAbsolute(banco) || !fs.existsSync(banco)) {
    throw new Error("Banco de dados local não foi encontrado para exportação.");
  }

  const envRuntime = path.join(userDataDir, ".env");
  let envTemporario = false;

  if (!fs.existsSync(envRuntime)) {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      envRuntime,
      'DATABASE_URL="' + databaseUrlLocal() + '"\r\n',
      "utf8"
    );
    envTemporario = true;
  }

  try {
    const scriptPath = localizarBackupApiRecuperacaoV1();
    const childProcess = require("node:child_process");

    const resultado = childProcess.spawnSync(
      process.execPath,
      [scriptPath, "create"],
      {
        cwd: path.dirname(path.dirname(scriptPath)),
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 1024 * 1024 * 5,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NIO_OS_BACKUP_API: "1",
          NIO_OS_DATA_DIR: userDataDir,
          NIO_OS_RUNTIME_DIR: userDataDir,
        },
      }
    );

    if (resultado.error) {
      throw new Error(
        resultado.error.name === "ETIMEDOUT"
          ? "Tempo limite excedido ao criar o backup."
          : "Não foi possível executar o backup."
      );
    }

    const stdout = String(resultado.stdout || "").trim();
    const stderr = String(resultado.stderr || "").trim();

    if (resultado.status !== 0) {
      let mensagem = "O backup não pôde ser criado.";

      try {
        const erro = lerJsonBackupRecuperacaoV1(stderr || stdout);
        if (erro?.message) mensagem = String(erro.message);
      } catch {}

      throw new Error(mensagem);
    }

    const data = lerJsonBackupRecuperacaoV1(stdout);

    if (data?.ok === false) {
      throw new Error(String(data.message || "O backup retornou falha."));
    }

    const nome = path.basename(String(data?.backup?.nome || ""));

    if (!nome) {
      throw new Error("O backup foi criado, mas o diretório de saída não foi identificado.");
    }

    const pastaBackups = path.join(userDataDir, "backups");
    const origem = path.resolve(pastaBackups, nome);
    const relativo = path.relative(path.resolve(pastaBackups), origem);

    if (
      !relativo ||
      relativo.startsWith("..") ||
      path.isAbsolute(relativo) ||
      !fs.existsSync(origem)
    ) {
      throw new Error("Diretório de backup recusado por segurança.");
    }

    return {
      nome,
      origem,
    };
  } finally {
    if (envTemporario) {
      try {
        fs.rmSync(envRuntime, { force: true });
      } catch {}
    }
  }
}

async function exportarBackupLicencaExpiradaV1(userDataDir) {
  const escolha = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, {
        title: "Escolher pasta para exportar backup",
        properties: ["openDirectory", "createDirectory"],
      })
    : await dialog.showOpenDialog({
        title: "Escolher pasta para exportar backup",
        properties: ["openDirectory", "createDirectory"],
      });

  if (escolha.canceled || !escolha.filePaths?.[0]) {
    return { ok: false, canceled: true };
  }

  const backup = criarBackupRecuperacaoV1(userDataDir);
  const destino = path.resolve(escolha.filePaths[0], backup.nome);
  const dentroDaOrigem = path.relative(backup.origem, destino);

  if (
    destino === backup.origem ||
    (!dentroDaOrigem.startsWith("..") && !path.isAbsolute(dentroDaOrigem))
  ) {
    throw new Error("Escolha uma pasta de destino fora do próprio backup.");
  }

  if (fs.existsSync(destino)) {
    throw new Error("Já existe um backup com o mesmo nome na pasta escolhida.");
  }

  fs.cpSync(backup.origem, destino, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });

  return {
    ok: true,
    destino,
    nome: backup.nome,
  };
}

function instalarArquivoLicencaLocalV1(origem) {
  const destino = licenseCore.licensePath(app.getPath("userData"));
  const pasta = licenseCore.licenseDir(app.getPath("userData"));
  const temp = destino + ".tmp-" + process.pid + "-" + Date.now();

  fs.mkdirSync(pasta, { recursive: true });

  try {
    fs.writeFileSync(temp, fs.readFileSync(origem));
    fs.renameSync(temp, destino);
  } finally {
    try {
      if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    } catch {}
  }

  return destino;
}


// LICENCA_LOCAL_V1_ENV_SERVIDOR
function publicarLicencaServidorNoAmbiente(resultado = null) {
  process.env.NIO_OS_LICENSE_ACTIVE = "1";
  process.env.NIO_OS_LICENSE_EXPIRES_ON = "";
}

// CLOUD_ACTIVATION_V1 (Desativado na versão 100% local desbloqueada)
let nioCloudRuntimeV1 = null;

function inicializarNioCloudV1() {
  log("Edição 100% Local Desbloqueada: serviços em nuvem desativados.");
  return false;
}

// CLOUD_SYNC_V1 (Sem revogação ou bloqueio na edição local)
function tratarLicencaRevogadaLocalmente(userDataDir, motivo) {
  // Edição 100% Local Desbloqueada: nunca revoga acesso
}

async function sincronizarLicencaComNuvemV1() {
  return { ok: true, offline: true };
}

function iniciarAgendadorSyncNuvemV1() {
  // Desativado na edição local sem licença
}

// VERIFICACAO_LICENCA_SERVIDOR_V1
function verificarLicencaServidorLocalV1() {
  publicarLicencaServidorNoAmbiente();
  log("Edição 100% Local Desbloqueada: servidor ativo sem exigência de licença.");
  return {
    ok: true,
    license: {
      licenseId: "OFFLINE-ILIMITADO",
      clientName: "Assistência Técnica Local",
      plan: "PRO (Vitalício)",
      expiresOn: null,
      issuedOn: "2026-01-01",
    },
  };
}

async function iniciarServidor(opcoes = {}) {
  // Edição 100% local desbloqueada: licença permanente garantida
  verificarLicencaServidorLocalV1();

  if (iniciandoServidor) {
    return { ok: false, message: "Inicialização do servidor já está em andamento." };
  }
  iniciandoServidor = true;

  if (opcoes.salvarModo !== false) {
    salvarConfig({
      lastMode: "server",
      lastServerUrl: LOCAL_ORIGIN,
      autoStart: true,
    });
  }

  try {
    prepararPastasLocais();
    configurarBootstrapPrimeiroAdmin();
    const resultadoMigracao = await executarMigradorSchema();
    log("Migrador de schema finalizado:", {
      code: resultadoMigracao.code,
      migrationId: resultadoMigracao.migrationId || null,
      database: resultadoMigracao.database,
      backupPath: resultadoMigracao.backupPath || null,
      durationMs: resultadoMigracao.durationMs,
      message: resultadoMigracao.ok ? undefined : resultadoMigracao.message,
    });
    if (!resultadoMigracao.ok) {
      await mostrarFalhaMigracao(resultadoMigracao);
      app.quit();
      return {
        ok: false,
        message: "Falha ao preparar o banco de dados.",
        code: resultadoMigracao.code,
      };
    }

    const firewallOk = await garantirFirewallLanServidor();

    if (!firewallOk) {
      enviarStatus(
        "Servidor local ativo, mas o Windows Firewall pode bloquear outros computadores da rede.",
        "aviso"
      );
    }

    adicionarOrigemInterna(LOCAL_ORIGIN);
    if (await servidorRespondendo(LOCAL_ORIGIN)) {
      await carregarSistema(LOCAL_ORIGIN);
      return { ok: true };
    }

    if (!serverProcess) iniciarProcessoServidor();
    const ok = await esperarServidor(LOCAL_ORIGIN);
    if (!ok) {
      const message =
        `Servidor nao respondeu em ${LOCAL_ORIGIN}. ` +
        `Verifique se a porta ${PORTA} esta livre.`;
      enviarStatus(message, "erro");
      return { ok: false, message };
    }

    await carregarSistema(LOCAL_ORIGIN);
    return { ok: true };
  } finally {
    iniciandoServidor = false;
  }
}

function redesLocais() {
  const interfaces = os.networkInterfaces();
  const prefixes = new Set();

  for (const itens of Object.values(interfaces)) {
    for (const item of itens || []) {
      if (
        item.family !== "IPv4" ||
        item.internal ||
        !ipv4Privado(item.address)
      ) {
        continue;
      }

      const partes = item.address.split(".");
      if (partes.length !== 4) continue;

      prefixes.add(`${partes[0]}.${partes[1]}.${partes[2]}`);
    }
  }

  return Array.from(prefixes);
}

async function encontrarServidorNaRede(identityEsperada = "") {
  const candidatos = [];
  const config = lerConfig();
  const ultimo = normalizarUrlServidorCliente(config.lastServerUrl);

  if (ultimo) {
    candidatos.push(ultimo);
  }

  for (const prefix of redesLocais()) {
    for (let i = 1; i <= 254; i++) {
      candidatos.push(`http://${prefix}.${i}:${PORTA}`);
    }
  }

  const unicos = Array.from(new Set(candidatos.filter(Boolean)));
  const concorrencia = 32;
  let indice = 0;

  async function worker() {
    while (indice < unicos.length) {
      const atual = unicos[indice++];
      enviarStatus(`Procurando servidor Nio-OS na rede...\n${atual}`, "info");

      const validacao = await validarServidorCliente(
        atual,
        identityEsperada
      );

      if (validacao.ok) {
        return {
          url: validacao.base,
          identity: validacao.identity,
        };
      }
    }

    return null;
  }

  const workers = Array.from(
    { length: Math.min(concorrencia, unicos.length) },
    () => worker()
  );

  return Promise.any(
    workers.map(async (item) => {
      const resultado = await item;
      if (!resultado) throw new Error("Nao encontrado");
      return resultado;
    })
  ).catch(() => null);
}

async function iniciarCliente(urlManual = "", opcoes = {}) {
  const config = lerConfig();
  const entradaManual = String(urlManual || "").trim();
  const urlSalva = normalizarUrlServidorCliente(config.lastServerUrl);
  const identidadeSalva = String(config.lastServerIdentity || "").toLowerCase();

  let servidor = "";
  let identityEsperada = "";
  let identity = "";

  if (entradaManual) {
    servidor = normalizarUrlServidorCliente(entradaManual);

    if (!servidor) {
      const message =
        `Endereço recusado. Use somente um IPv4 privado da rede local na porta ${PORTA}, ` +
        `por exemplo 192.168.1.10:${PORTA}.`;
      enviarStatus(message, "erro");
      return { ok: false, message, code: "CLIENT_SERVER_URL_REJECTED" };
    }

    if (urlSalva && servidor === urlSalva) {
      identityEsperada = identidadeSalva;
    }
  } else {
    const encontrado = await encontrarServidorNaRede(identidadeSalva);

    if (encontrado) {
      servidor = encontrado.url;
      identity = encontrado.identity;
    }
  }

  if (!servidor) {
    const message =
      "Servidor Nio-OS nao encontrado na rede privada. Confirme se o computador servidor esta aberto e na mesma rede.";
    enviarStatus(message, "erro");
    return { ok: false, message };
  }

  if (!identity) {
    const validacao = await validarServidorCliente(
      servidor,
      identityEsperada
    );

    if (!validacao.ok) {
      const message =
        validacao.code === "SERVER_IDENTITY_MISMATCH"
          ? "O servidor respondeu, mas a identidade nao corresponde ao servidor salvo anteriormente."
          : validacao.code === "SERVER_LICENSE_INACTIVE"
            ? "O servidor Nio-OS foi encontrado, mas a licença dele não está ativa."
            : `Servidor Nio-OS valido nao respondeu em ${servidor}.`;

      enviarStatus(message, "erro");
      return {
        ok: false,
        message,
        code: validacao.code,
      };
    }

    servidor = validacao.base;
    identity = validacao.identity;
  }

  if (opcoes.salvarModo !== false) {
    salvarConfig({
      lastMode: "client",
      lastServerUrl: servidor,
      lastServerIdentity: identity,
      autoStart: true,
    });
  } else if (
    urlSalva === servidor &&
    !identidadeSalva &&
    identity
  ) {
    salvarConfig({
      lastServerIdentity: identity,
    });
  }

  await carregarSistema(servidor);
  return { ok: true };
}

ipcMain.handle("nio-os:servidor", async (event) => {
  try {
    exigirIpcDoSeletor(event);
    return await iniciarServidor();
  } catch (error) {
    const message = error?.message || String(error);
    enviarStatus(message, "erro");
    dialog.showErrorBox("Erro ao iniciar Nio-OS", message);
    return { ok: false, message };
  }
});

ipcMain.handle("nio-os:cliente", async (event, urlManual) => {
  try {
    exigirIpcDoSeletor(event);
    return await iniciarCliente(urlManual);
  } catch (error) {
    const message = error?.message || String(error);
    enviarStatus(message, "erro");
    dialog.showErrorBox("Erro ao conectar Nio-OS", message);
    return { ok: false, message };
  }
});

ipcMain.handle("nio-os:abrir-log", async (event) => {
  exigirIpcDoSeletor(event);
  return await abrirArquivoLogTecnico();
});

ipcMain.handle("nio-os:redefinir-modo", async (event) => {
  exigirIpcDoSeletor(event);
  limparModoSalvo();
  autoIniciado = false;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(SELECTOR_HTML);
  }

  return { ok: true };
});

ipcMain.handle("nio-os:cloud-login", async (event, credentials) => {
  exigirIpcDoSeletor(event);

  if (!nioCloudRuntimeV1) {
    return { ok: false, message: "Nio-OS Cloud SDK não foi inicializado (Offline/Sem URL)." };
  }

  try {
    const userDataDir = app.getPath("userData");
    const request = licenseCore.buildActivationRequest(userDataDir, app.getVersion());
    const machineIdentityHash = licenseCore.machineIdentityHash();

    const result = await nioCloudRuntimeV1.client.login({
      email: String(credentials?.email || "").trim(),
      password: String(credentials?.password || ""),
      installationId: request.installationId,
      machineFingerprint: request.machineFingerprint,
      machineIdentityHash: machineIdentityHash,
    });

    const applied = nioCloudRuntimeV1.bridge.applyAuthResponse(result);

    if (!applied.installed) {
      return {
        ok: false,
        message: applied.status ? `Status da conta na nuvem: ${applied.status}.` : "A licença recebida não pôde ser ativada."
      };
    }

    // Publica imediatamente a licença no ambiente
    verificarLicencaServidorLocalV1();

    return { ok: true };
  } catch (error) {
    log("Falha no login cloud:", error instanceof Error ? error.message : String(error));
    let message = error?.message || "Falha ao conectar na nuvem. Verifique sua internet.";
    if (error?.code === "INVALID_CREDENTIALS") {
      message = error?.message && !error.message.includes("recusou a operação") ? error.message : "E-mail ou senha incorretos.";
    } else if (error?.code === "ACCOUNT_SUSPENDED") {
      message = "Sua conta está suspensa na nuvem. Contate o suporte.";
    } else if (error?.code === "DEVICE_LIMIT_EXCEEDED") {
      message = "Limite de computadores atingido para esta licença.";
    } else if (error?.code === "CLOUD_UNAVAILABLE" || error?.code === "CLOUD_TIMEOUT") {
      message = "Não foi possível conectar ao servidor da nuvem. Verifique sua conexão com a internet.";
    }
    return { 
      ok: false, 
      message 
    };
  }
});

ipcMain.handle("nio-os:sync-licenca", async () => {
  return await sincronizarLicencaComNuvemV1();
});

ipcMain.handle("nio-os:voltar-seletor", async (event) => {
  exigirIpcDoSeletor(event);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(SELECTOR_HTML);
  }
  return { ok: true };
});

ipcMain.on("nio-os:fechar-login", (event) => {
  exigirIpcDoSeletor(event);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadFile(SELECTOR_HTML);
  }
});
app.whenReady().then(() => {
  inicializarNioCloudV1();
  iniciarAgendadorSyncNuvemV1();
  if (!instanceLock) return;
  migrarConfigRoamingLegada();
  criarJanelaPrincipal();

  // Sincronização ao focar a janela (com debounce de 5 minutos)
  let ultimoSyncFoco = Date.now();
  app.on("browser-window-focus", () => {
    const agora = Date.now();
    if (agora - ultimoSyncFoco > 5 * 60 * 1000) {
      ultimoSyncFoco = agora;
      sincronizarLicencaComNuvemV1().catch(() => {});
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      criarJanelaPrincipal();
    }
  });
});

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch {}
  }
});
