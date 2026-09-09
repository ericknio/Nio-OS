/**
 * @file app/AppShell.tsx
 * @description Casca visual da aplicação (App Shell).
 * 
 * Determina se a moldura completa do sistema (`SistemaFrame`) deve ser renderizada
 * ou se a tela deve ser exibida em modo limpo e sem barras de menu (ex: tela de Login,
 * tela de Primeiro Acesso, Setup inicial e Logout).
 */

"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SistemaFrame from "./SistemaFrame";

/**
 * Lista de rotas públicas ou de autenticação que não devem exibir o menu e barra de navegação.
 */
const ROTAS_SEM_FRAME = ["/login", "/primeiro-acesso", "/setup", "/sair"];

/**
 * Verifica se a rota atual corresponde a alguma das telas isoladas sem moldura.
 *
 * @param pathname - Caminho relativo da URL atual
 * @returns true se deve ocultar a moldura; false para exibir navegação completa
 */
function deveOcultarFrame(pathname: string) {
  return ROTAS_SEM_FRAME.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

/**
 * Componente AppShell que envolve todas as páginas do sistema.
 *
 * @param props.children - Conteúdo da página atual
 * @returns Página encapsulada pelo SistemaFrame ou em tela limpa
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (deveOcultarFrame(pathname)) {
    return <>{children}</>;
  }

  return <SistemaFrame>{children}</SistemaFrame>;
}