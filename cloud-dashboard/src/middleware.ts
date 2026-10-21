/**
 * @file middleware.ts
 * @description Middleware de borda (Edge Middleware) para o Cloud Dashboard do Nio-OS.
 *
 * Responsabilidades de Segurança:
 * 1. Proteção de Rotas Autenticadas:
 *    - Intercepta todas as requisições para `/dashboard/*`.
 *    - Valida o token JWT no cookie `session` utilizando a biblioteca `jose` e algoritmo HS256.
 *    - Redireciona usuários sem sessão ou com token inválido/expirado para a raiz `/` (login), limpando o cookie corrupto.
 * 2. Injeção de Cabeçalhos HTTP Defensivos:
 *    - `X-Frame-Options: DENY` e `frame-ancestors 'none'` (anti-clickjacking).
 *    - `X-Content-Type-Options: nosniff` (anti-sniffing de MIME).
 *    - `Referrer-Policy: strict-origin-when-cross-origin`.
 *    - `Permissions-Policy` bloqueando câmera, microfone e geolocalização.
 *    - `Content-Security-Policy (CSP)` restritivo com suporte a scripts Next.js.
 *    - `Strict-Transport-Security (HSTS)` ativado em ambiente de produção (1 ano, subdomínios e preload).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/auth";

/**
 * Função de middleware executada antes do processamento das rotas pelo Next.js.
 *
 * @param request - Requisição NextRequest de entrada
 * @returns NextResponse com redirecionamento de autenticação ou continuação com cabeçalhos de segurança
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Verificação de Autenticação em Rotas /dashboard
  let redirectResponse: NextResponse | null = null;
  if (pathname.startsWith("/dashboard")) {
    const session = request.cookies.get("session")?.value;

    if (!session) {
      redirectResponse = NextResponse.redirect(new URL("/", request.url));
    } else {
      try {
        const key = getJwtSecretKey();
        await jwtVerify(session, key, { algorithms: ["HS256"] });
      } catch {
        const res = NextResponse.redirect(new URL("/", request.url));
        res.cookies.set("session", "", { path: "/", expires: new Date(0) });
        redirectResponse = res;
      }
    }
  }

  const response = redirectResponse || NextResponse.next();

  // 2. Injeção de Cabeçalhos HTTP de Segurança Avançados
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );

  // Content-Security-Policy com suporte para hidratação Next.js
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https:;
    font-src 'self' data:;
    connect-src 'self' https:;
    frame-ancestors 'none';
    form-action 'self';
    base-uri 'self';
  `.replace(/\s{2,}/g, " ").trim();

  response.headers.set("Content-Security-Policy", cspHeader);

  // HSTS apenas em conexões de produção HTTPS
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

/**
 * Configuração de rotas interceptadas pelo middleware do Cloud Dashboard.
 * Aplica-se a todas as requisições exceto arquivos estáticos gerados internamente pelo Next.js.
 */
export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas da aplicação, exceto arquivos estáticos
     * internos do Next.js (_next/static, _next/image, favicon.ico).
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

