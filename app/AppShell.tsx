"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SistemaFrame from "./SistemaFrame";

const ROTAS_SEM_FRAME = ["/login", "/primeiro-acesso", "/setup", "/sair"];

function deveOcultarFrame(pathname: string) {
  return ROTAS_SEM_FRAME.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`)
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (deveOcultarFrame(pathname)) {
    return <>{children}</>;
  }

  return <SistemaFrame>{children}</SistemaFrame>;
}