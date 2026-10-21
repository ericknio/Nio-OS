/**
 * @file route.ts
 * @description Ponto de terminação da API REST (/api/v1/client-auth/login) exclusivo para ativação de clientes Desktop.
 * Exige dados biométricos/criptográficos do hardware cliente (`machineFingerprint` e `machineIdentityHash`),
 * aplica validação anti-fraude para planos de teste (`TRIAL`) via tabela `TrialClaim`, registra a estação
 * de trabalho e emite o token de dispositivo junto à licença criptográfica assinada.
 *
 * @module CloudDashboard/API/v1/ClientAuth/Login
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateCloudLicense } from "@/lib/license";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

/**
 * Autentica uma aplicação desktop e vincula a licença ao hardware do cliente.
 * 
 * Fluxo de validação e segurança:
 * 1. Limitação de taxa (Rate Limit) por IP e login.
 * 2. Validação dos parâmetros de telemetria da máquina (`installationId`, `machineFingerprint`, `machineIdentityHash`).
 * 3. Verificação das credenciais com Bcrypt e consulta da conta comercial e do direito de uso (`entitlement`).
 * 4. Proteção contra abuso de Trial: se o plano for `TRIAL`, verifica se a identidade do hardware já foi
 *    reivindicada por outra conta anteriormente (`trialClaim`). Se sim, bloqueia a concessão (HTTP 403).
 * 5. Registro ou atualização da instalação (`Installation`) para monitoramento de atividade (`lastSeenAt`).
 * 6. Geração de um novo `deviceToken` persistente (armazenado em hash SHA-256) válido por 30 dias.
 * 7. Emissão do arquivo de licença criptograficamente assinado com Ed25519.
 * 
 * @param {Request} request - Requisição HTTP POST contendo credenciais e assinaturas de hardware da estação.
 * @returns {Promise<NextResponse>} Resposta JSON com o Device Token, licença assinada e intervalo de sincronização.
 */
export async function POST(request: Request) {
  try {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "api-client";
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json({ message: "Corpo da requisição inválido." }, { status: 400 });
    }

    const login = String(body.login || body.username || body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const installationId = String(body.installationId || "").trim();
    const machineFingerprint = String(body.machineFingerprint || "").trim();
    const machineIdentityHash = String(body.machineIdentityHash || "").trim();

    if (!login || !password || !installationId || !machineFingerprint || !machineIdentityHash) {
      return NextResponse.json({ message: "Dados incompletos." }, { status: 400 });
    }

    const rateKey = `client-login:${clientIp}:${login}`;
    const rateCheck = checkRateLimit(rateKey, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { message: `Muitas tentativas. Aguarde ${rateCheck.retryAfterSeconds} segundos.` },
        { status: 429 }
      );
    }

    const account = await prisma.commercialAccount.findUnique({
      where: { email: login },
      include: { entitlement: true }
    });

    if (!account) {
      return NextResponse.json({ message: "Usuário ou senha inválidos." }, { status: 401 });
    }

    if (account.status !== "ACTIVE") {
      return NextResponse.json({ message: "Sua conta está bloqueada no sistema." }, { status: 403 });
    }

    const isValid = await bcrypt.compare(password, account.passwordHash);
    if (!isValid) {
      return NextResponse.json({ message: "Usuário ou senha inválidos." }, { status: 401 });
    }

    if (!account.entitlement || account.entitlement.status !== "ACTIVE" || account.entitlement.expiresAt < new Date()) {
      return NextResponse.json({ message: "Licença expirada ou inválida." }, { status: 402 });
    }

    // Regra de TRIAL: bloquear se essa máquina já tiver um Trial associado a outra conta
    if (account.entitlement.plan === "TRIAL") {
      const existingTrial = await prisma.trialClaim.findUnique({
        where: { machineIdentityHash }
      });

      if (existingTrial && existingTrial.accountId !== account.id) {
        return NextResponse.json(
          { message: "Esta máquina já usufruiu do período de teste." },
          { status: 403 }
        );
      }

      if (!existingTrial) {
        await prisma.trialClaim.create({
          data: {
            machineIdentityHash,
            machineFingerprint,
            installationId,
            expiresAt: account.entitlement.expiresAt,
            accountId: account.id,
          }
        });
      }
    }

    // Upsert na Instalação (para rastreio)
    const installationRecord = await prisma.installation.upsert({
      where: { installationId },
      create: {
        installationId,
        machineFingerprint,
        machineIdentityHash,
        machineCode: "NIO-UNKNOWN", // Poderíamos gerar o hash correto depois
        accountId: account.id,
        status: "ACTIVE",
        lastSeenAt: new Date()
      },
      update: {
        machineFingerprint,
        machineIdentityHash,
        lastSeenAt: new Date()
      }
    });

    // Gerar Device Token e Hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await prisma.deviceToken.create({
      data: {
        tokenHash,
        accountId: account.id,
        installationId: installationRecord.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dias
      }
    });

    const licenseFile = generateCloudLicense(
      account.name,
      installationId,
      machineFingerprint,
      account.entitlement.expiresAt,
      account.entitlement.plan
    );

    resetRateLimit(rateKey);

    return NextResponse.json({
      deviceToken: rawToken,
      status: "ACTIVE",
      licenseFile,
      syncAfterSeconds: 3600 // 1 hora
    }, { status: 200 });

  } catch (error) {
    console.error("Erro na API da Nuvem:", error);
    return NextResponse.json({ message: "Erro interno no servidor da nuvem." }, { status: 500 });
  }
}

/**
 * Trata requisições HTTP OPTIONS pré-voo (CORS preflight).
 * 
 * Libera os métodos POST e OPTIONS para clientes Desktop e navegadores que realizam chamadas cross-origin.
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
