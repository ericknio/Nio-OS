/**
 * @file layout.tsx
 * @description Layout raiz (RootLayout) da aplicação Nio-OS utilizando Next.js App Router.
 * Configura fontes globais (Geist Sans e Mono), estilos Tailwind CSS, idioma pt-BR,
 * e a pilha de provedores contextuais: Providers -> AuthGuard -> AppShell.
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "./AuthGuard";
import AppShell from "./AppShell";
import { Providers } from "./Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Metadados padrão para SEO e identificação da aplicação na barra do navegador.
 */
export const metadata: Metadata = {
  title: "Nio-OS | Ordem de Serviço",
  description: "Sistema local para controle de ordens de serviço.",
};

/**
 * Componente de layout raiz que envolve todas as páginas do sistema.
 * Garante que a árvore de componentes receba os temas (Providers),
 * a verificação de sessão/autenticação e primeiro acesso (AuthGuard)
 * e o invólucro de navegação com menu lateral e cabeçalho (AppShell).
 *
 * @param props.children - Conteúdo da página corrente a ser renderizada
 * @returns Elemento raiz HTML e Body com a hierarquia de wrappers configurada
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
        </Providers>
      </body>
    </html>
  );
}
