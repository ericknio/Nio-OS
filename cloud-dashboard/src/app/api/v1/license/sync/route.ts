/**
 * @file route.ts
 * @description Ponto de terminação da API REST (/api/v1/license/sync) para sincronização periódica de licenças.
 * Permite que aplicações clientes ativas renovem seu arquivo de licença assinado sem necessidade de redigitar
 * usuário e senha. Utiliza autenticação via Bearer Device Token, verifica validade de planos/direitos de uso
 * em tempo real, atualiza telemetria de presença (`lastSeenAt`) e emite novas assinaturas Ed25519.
 *
 * @module CloudDashboard/API/v1/License/Sync
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateCloudLicense } from "@/lib/license";
import { checkRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

/**
 * Sincroniza e renova a licença criptográfica de uma estação de trabalho autenticada.
 * 
 * Ciclo de vida da sincronização:
 * 1. Extrai e higieniza o Bearer Device Token informado no cabeçalho `Authorization`.
 * 2. Aplica controle de frequência de requisições (Rate Limit de até 60 chamadas por minuto).
 * 3. Converte o token bruto em hash SHA-256 e localiza a tupla correspondente no banco.
 * 4. Valida se o token expirou (validade máxima de 30 dias).
 * 5. Checa se a conta comercial ou a licença (`entitlement`) foram revogadas ou expiradas.
 * 6. Localiza o registro de instalação da máquina e atualiza o marcador de batimento cardíaco (`lastSeenAt`).
 * 7. Emite um novo payload de licença assinado digitalmente com a chave privada Ed25519 do servidor.
 * 
 * @param {Request} request - Requisição HTTP contendo o Bearer token no header e payload opcional com `installationId`.
 * @returns {Promise<NextResponse>} Resposta JSON contendo o status da licença, o novo arquivo assinado ou código de bloqueio.
 */
export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sync-client";
    const authHeader = request.headers.get("authorization") || "";
    const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!rawToken) {
      return NextResponse.json(
        { status: "BLOCKED", reason: "DEVICE_TOKEN_INVALID", licenseFile: null, syncAfterSeconds: 3600 },
        { status: 401 }
      );
    }

    const rateKey = `sync:${clientIp}:${rawToken.slice(0, 16)}`;
    const rateCheck = checkRateLimit(rateKey, 60, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { status: "RATE_LIMITED", reason: "TOO_MANY_REQUESTS", licenseFile: null, syncAfterSeconds: 60 },
        { status: 429 }
      );
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const deviceToken = await prisma.deviceToken.findUnique({
      where: { tokenHash },
      include: {
        account: {
          include: {
            entitlement: true,
            installations: true,
          },
        },
      },
    });

    if (!deviceToken || (deviceToken.expiresAt && deviceToken.expiresAt < new Date())) {
      return NextResponse.json(
        { status: "BLOCKED", reason: "DEVICE_TOKEN_INVALID", licenseFile: null, syncAfterSeconds: 3600 },
        { status: 401 }
      );
    }

    const { account } = deviceToken;

    if (account.status !== "ACTIVE") {
      return NextResponse.json(
        { status: "BLOCKED", reason: "ACCOUNT_BLOCKED", licenseFile: null, syncAfterSeconds: 3600 },
        { status: 403 }
      );
    }

    if (
      !account.entitlement ||
      account.entitlement.status !== "ACTIVE" ||
      account.entitlement.expiresAt < new Date()
    ) {
      return NextResponse.json(
        { status: "EXPIRED", reason: "ENTITLEMENT_EXPIRED", licenseFile: null, syncAfterSeconds: 1800 },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const inputInstallationId = String(body.installationId || "").trim();

    const installation = account.installations.find(
      (i) => (inputInstallationId && i.installationId === inputInstallationId) || i.id === deviceToken.installationId
    );
    const actualInstallationId = installation?.installationId || inputInstallationId || "UNKNOWN-INSTALLATION";
    const machineFingerprint = installation?.machineFingerprint || "DEFAULT-FINGERPRINT";

    // Atualiza lastSeenAt
    if (installation) {
      await prisma.installation.update({
        where: { id: installation.id },
        data: { lastSeenAt: new Date() },
      });
    }

    // Gera nova licença atualizada assinada
    const licenseFile = generateCloudLicense(
      account.name,
      actualInstallationId,
      machineFingerprint,
      account.entitlement.expiresAt,
      account.entitlement.plan
    );

    return NextResponse.json({
      status: "ACTIVE",
      reason: null,
      licenseFile,
      syncAfterSeconds: 3600,
    });
  } catch (error) {
    console.error("Erro na rota de sincronização de licença:", error);
    return NextResponse.json(
      { status: "BLOCKED", reason: "INTERNAL_ERROR", licenseFile: null, syncAfterSeconds: 3600 },
      { status: 500 }
    );
  }
}

/**
 * Trata requisições HTTP OPTIONS pré-voo (CORS preflight).
 * 
 * Configura permissões cross-origin para que clientes desktop e web possam consultar a rota de sincronização.
 * 
 * @returns {Promise<NextResponse>} Resposta HTTP 204 No Content com cabeçalhos CORS.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    },
  });
}
