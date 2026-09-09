/**
 * @file licencaLocal.ts
 * @description Módulo de verificação e leitura da licença de uso local do Nio-OS.
 * 
 * Responsável por validar se a instalação possui um arquivo de licença assinado criptograficamente
 * (.nio), verificar se a licença não expirou em relação à data atual e extrair os dados do plano
 * e cliente contratante sem depender de conexão contínua com a internet (Offline-First).
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Estrutura de dados representativa do estado da licença local.
 */
export type DadosLicencaLocal = {
  /** Indica se a licença está válida, assinada e dentro do prazo de vigência */
  ativa: boolean;
  /** Data limite de validade da licença no formato ISO (AAAA-MM-DD) */
  vencimento: string | null;
  /** Nome ou razão social da assistência técnica licenciada */
  cliente: string | null;
  /** Plano contratado (ex: PRO, ENTERPRISE) */
  plano: string | null;
  /** Identificador único do contrato de licença */
  licenseId: string | null;
};

/**
 * Assinatura da função externa do Desktop que valida a criptografia da licença contra o hardware.
 */
type VerificadorAssinatura = (
  envelope: unknown,
  userDataDir?: string,
  options?: { ignoreExpired?: boolean }
) => { ok: boolean; code?: string };

let verifyLicenseObject: VerificadorAssinatura | null = null;
try {
  // Carrega o motor criptográfico do Electron caso disponível
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const core = require("../desktop/license-core.cjs");
  if (typeof core?.verifyLicenseObject === "function") {
    verifyLicenseObject = core.verifyLicenseObject;
  }
} catch {
  // Ignora se o arquivo core não estiver acessível neste contexto (ex: testes isolados)
}

/**
 * Valida a autenticidade e integridade criptográfica do envelope da licença.
 *
 * @param envelope - Objeto JSON decodificado da licença (.nio)
 * @param dataDir - Diretório de dados onde reside a identidade do hardware
 * @returns true se a assinatura for válida ou se expirada (mantendo integridade); false se for forjada
 */
function envelopeValido(envelope: unknown, dataDir: string): boolean {
  if (!verifyLicenseObject) return true;
  try {
    const res = verifyLicenseObject(envelope, dataDir, { ignoreExpired: true });
    return res.ok || res.code === "EXPIRED";
  } catch {
    return false;
  }
}

/**
 * Lê e avalia a licença local do Nio-OS.
 * 
 * Ordem de verificação:
 * 1. Arquivo de licença físico oficial: `license/license.nio` na pasta de dados do sistema.
 * 2. Variáveis de ambiente configuradas no servidor local (NIO_OS_LICENSE_*).
 * 3. Arquivo `.nio` presente na raiz da aplicação.
 *
 * @returns Objeto com o status de ativação, data de vencimento e identificação do cliente
 */
export function obterLicencaLocal(): DadosLicencaLocal {
  const hoje = new Date().toISOString().slice(0, 10);
  const dataDir = process.env.NIO_OS_DATA_DIR || process.cwd();
  const candidatePaths = [
    path.join(dataDir, "license", "license.nio"),
    path.join(dataDir, "license.nio"),
    path.join(process.cwd(), "license.nio"),
  ];

  // 1. Verificação nos caminhos prioritários da pasta de dados
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
    // Ignora erros de leitura de diretório
  }

  // Retorno padrão quando não há nenhuma licença válida detectada
  return {
    ativa: false,
    vencimento: null,
    cliente: null,
    plano: null,
    licenseId: null,
  };
}
