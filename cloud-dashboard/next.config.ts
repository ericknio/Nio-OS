/**
 * @file next.config.ts
 * @description Arquivo de configuração do Next.js para o sub-projeto Cloud Dashboard (Gestão de Licenças e Revendas).
 *
 * Responsável por orquestrar a compilação, variáveis de ambiente e opções do compilador
 * para a interface administrativa em nuvem do Nio-OS.
 */

import type { NextConfig } from "next";

/**
 * Objeto de configurações do Next.js para o Cloud Dashboard.
 */
const nextConfig: NextConfig = {
  // Habilita a geração do bundle independente (.next/standalone) para deploy em Docker
  output: "standalone",
};

export default nextConfig;
