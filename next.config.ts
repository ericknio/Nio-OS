/**
 * @file next.config.ts
 * @description Arquivo central de configuração do framework Next.js para o Nio-OS.
 *
 * Configurações Principais:
 * 1. `output: "standalone"`: Gera um bundle auto-contido contendo apenas os arquivos e dependências estritamente
 *    necessários para execução, ideal para empacotamento em executáveis desktop (Electron/Tauri) ou containers Docker.
 * 2. `serverExternalPackages: ["pdfkit"]`: Mantém a biblioteca `pdfkit` isolada do empacotador webpack para evitar
 *    falhas com streams binários nativos e arquivos AFM de fontes Helvetica em runtime Node.js.
 * 3. `rewrites`: Mapeia requisições da rota pública `/uploads/:path*` para o endpoint dinâmico `/api/runtime/uploads/:path*`,
 *    permitindo que fotos de produtos e logomarcas salvas em tempo de execução sejam servidas sem reconstrução do build estático.
 */

import type { NextConfig } from "next";

/**
 * Objeto de configuração do Next.js.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit"],
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/uploads/:path*",
          destination: "/api/runtime/uploads/:path*",
        },
      ],
    };
  },
};

export default nextConfig;

