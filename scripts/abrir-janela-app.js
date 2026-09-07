const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const url = String(process.argv[2] || "").trim();

if (!url) {
  console.error("URL nao informada.");
  process.exit(1);
}

const edgeCandidatos = [
  path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  path.join(process.env.LocalAppData || "", "Microsoft", "Edge", "Application", "msedge.exe"),
];

const chromeCandidatos = [
  path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env.LocalAppData || "", "Google", "Chrome", "Application", "chrome.exe"),
];

function iniciar(programa, args) {
  const child = spawn(programa, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });

  child.unref();
}

for (const candidato of [...edgeCandidatos, ...chromeCandidatos]) {
  if (candidato && fs.existsSync(candidato)) {
    iniciar(candidato, [
      `--app=${url}`,
      "--new-window",
      "--disable-features=TranslateUI",
    ]);
    process.exit(0);
  }
}

// Fallback: abre no navegador padrao quando Edge/Chrome nao forem encontrados.
iniciar("cmd", ["/c", "start", "", url]);
