import { mensagemEhSucesso } from "@/lib/formatadores";

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
