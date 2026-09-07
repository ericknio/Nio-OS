import fs from "node:fs";
import path from "node:path";

export type DadosLicencaLocal = {
  ativa: boolean;
  vencimento: string | null;
  cliente: string | null;
  plano: string | null;
  licenseId: string | null;
};

type VerificadorAssinatura = (
  envelope: unknown,
  userDataDir?: string,
  options?: { ignoreExpired?: boolean }
) => { ok: boolean; code?: string };

let verifyLicenseObject: VerificadorAssinatura | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const core = require("../desktop/license-core.cjs");
  if (typeof core?.verifyLicenseObject === "function") {
    verifyLicenseObject = core.verifyLicenseObject;
  }
} catch {
  // Ignora se o arquivo core não estiver acessível neste contexto
}

function envelopeValido(envelope: unknown, dataDir: string): boolean {
  if (!verifyLicenseObject) return true;
  try {
    const res = verifyLicenseObject(envelope, dataDir, { ignoreExpired: true });
    return res.ok || res.code === "EXPIRED";
  } catch {
    return false;
  }
}

export function obterLicencaLocal(): DadosLicencaLocal {
  const hoje = new Date().toISOString().slice(0, 10);
  const dataDir = process.env.NIO_OS_DATA_DIR || process.cwd();
  const candidatePaths = [
    path.join(dataDir, "license", "license.nio"),
    path.join(dataDir, "license.nio"),
    path.join(process.cwd(), "license.nio"),
  ];

  for (const filePath of candidatePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        const json = JSON.parse(content);
        if (json?.payload?.expiresOn && envelopeValido(json, dataDir)) {
          const expirada = String(json.payload.expiresOn).slice(0, 10) < hoje;
          return {
            ativa: !expirada && process.env.NIO_OS_LICENSE_ACTIVE !== "0",
            vencimento: json.payload.expiresOn,
            cliente: json.payload.clientName || null,
            plano: json.payload.plan || "PRO",
            licenseId: json.payload.licenseId || null,
          };
        }
      } catch {
        // Ignora se não for JSON válido
      }
    }
  }

  // 2. Variável de ambiente como fallback
  if (process.env.NIO_OS_LICENSE_EXPIRES_ON) {
    const expirada = String(process.env.NIO_OS_LICENSE_EXPIRES_ON).slice(0, 10) < hoje;
    return {
      ativa: !expirada && process.env.NIO_OS_LICENSE_ACTIVE !== "0",
      vencimento: process.env.NIO_OS_LICENSE_EXPIRES_ON,
      cliente: process.env.NIO_OS_LICENSE_CLIENT || null,
      plano: process.env.NIO_OS_LICENSE_PLAN || "PRO",
      licenseId: process.env.NIO_OS_LICENSE_ID || null,
    };
  }

  // 3. Fallback: procurar arquivo *.nio na raiz do projeto
  try {
    const files = fs.readdirSync(process.cwd());
    const nioFile = files.find((f) => f.endsWith(".nio"));
    if (nioFile) {
      const content = fs.readFileSync(path.join(process.cwd(), nioFile), "utf8");
      const json = JSON.parse(content);
      if (json?.payload?.expiresOn && envelopeValido(json, dataDir)) {
        const expirada = String(json.payload.expiresOn).slice(0, 10) < hoje;
        return {
          ativa: !expirada && process.env.NIO_OS_LICENSE_ACTIVE !== "0",
          vencimento: json.payload.expiresOn,
          cliente: json.payload.clientName || null,
          plano: json.payload.plan || "PRO",
          licenseId: json.payload.licenseId || null,
        };
      }
    }
  } catch {
    // Ignora
  }

  return {
    ativa: false,
    vencimento: null,
    cliente: null,
    plano: null,
    licenseId: null,
  };
}

