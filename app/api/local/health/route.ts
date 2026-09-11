/**
 * @file route.ts
 * @description Endpoint de Health Check e identidade criptográfica do servidor local Nio-OS.
 * Usado na descoberta de instâncias locais em rede (LAN), fornecendo o fingerprint do servidor derivado
 * de AUTH_SECRET, versão de protocolo e verificação de licença local (.nio) ou variáveis de ambiente.
 */

import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Versão do protocolo de comunicação de rede local do Nio-OS. */
const PROTOCOL_VERSION = 1;

/** Contexto fixo para derivação da identidade única da instância servidora. */
const IDENTITY_CONTEXT = "nio-os-server-identity-v1";

/**
 * Calcula a identidade criptográfica do servidor local via HMAC-SHA256 sobre AUTH_SECRET.
 * @returns Hash hexadecimal único do servidor ou vazio se secret indisponível
 */
function serverIdentity() {
  const secret = String(process.env.AUTH_SECRET || "").trim();

  if (secret.length < 32) return "";

  return createHmac("sha256", secret)
    .update(IDENTITY_CONTEXT)
    .digest("hex");
}

/**
 * Avalia se o servidor possui uma licença ativa e não expirada.
 * Consulta primeiramente o arquivo físico `license/license.nio` no diretório de dados;
 * como fallback, verifica as variáveis de ambiente `NIO_OS_LICENSE_ACTIVE` e data de expiração.
 * @returns Verdadeiro se a licença estiver ativa e vigente
 */
function serverLicenseActive() {
  const dataDir = process.env.NIO_OS_DATA_DIR || process.cwd();
  const licPath = path.join(dataDir, "license", "license.nio");

  if (fs.existsSync(licPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(licPath, "utf8"));
      if (json?.payload?.expiresOn) {
        return new Date().toISOString().slice(0, 10) <= json.payload.expiresOn;
      }
    } catch {}
  }

  if (process.env.NIO_OS_LICENSE_ACTIVE !== "1") return false;

  const expiresOn = String(process.env.NIO_OS_LICENSE_EXPIRES_ON || "").trim();
  if (!expiresOn) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return false;

  return new Date().toISOString().slice(0, 10) <= expiresOn;
}

/**
 * Retorna o status de integridade (Health), identidade única, validade da licença e timestamp do servidor local.
 * 
 * @param request - Requisição HTTP recebida
 * @returns JSON com telemetria do servidor local ou status 503 caso AUTH_SECRET não esteja configurado
 */
export async function GET(request: Request) {
  const identity = serverIdentity();
  const url = new URL(request.url);

  if (!identity) {
    return NextResponse.json(
      {
        ok: false,
        app: "Nio-OS",
        service: "nio-os-local-server",
        mode: "server",
        protocolVersion: PROTOCOL_VERSION,
        code: "SERVER_IDENTITY_UNAVAILABLE",
        licenseActive: false,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      app: "Nio-OS",
      service: "nio-os-local-server",
      mode: "server",
      protocolVersion: PROTOCOL_VERSION,
      licenseActive: serverLicenseActive(),
      identity,
      origin: url.origin,
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
