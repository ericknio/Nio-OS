/**
 * @file layout.tsx
 * @description Layout raiz (Root Layout) da aplicação Cloud Dashboard.
 * Configura fontes tipográficas do Google (Geist e Geist Mono), metadados SEO, viewport responsiva
 * com zoom acessível, esquema de cores escuro padrão (Dark Mode) e estrutura base do documento HTML.
 *
 * @module CloudDashboard/App/RootLayout
 */

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Configuração de viewport para suporte responsivo e acessibilidade móvel.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#090d16",
};

/**
 * Metadados globais da aplicação para SEO e identificação do painel.
 */
export const metadata: Metadata = {
  title: "Nio-OS Cloud | Gestão de Licenças e Revendas",
  description:
    "Painel administrativo em nuvem para gerenciamento de clientes, revendas e ativação de licenças do Nio-OS.",
  icons: {
    icon: "/favicon.ico",
  },
};

/**
 * Componente de layout raiz que envolve todas as páginas do Cloud Dashboard.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {React.ReactNode} props.children - Nós React filhos renderizados dentro do corpo da página.
 * @returns {JSX.Element} Estrutura HTML raiz da aplicação.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#090d16] text-gray-100 font-sans selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
