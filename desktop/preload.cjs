// desktop/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

function executandoNoSeletor() {
  try {
    if (globalThis.location?.protocol !== "file:") return false;

    const pathname = decodeURIComponent(globalThis.location.pathname || "")
      .replace(/\\/g, "/")
      .toLowerCase();

    return pathname.endsWith("/seletor.html") || pathname.endsWith("/cloud-login.html");
  } catch {
    return false;
  }
}

if (executandoNoSeletor()) {
  contextBridge.exposeInMainWorld("nioOS", {
    iniciarServidor: () => ipcRenderer.invoke("nio-os:servidor"),
    iniciarCliente: (urlManual) =>
      ipcRenderer.invoke("nio-os:cliente", urlManual),
    abrirLog: () => ipcRenderer.invoke("nio-os:abrir-log"),
    redefinirModo: () => ipcRenderer.invoke("nio-os:redefinir-modo"),
    onStatus: (callback) => {
      if (typeof callback !== "function") return;

      ipcRenderer.removeAllListeners("nio-os:status");
      ipcRenderer.on("nio-os:status", (_event, payload) => callback(payload));
    },
    // APIs para Cloud Login
    cloudLogin: (credentials) => ipcRenderer.invoke("nio-os:cloud-login", credentials),
    fecharLogin: () => ipcRenderer.send("nio-os:fechar-login"),
    voltarSeletor: () => ipcRenderer.invoke("nio-os:voltar-seletor"),
  });
}
