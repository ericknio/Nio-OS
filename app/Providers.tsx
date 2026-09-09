/**
 * @file app/Providers.tsx
 * @description Provedor global de contextos da aplicação (Theme Context).
 * 
 * Configura o `ThemeProvider` da biblioteca `next-themes` para aplicar
 * classes CSS de tema ('class') com suporte automático à preferência do sistema operacional.
 */

"use client";

import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";

/**
 * Componente Providers que encapsula a árvore de componentes da aplicação.
 *
 * @param props.children - Componentes descendentes a receber o contexto de tema
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
