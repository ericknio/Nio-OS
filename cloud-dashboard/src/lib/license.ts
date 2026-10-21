/**
 * @file license.ts
 * @description Motor criptográfico de emissão e assinatura de licenças digitais do Nio-OS.
 *
 * Princípios Criptográficos e de Arquitetura:
 * 1. Assinatura Assimétrica Ed25519:
 *    - Assina o envelope canônico com a chave privada mestre da Nio Tecnologia.
 *    - Permite que o software desktop instalado no cliente valide a autenticidade e integridade
 *      offline utilizando exclusivamente a chave pública embutida no binário (`KEY_ID`).
 * 2. Serialização Determinística (`stableStringify`):
 *    - Garante que a ordem alfabética das chaves JSON seja rigorosamente preservada,
 *      impedindo discrepâncias de hash entre o emissor na nuvem e o verificador local.
 * 3. Amarrações de Hardware (Fingerprint):
 *    - Vincula a licença ao identificador de instalação (`installationId`) e ao hash de hardware
 *      (`machineFingerprint`) da máquina do cliente, mitigando cópias não autorizadas.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Versão do esquema estrutural do payload de licenças emitidas.
 */
export const LICENSE_SCHEMA = 1;

/**
 * Nome canônico do produto licenciado.
 */
export const PRODUCT = "Nio-OS";

/**
 * Identificador da chave criptográfica Ed25519 ativa.
 */
export const KEY_ID = "nio-ed25519-3aed3b0a255d893d";

/**
 * Serializa um objeto JavaScript em JSON de forma estável e determinística,
 * ordenando recursivamente todas as chaves alfabeticamente para permitir hashing reproduzível.
 *
 * @param value - Valor arbitrário ou objeto a serializar
 * @returns String JSON canônica
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((key) => JSON.stringify(key) + ":" + stableStringify(obj[key])).join(",") +
    "}"
  );
}

/**
 * Converte um buffer de bytes em string Base64URL sem padding (`=`).
 *
 * @param buffer - Buffer com os bytes da assinatura
 * @returns String formatada em Base64URL
 */
export function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Gera o Buffer UTF-8 correspondente ao envelope canônico para cálculo da assinatura digital.
 *
 * @param envelope - Objeto do envelope contendo schema, keyId e payload
 * @returns Buffer binário para alimentação da função de assinatura crypto.sign
 */
export function signedEnvelopeBytes(envelope: {
  schema: number;
  keyId: string;
  payload: unknown;
}): Buffer {
  return Buffer.from(
    stableStringify({
      schema: envelope.schema,
      keyId: envelope.keyId,
      payload: envelope.payload,
    }),
    "utf8"
  );
}

/**
 * Retorna a representação textual de uma data no formato YYYY-MM-DD respeitando o fuso local.
 *
 * @param now - Instância Date de referência (padrão: data atual)
 * @returns String de data formatada em AAAA-MM-DD
 */
export function todayLocalDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Cache da chave privada Ed25519 instanciada em memória.
 */
let cachedPrivateKey: crypto.KeyObject | null = null;

/**
 * Recupera o objeto de chave privada Ed25519, lendo da variável de ambiente `LICENSE_PRIVATE_KEY`
 * ou buscando do diretório de desenvolvimento local seguro no perfil do usuário (`~/Nio-License-Keys/`).
 *
 * @throws Error se a chave privada não for encontrada
 * @returns KeyObject instanciado do Node.js crypto
 */
function getPrivateKey(): crypto.KeyObject {
  if (cachedPrivateKey) return cachedPrivateKey;

  let privateKeyPem = process.env.LICENSE_PRIVATE_KEY;

  if (privateKeyPem) {
    // Provedores como Vercel/Render/Railway podem escapar as quebras de linha como string literal '\n'
    privateKeyPem = privateKeyPem.replace(/\\n/g, "\n");
  } else {
    // Tenta carregar do disco local (ambiente de dev Windows local)
    const localPath = path.join(os.homedir(), "Nio-License-Keys", "Nio-OS", "nio-os-license-private.ed25519.pem");
    if (fs.existsSync(localPath)) {
      privateKeyPem = fs.readFileSync(localPath, "utf8");
    } else {
      throw new Error("LICENSE_PRIVATE_KEY not configured and local key file not found.");
    }
  }

  cachedPrivateKey = crypto.createPrivateKey(privateKeyPem);
  return cachedPrivateKey;
}

/**
 * Gera e assina criptograficamente uma nova licença em nuvem para uma instalação cliente.
 *
 * @param clientName - Razão social ou nome do cliente
 * @param installationId - Identificador único da instalação local gerado pelo Nio-OS desktop
 * @param machineFingerprint - Hash identificador do hardware do servidor local
 * @param expiresAt - Data de expiração da licença contratada
 * @param plan - Plano contratado (padrão: "PRO")
 * @returns String JSON formatada contendo o envelope assinado com a assinatura Ed25519 em Base64URL
 */
export function generateCloudLicense(
  clientName: string,
  installationId: string,
  machineFingerprint: string,
  expiresAt: Date,
  plan: string = "PRO"
): string {
  const licenseId = "NIO-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  const now = new Date();
  
  const payload = {
    product: PRODUCT,
    licenseId,
    clientName,
    installationId,
    machineFingerprint,
    issuedOn: todayLocalDate(now),
    expiresOn: todayLocalDate(expiresAt),
    plan,
    features: {},
  };

  const envelope = {
    schema: LICENSE_SCHEMA,
    keyId: KEY_ID,
    payload,
  };

  const envelopeBytes = signedEnvelopeBytes(envelope);
  const privateKey = getPrivateKey();
  const signatureBuffer = crypto.sign(null, envelopeBytes, privateKey);
  const signature = base64urlEncode(signatureBuffer);

  const finalLicense = {
    ...envelope,
    signature,
  };

  return JSON.stringify(finalLicense, null, 2);
}

