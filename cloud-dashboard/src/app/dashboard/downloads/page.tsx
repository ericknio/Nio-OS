/**
 * @file page.tsx
 * @description Rota de redirecionamento (/dashboard/downloads -> /dashboard/download).
 * Garante que revendedores que acessem o caminho no plural sejam automaticamente encaminhados
 * para a tela oficial de download da Release.
 *
 * @module CloudDashboard/App/Dashboard/Downloads/Redirect
 */

import { redirect } from "next/navigation";

/**
 * Redireciona requisições de /dashboard/downloads para /dashboard/download.
 */
export default function DownloadsRedirectPage() {
  redirect("/dashboard/download");
}
