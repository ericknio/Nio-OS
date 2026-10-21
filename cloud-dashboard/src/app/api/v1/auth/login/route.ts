/**
 * @file route.ts
 * @description Ponto de terminação da API REST (/api/v1/auth/login) para autenticação de clientes comerciais.
 * Suporta autenticação tanto para instâncias Desktop (com vinculação de máquina e geração de licença assinada)
 * quanto para servidores Web/Locais. Inclui limitação de taxa por IP/Login (Rate Limiting), validação de senha
 * com Bcrypt, verificação de direitos de uso (Entitlements) e emissão de tokens de dispositivo persistentes.
 *
 * @module CloudDashboard/API/v1/Auth/Login
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateCloudLicense } from "@/lib/license";
import { checkRateLimit, resetRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

/**
 * Processa a requisição de login de um cliente comercial ou terminal desktop.
 * 
 * Fluxo de execução:
 * 1. Extração do IP do cliente e proteção via rate limiting (máximo 10 requisições/minuto).
 * 2. Validação do corpo JSON e credenciais obrigatórias (login e senha).
 * 3. Busca da conta comercial no banco e checagem de status operacional (`ACTIVE`).
 * 4. Verificação da senha criptografada via Bcrypt.
 * 5. Validação da licença associada (`entitlement` ativo e dentro da data de validade).
 * 6. Se os dados da máquina (`installationId` e `machineFingerprint`) forem informados:
 *    - Registra ou atualiza a instalação (`Installation`) da máquina.
 *    - Gera um Device Token SHA-256 persistente com validade de 30 dias.
 *    - Emite o arquivo de licença criptografado e assinado via chave privada Ed25519.
 * 7. Se for cliente web/local sem telemetria de máquina, retorna os metadados do plano ativo.
 * 
 * @param {Request} request - Objeto da requisição HTTP contendo credenciais e dados opcionais da máquina.
 * @returns {Promise<NextResponse>} Resposta JSON contendo o token de dispositivo e licença, ou mensagem descritiva de erro.
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

    if (!login || !password) {
      return NextResponse.json({ message: "Login e senha são obrigatórios." }, { status: 400 });
    }

    // Rate limit: 10 tentativas por minuto por IP/login
    const rateCheck = checkRateLimit(`api-login:${clientIp}:${login}`, 10, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { message: `Muitas tentativas. Aguarde ${rateCheck.retryAfterSeconds} segundos.` },
        { status: 429 }
      );
    }

    const account = await prisma.commercialAccount.findUnique({
      where: { email: login },
      include: { entitlement: true },
    });

    if (!account) {
      return NextResponse.json({ message: "Usuário ou senha inválidos." }, { status: 401 });
    }

    if (account.status !== "ACTIVE") {
      return NextResponse.json({ message: "Conta bloqueada no sistema." }, { status: 403 });
    }

    const isValid = await bcrypt.compare(password, account.passwordHash);
    if (!isValid) {
      return NextResponse.json({ message: "Usuário ou senha inválidos." }, { status: 401 });
    }

    if (
      !account.entitlement ||
      account.entitlement.status !== "ACTIVE" ||
      account.entitlement.expiresAt < new Date()
    ) {
      return NextResponse.json(
        { message: "Licença expirada ou inativa. Entre em contato com seu revendedor." },
        { status: 402 }
      );
    }

    // Sucesso: reseta rate limit
    resetRateLimit(`api-login:${clientIp}:${login}`);

    const { installationId, machineFingerprint, machineIdentityHash } = body;

    // Se for modo Desktop com identificação de máquina
    if (installationId && machineFingerprint) {
      // Upsert na instalação para controle de máquinas ativas
      const installationRecord = await prisma.installation.upsert({
        where: { installationId },
        create: {
          installationId,
          machineFingerprint,
          machineIdentityHash: machineIdentityHash || machineFingerprint,
          machineCode: "NIO-DESKTOP",
          accountId: account.id,
          status: "ACTIVE",
          lastSeenAt: new Date(),
        },
        update: {
          machineFingerprint,
          machineIdentityHash: machineIdentityHash || machineFingerprint,
          lastSeenAt: new Date(),
        },
      });

      // Gerar Device Token
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      await prisma.deviceToken.create({
        data: {
          tokenHash,
          accountId: account.id,
          installationId: installationRecord.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 dias
        },
      });

      const licenseFile = generateCloudLicense(
        account.name,
        installationId,
        machineFingerprint,
        account.entitlement.expiresAt,
        account.entitlement.plan
      );

      return NextResponse.json(
        {
          deviceToken: rawToken,
          status: "ACTIVE",
          licenseFile,
          syncAfterSeconds: 3600,
        },
        { status: 200 }
      );
    }

    // Se for modo Web / Servidor Local simples
    return NextResponse.json(
      {
        status: "ACTIVE",
        expiresAt: account.entitlement.expiresAt.toISOString(),
        plan: account.entitlement.plan,
        name: account.name,
        email: account.email,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro na API de login:", error);
    return NextResponse.json({ message: "Erro interno no servidor." }, { status: 500 });
  }
}

/**
 * Trata requisições HTTP OPTIONS pré-voo (CORS preflight).
 * 
 * Configura os cabeçalhos necessários para permitir chamadas cross-origin a partir de aplicações
 * desktop Electron, clientes frontend ou terminais externos autorizados.
 * 
 * @returns {Promise<NextResponse>} Resposta HTTP 204 No Content com cabeçalhos CORS configurados.
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
