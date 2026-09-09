/**
 * @file app/ordens/[id]/WhatsAppOS.tsx
 * @description Componente de Envio Rápido de Mensagens via WhatsApp para o Cliente.
 * 
 * Funcionalidades:
 * - Sanitização automática do telefone do cliente para o padrão internacional DDI 55 (Brasil).
 * - Modelos de mensagens dinâmicos: Boas-vindas/Inicial, Orçamento Pronto, Aguardando Peça, Aparelho Pronto e Cobrança.
 * - Pré-visualização e edição livre do texto antes do envio.
 * - Abertura direta do WhatsApp Web ou App via deep link `https://wa.me/`.
 */

"use client";

import { useEffect, useState } from "react";

type WhatsAppOSProps = {
  clienteNome?: string | null;
  whatsapp?: string | null;
  numeroOS?: string | number | null;
  equipamento?: string | null;
  valorTotal?: number | string | null;
};

const modelos = [
  { value: "inicial", label: "Mensagem inicial" },
  { value: "orcamento", label: "Orçamento pronto" },
  { value: "aguardando_peca", label: "Aguardando peça" },
  { value: "pronto", label: "OS pronta para retirada" },
  { value: "pagamento", label: "Cobrança / pagamento" },
];

function somenteNumeros(valor?: string | null) {
  return String(valor || "").replace(/\D/g, "");
}

function montarNumeroWhatsApp(numero?: string | null) {
  let limpo = somenteNumeros(numero);

  if (!limpo) return "";

  if (limpo.startsWith("0")) {
    limpo = limpo.replace(/^0+/, "");
  }

  if (limpo.startsWith("55")) {
    return limpo;
  }

  if (limpo.length === 10 || limpo.length === 11) {
    return `55${limpo}`;
  }

  return limpo;
}

function formatarMoeda(valor?: number | string | null) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function criarMensagem({
  tipo,
  clienteNome,
  numeroOS,
  equipamento,
  valorTotal,
}: {
  tipo: string;
  clienteNome?: string | null;
  numeroOS?: string | number | null;
  equipamento?: string | null;
  valorTotal?: number | string | null;
}) {
  const nome = clienteNome || "cliente";
  const os = numeroOS || "";
  const item = equipamento || "equipamento";

  if (tipo === "orcamento") {
    return `Olá, ${nome}. Tudo bem?

Seu orçamento da Ordem de Serviço Nº ${os} já está pronto.

Equipamento: ${item}
Valor total: ${formatarMoeda(valorTotal)}

Podemos seguir com o serviço?`;
  }

  if (tipo === "aguardando_peca") {
    return `Olá, ${nome}. Tudo bem?

Estamos entrando em contato sobre sua Ordem de Serviço Nº ${os}.

O serviço está aguardando peça para continuidade. Assim que a peça estiver disponível, avisaremos você.`;
  }

  if (tipo === "pronto") {
    return `Olá, ${nome}. Tudo bem?

Sua Ordem de Serviço Nº ${os} está pronta para retirada.

Equipamento: ${item}

Pode passar na assistência para retirar o aparelho.`;
  }

  if (tipo === "pagamento") {
    return `Olá, ${nome}. Tudo bem?

Estamos entrando em contato sobre o pagamento da Ordem de Serviço Nº ${os}.

Valor total: ${formatarMoeda(valorTotal)}

Qualquer dúvida, estamos à disposição.`;
  }

  return `Olá, ${nome}. Tudo bem?

Aqui é da assistência técnica. Estou entrando em contato sobre sua Ordem de Serviço Nº ${os}.

Equipamento: ${item}.`;
}

/**
 * Componente que renderiza a caixa de disparo rápido de WhatsApp da O.S.
 * 
 * @param props - Dados do cliente, número da O.S., equipamento e valor total
 */
export default function WhatsAppOS({
  clienteNome,
  whatsapp,
  numeroOS,
  equipamento,
  valorTotal,
}: WhatsAppOSProps) {
  const [tipoMensagem, setTipoMensagem] = useState("inicial");
  const [mensagemPersonalizada, setMensagemPersonalizada] = useState("");

  useEffect(() => {
  const mensagem = criarMensagem({
    tipo: tipoMensagem,
    clienteNome,
    numeroOS,
    equipamento,
    valorTotal,
  });

  setMensagemPersonalizada(mensagem);
}, [tipoMensagem, clienteNome, numeroOS, equipamento, valorTotal]);

  function abrirWhatsApp() {
  const numero = montarNumeroWhatsApp(whatsapp);

  if (!numero) {
    alert("Cliente não possui WhatsApp válido cadastrado.");
    return;
  }

  const mensagemFinal = mensagemPersonalizada.trim();

  if (!mensagemFinal) {
    alert("Digite uma mensagem antes de enviar.");
    return;
  }

  const link = `https://wa.me/${numero}?text=${encodeURIComponent(
    mensagemFinal
  )}`;

  window.open(link, "_blank");
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          WhatsApp do cliente
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Envie mensagens prontas para o cliente sobre esta OS.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <select
            value={tipoMensagem}
            onChange={(e) => setTipoMensagem(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 md:max-w-xs"
         >
            {modelos.map((modelo) => (
              <option key={modelo.value} value={modelo.value}>
                {modelo.label}
              </option>
            ))}
         </select>

         <button
            type="button"
           onClick={() => {
             const mensagem = criarMensagem({
               tipo: tipoMensagem,
               clienteNome,
               numeroOS,
               equipamento,
               valorTotal,
             });

             setMensagemPersonalizada(mensagem);
           }}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50"
          >
            Restaurar modelo
          </button>
       </div>

       <textarea
          value={mensagemPersonalizada}
         onChange={(e) => setMensagemPersonalizada(e.target.value)}
          rows={7}
          className="w-full resize-none rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          placeholder="Edite a mensagem antes de enviar..."
       />

       <button
         type="button"
         onClick={abrirWhatsApp}
         className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
       >
         Enviar pelo WhatsApp
       </button>
      </div>
    </section>
  );
}