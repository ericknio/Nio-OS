/**
 * @file app/components/CardMensagem.tsx
 * @description Componente reutilizável de notificação e alertas inline (sucesso ou erro).
 * 
 * Utiliza o utilitário `mensagemEhSucesso()` para determinar automaticamente se o texto
 * reflete uma operação bem-sucedida (verde/esmeralda) ou uma falha/erro (vermelho),
 * aplicando os estilos e anéis de foco apropriados com suporte total ao Dark Mode.
 */

import { mensagemEhSucesso } from "@/lib/formatadores";

/**
 * Renderiza uma caixa de alerta estilizada para feedback de formulários e ações do usuário.
 * 
 * @param props.mensagem Texto da mensagem a ser exibida. Se nulo ou vazio, o componente não renderiza nada.
 */
export default function CardMensagem({
  mensagem,
}: {
  mensagem?: string | null;
}) {
  if (!mensagem) return null;

  return (
    <div
      className={`rounded-xl p-4 text-xs font-bold ring-1 transition-all ${
        mensagemEhSucesso(mensagem)
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30"
          : "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/30"
      }`}
    >
      {mensagem}
    </div>
  );
}
