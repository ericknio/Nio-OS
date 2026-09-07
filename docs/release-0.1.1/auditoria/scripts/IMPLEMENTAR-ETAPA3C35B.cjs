#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const targets = {
  page: "app/ordens/[id]/page.tsx",
  orderApi: "app/api/ordens/[id]/route.ts",
  component: "app/ordens/[id]/PecasTecnicasOS.tsx",
  reversalApi:
    "app/api/ordens/[id]/pecas-tecnicas/[itemId]/estornar/route.ts",
  test: "scripts/test-estoque-tecnico/etapa3c35b-integracao-estorno.cjs",
};

function absolute(relative) {
  return path.join(root, ...relative.split("/"));
}

function readRequired(relative) {
  const file = absolute(relative);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo obrigatório não encontrado: ${relative}`);
  }
  return fs.readFileSync(file, "utf8");
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function backupAndWrite(relative, content, changed) {
  const file = absolute(relative);
  ensureDir(file);

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (current === content) {
      console.log(`[OK JÁ ATUALIZADO] ${relative}`);
      return;
    }
    const backup = `${file}.bak-3c35b-${timestamp}`;
    fs.copyFileSync(file, backup);
    console.log(`[BACKUP] ${path.basename(backup)}`);
  }

  fs.writeFileSync(file, content, "utf8");
  changed.push(relative);
  console.log(`[GRAVADO] ${relative}`);
}

function replaceOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source;
  const first = source.indexOf(oldText);
  if (first < 0) {
    throw new Error(
      `Não encontrei o ponto "${label}". Nenhum arquivo será alterado.`,
    );
  }
  if (source.indexOf(oldText, first + oldText.length) >= 0 && label !== "GET technicalParts") {
    throw new Error(
      `O ponto "${label}" apareceu mais de uma vez. Interrompido para evitar patch ambíguo.`,
    );
  }
  return source.slice(0, first) + newText + source.slice(first + oldText.length);
}

function findReversalServiceImport() {
  const directory = absolute("lib/estoqueTecnico");
  if (!fs.existsSync(directory)) {
    throw new Error("Pasta lib/estoqueTecnico não encontrada.");
  }

  const symbol = "reverseConsumedTechnicalPartManually";
  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);

  for (const name of files) {
    if (name === "index.ts") continue;
    const text = fs.readFileSync(path.join(directory, name), "utf8");
    const defines =
      new RegExp(`export\\s+(?:async\\s+)?function\\s+${symbol}\\b`).test(text) ||
      new RegExp(`export\\s+const\\s+${symbol}\\b`).test(text);

    if (defines) {
      return `@/lib/estoqueTecnico/${name.replace(/\.ts$/, "")}`;
    }
  }

  const indexFile = path.join(directory, "index.ts");
  if (fs.existsSync(indexFile)) {
    const index = fs.readFileSync(indexFile, "utf8");
    if (index.includes(symbol)) return "@/lib/estoqueTecnico";
  }

  throw new Error(
    `Não encontrei a função ${symbol} no core 3C.3.5A. ` +
      "A etapa foi interrompida antes de alterar a interface.",
  );
}

function buildOrderApi(source) {
  if (source.includes("technicalParts: {")) return source;

  const anchor = `        payments: { orderBy: { createdAt: "desc" } },
      },
    });`;

  const replacement = `        payments: { orderBy: { createdAt: "desc" } },
        technicalParts: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            technicalPartId: true,
            partNameSnapshot: true,
            partSkuSnapshot: true,
            unitPriceSnapshot: true,
            quantity: true,
            totalPriceSnapshot: true,
            state: true,
            consumedAt: true,
            reversedAt: true,
            responsibleUserNameSnapshot: true,
            technicalPart: {
              select: {
                version: true,
              },
            },
          },
        },
      },
    });`;

  const first = source.indexOf(anchor);
  if (first < 0) {
    throw new Error(
      `Não encontrei o include do GET em ${targets.orderApi}. Nenhum arquivo será alterado.`,
    );
  }

  // Só o primeiro include é o GET. O PUT mantém seu retorno atual.
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

function buildPage(source) {
  let next = source;

  next = replaceOnce(
    next,
    `import StatusRapidoOS from "./StatusRapidoOS";`,
    `import StatusRapidoOS from "./StatusRapidoOS";
import PecasTecnicasOS from "./PecasTecnicasOS";`,
    "import PecasTecnicasOS",
  );

  const typeAnchor = `  finalization: {
    id: string;
    repairDescription: string;
    replacedParts: string | null;
    finalAmount: number | string | null;
    warrantyDays: number;
    deliveredAt: string;
    deliveredBy: string;
    paymentMethod: string | null;
    finalNotes: string | null;
  } | null;

  histories: {`;

  const typeReplacement = `  finalization: {
    id: string;
    repairDescription: string;
    replacedParts: string | null;
    finalAmount: number | string | null;
    warrantyDays: number;
    deliveredAt: string;
    deliveredBy: string;
    paymentMethod: string | null;
    finalNotes: string | null;
  } | null;

  payments?: {
    id: string;
  }[];

  technicalParts?: {
    id: string;
    technicalPartId: string;
    partNameSnapshot: string;
    partSkuSnapshot: string | null;
    unitPriceSnapshot: number | string;
    quantity: number;
    totalPriceSnapshot: number | string;
    state: "RESERVED" | "CONSUMED" | "RELEASED" | "REVERSED";
    consumedAt: string | null;
    reversedAt: string | null;
    responsibleUserNameSnapshot: string;
    technicalPart: {
      version: number;
    };
  }[];

  histories: {`;

  next = replaceOnce(
    next,
    typeAnchor,
    typeReplacement,
    "tipos de peças técnicas",
  );

  const calculationAnchor = `  const podeFinalizar = osPronta && !osCancelada && !osFinalizada;
  const podeCancelar = !osCancelada && !osFinalizada;

  const historicos = ordem.histories || [];`;

  const calculationReplacement = `  const podeFinalizar = osPronta && !osCancelada && !osFinalizada;
  const podeCancelar = !osCancelada && !osFinalizada;
  const temPagamentoRegistrado =
    valorPagoOS > 0 ||
    percentualPagoOS > 0 ||
    Boolean(ordem.paymentReceivedAt) ||
    Boolean(ordem.payments?.length);

  const historicos = ordem.histories || [];`;

  next = replaceOnce(
    next,
    calculationAnchor,
    calculationReplacement,
    "bloqueio local por pagamento",
  );

  const financeAnchor = `        <Permissao precisa="ordens.ver">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">Financeiro</p>`;

  const financeReplacement = `        <Permissao precisa="ordens.ver">
          <PecasTecnicasOS
            ordemId={ordem.id}
            itens={ordem.technicalParts || []}
            podeEstornar={tem("ordens.editar")}
            bloqueadoPorPagamento={temPagamentoRegistrado}
            finalizada={osFinalizada}
            aoAlterar={carregarOrdem}
          />
        </Permissao>

        <Permissao precisa="ordens.ver">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">Financeiro</p>`;

  next = replaceOnce(
    next,
    financeAnchor,
    financeReplacement,
    "seção de peças antes do Financeiro",
  );

  return next;
}

function buildReversalApi(serviceImport) {
  return `import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exigirPermissaoApi,
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import { toFutureHttpError } from "@/lib/estoqueTecnico/errors";
import { reverseConsumedTechnicalPartManually } from "${serviceImport}";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    itemId: string;
  }>;
};

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeOperador(usuario: UsuarioSessao | null | undefined) {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

function json(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(extraHeaders || {}),
    },
  });
}

function origemPermitida(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function idempotencyKey(request: Request) {
  const value = request.headers.get("Idempotency-Key")?.trim() || "";
  return UUID_PATTERN.test(value) ? value : null;
}

function validarPayload(body: Record<string, unknown>) {
  const allowed = new Set([
    "technicalPartVersion",
    "expectedQuantity",
    "physicalReturnConfirmed",
    "confirmation",
    "reason",
  ]);

  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return "O payload contém campos não permitidos para estorno.";
  }

  if (
    !Number.isInteger(body.technicalPartVersion) ||
    Number(body.technicalPartVersion) < 0
  ) {
    return "A versão da peça técnica é inválida.";
  }

  if (
    !Number.isInteger(body.expectedQuantity) ||
    Number(body.expectedQuantity) <= 0
  ) {
    return "A quantidade esperada é inválida.";
  }

  if (body.physicalReturnConfirmed !== true) {
    return "Confirme que a peça retornou fisicamente ao estoque.";
  }

  if (body.confirmation !== true) {
    return "Confirme o estorno manual da peça.";
  }

  if (typeof body.reason !== "string") {
    return "Informe o motivo do estorno.";
  }

  const reason = body.reason.trim();
  if (reason.length < 10) return "Descreva melhor o motivo do estorno.";
  if (reason.length > 1000) {
    return "O motivo deve ter no máximo 1000 caracteres.";
  }

  return null;
}

function estoqueError(error: unknown) {
  const mapped = toFutureHttpError(error);
  return json(
    mapped.body,
    mapped.status,
    mapped.body.retryable ? { "Retry-After": "1" } : undefined,
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("ordens.editar");
    if (!acesso.ok) return acesso.response;

    if (!origemPermitida(request)) {
      return json(
        {
          code: "PERMISSION_DENIED",
          message: "Origem da requisição não permitida.",
        },
        403,
      );
    }

    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: "Content-Type application/json é obrigatório.",
        },
        422,
      );
    }

    const key = idempotencyKey(request);
    if (!key) {
      return json(
        {
          code: "IDEMPOTENCY_KEY_INVALID",
          message: "Idempotency-Key UUID válido é obrigatório.",
        },
        422,
      );
    }

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos para estornar a peça.",
        },
        422,
      );
    }

    const validationMessage = validarPayload(body);
    if (validationMessage) {
      return json(
        {
          code: "VALIDATION_ERROR",
          message: validationMessage,
        },
        422,
      );
    }

    const { id, itemId } = await context.params;

    // Segurança de recurso: itemId precisa pertencer à OS presente na própria URL.
    // A mutação real continua sendo executada exclusivamente pelo core transacional.
    const scopedItem = await prisma.serviceOrderPart.findFirst({
      where: {
        id: itemId,
        serviceOrderId: id,
      },
      select: {
        id: true,
      },
    });

    if (!scopedItem) {
      return json(
        {
          code: "SERVICE_ORDER_PART_NOT_FOUND",
          message: "O item técnico não foi encontrado nesta OS.",
        },
        404,
      );
    }

    try {
      const result = reverseConsumedTechnicalPartManually(
        itemId,
        {
          technicalPartVersion: Number(body.technicalPartVersion),
          expectedQuantity: Number(body.expectedQuantity),
          physicalReturnConfirmed: true,
          confirmation: true,
          reason: String(body.reason).trim(),
        },
        {
          operatorId: acesso.usuario.id || null,
          operatorName: nomeOperador(acesso.usuario),
          canViewFinancialData:
            usuarioPodeVerDadosFinanceirosSensiveis(acesso.usuario),
          idempotencyKey: key,
        },
      );

      return json(result);
    } catch (error) {
      return estoqueError(error);
    }
  } catch {
    return json(
      {
        code: "INTERNAL_ERROR",
        message: "Erro ao estornar peça técnica.",
      },
      500,
    );
  }
}
`;
}

const component = `"use client";

import { useRef, useState } from "react";

type PecaTecnicaOS = {
  id: string;
  technicalPartId: string;
  partNameSnapshot: string;
  partSkuSnapshot: string | null;
  unitPriceSnapshot: number | string;
  quantity: number;
  totalPriceSnapshot: number | string;
  state: "RESERVED" | "CONSUMED" | "RELEASED" | "REVERSED";
  consumedAt: string | null;
  reversedAt: string | null;
  responsibleUserNameSnapshot: string;
  technicalPart: {
    version: number;
  };
};

type TentativaEstorno = {
  key: string;
  itemId: string;
  technicalPartVersion: number;
  expectedQuantity: number;
  reason: string;
};

type Props = {
  ordemId: string;
  itens: PecaTecnicaOS[];
  podeEstornar: boolean;
  bloqueadoPorPagamento: boolean;
  finalizada: boolean;
  aoAlterar: () => Promise<void> | void;
};

const nomesEstado: Record<PecaTecnicaOS["state"], string> = {
  RESERVED: "Reservada",
  CONSUMED: "Consumida",
  RELEASED: "Liberada",
  REVERSED: "Estornada",
};

function moeda(valor: unknown) {
  const numero = Number(valor ?? 0);
  return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataHora(valor?: string | null) {
  if (!valor) return "-";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "-" : data.toLocaleString("pt-BR");
}

function classeEstado(estado: PecaTecnicaOS["state"]) {
  if (estado === "CONSUMED") {
    return "bg-orange-50 text-orange-700 ring-orange-200";
  }
  if (estado === "REVERSED") {
    return "bg-green-50 text-green-700 ring-green-200";
  }
  if (estado === "RELEASED") {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }
  return "bg-blue-50 text-blue-700 ring-blue-200";
}

export default function PecasTecnicasOS({
  ordemId,
  itens,
  podeEstornar,
  bloqueadoPorPagamento,
  finalizada,
  aoAlterar,
}: Props) {
  const [selecionada, setSelecionada] = useState<PecaTecnicaOS | null>(null);
  const [motivo, setMotivo] = useState("");
  const [retornoFisico, setRetornoFisico] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const requestLock = useRef(false);
  const tentativaRef = useRef<TentativaEstorno | null>(null);

  const consumidas = itens.filter((item) => item.state === "CONSUMED").length;

  function abrirEstorno(item: PecaTecnicaOS) {
    tentativaRef.current = null;
    setSelecionada(item);
    setMotivo("");
    setRetornoFisico(false);
    setMensagem("");
  }

  function fecharEstorno() {
    if (salvando) return;
    tentativaRef.current = null;
    setSelecionada(null);
    setMotivo("");
    setRetornoFisico(false);
    setMensagem("");
  }

  async function confirmarEstorno() {
    if (!selecionada || requestLock.current) return;

    const reason = motivo.trim();
    if (reason.length < 10) {
      setMensagem("Descreva melhor o motivo do estorno.");
      return;
    }
    if (reason.length > 1000) {
      setMensagem("O motivo deve ter no máximo 1000 caracteres.");
      return;
    }
    if (!retornoFisico) {
      setMensagem("Confirme que a peça retornou fisicamente ao estoque.");
      return;
    }

    const confirmou = window.confirm(
      \`Confirma o estorno de \${selecionada.quantity} unidade(s) de "\${selecionada.partNameSnapshot}"? A peça será devolvida fisicamente ao estoque.\`,
    );
    if (!confirmou) return;

    let tentativa = tentativaRef.current;
    const version = selecionada.technicalPart.version;

    if (
      !tentativa ||
      tentativa.itemId !== selecionada.id ||
      tentativa.technicalPartVersion !== version ||
      tentativa.expectedQuantity !== selecionada.quantity ||
      tentativa.reason !== reason
    ) {
      if (
        !globalThis.crypto ||
        typeof globalThis.crypto.randomUUID !== "function"
      ) {
        setMensagem(
          "Não foi possível iniciar o estorno com segurança. Recarregue a página.",
        );
        return;
      }

      tentativa = {
        key: globalThis.crypto.randomUUID(),
        itemId: selecionada.id,
        technicalPartVersion: version,
        expectedQuantity: selecionada.quantity,
        reason,
      };
      tentativaRef.current = tentativa;
    }

    requestLock.current = true;
    setSalvando(true);
    setMensagem("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(
        \`/api/ordens/\${ordemId}/pecas-tecnicas/\${tentativa.itemId}/estornar\`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": tentativa.key,
          },
          body: JSON.stringify({
            technicalPartVersion: tentativa.technicalPartVersion,
            expectedQuantity: tentativa.expectedQuantity,
            physicalReturnConfirmed: true,
            confirmation: true,
            reason: tentativa.reason,
          }),
          signal: controller.signal,
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const message = data?.message || "Erro ao estornar peça.";

        // Resultado de escrita pode ter ficado incerto em erro de rede/5xx.
        // A tentativa é preservada para que o retry use a MESMA chave e payload.
        if (response.status >= 500) {
          setMensagem(
            \`\${message} Tente novamente; a mesma tentativa segura será reutilizada.\`,
          );
          return;
        }

        tentativaRef.current = null;
        if (response.status === 409) await aoAlterar();
        setMensagem(message);
        return;
      }

      tentativaRef.current = null;
      setSelecionada(null);
      setMotivo("");
      setRetornoFisico(false);
      await aoAlterar();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMensagem(
          "A resposta demorou mais que o esperado. Tente novamente; a mesma tentativa segura será reutilizada.",
        );
        return;
      }

      setMensagem(
        "Não foi possível confirmar a resposta do servidor. Tente novamente; a mesma tentativa segura será reutilizada.",
      );
    } finally {
      window.clearTimeout(timeout);
      requestLock.current = false;
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-600">Estoque técnico</p>
          <h2 className="text-2xl font-black tracking-tight">
            Peças vinculadas à OS
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            Peças consumidas só voltam ao estoque por estorno manual após
            conferência do retorno físico.
          </p>
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
          {itens.length} item(ns) • {consumidas} consumido(s)
        </span>
      </div>

      {mensagem && (
        <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-200">
          {mensagem}
        </div>
      )}

      {itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
          Nenhuma peça técnica vinculada a esta OS.
        </div>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => {
            const podeEstornarItem =
              item.state === "CONSUMED" &&
              podeEstornar &&
              !bloqueadoPorPagamento &&
              !finalizada;

            return (
              <article
                key={item.id}
                className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-950">
                        {item.partNameSnapshot}
                      </strong>
                      <span
                        className={\`rounded-full px-2.5 py-1 text-xs font-black ring-1 \${classeEstado(item.state)}\`}
                      >
                        {nomesEstado[item.state]}
                      </span>
                    </div>

                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      SKU: {item.partSkuSnapshot || "-"} • Quantidade:{" "}
                      {item.quantity} • Unitário: {moeda(item.unitPriceSnapshot)}{" "}
                      • Subtotal: {moeda(item.totalPriceSnapshot)}
                    </p>

                    {item.state === "CONSUMED" && (
                      <p className="mt-1 text-xs font-semibold text-orange-700">
                        Consumida em {dataHora(item.consumedAt)}
                      </p>
                    )}

                    {item.state === "REVERSED" && (
                      <p className="mt-1 text-xs font-semibold text-green-700">
                        Estornada em {dataHora(item.reversedAt)}
                      </p>
                    )}
                  </div>

                  {item.state === "CONSUMED" && (
                    <button
                      type="button"
                      disabled={!podeEstornarItem || salvando}
                      onClick={() => abrirEstorno(item)}
                      className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Estornar peça
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {bloqueadoPorPagamento && consumidas > 0 && (
        <p className="mt-4 rounded-2xl bg-yellow-50 p-4 text-sm font-bold text-yellow-800 ring-1 ring-yellow-200">
          Esta OS possui pagamento registrado. O estorno técnico fica bloqueado
          para não alterar valores já consolidados.
        </p>
      )}

      {selecionada && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-sm font-black text-orange-800">
            Estorno manual: {selecionada.partNameSnapshot}
          </p>

          <p className="mt-1 text-sm font-semibold leading-6 text-orange-700">
            O estorno é integral para este item: {selecionada.quantity}{" "}
            unidade(s). Confirme somente depois de conferir fisicamente a peça.
          </p>

          <label className="mt-4 block text-sm font-black text-slate-700">
            Motivo do estorno *
          </label>
          <textarea
            value={motivo}
            maxLength={1000}
            rows={4}
            disabled={salvando}
            onChange={(event) => {
              setMotivo(event.target.value);
              tentativaRef.current = null;
              setMensagem("");
            }}
            className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100"
            placeholder="Ex.: peça retirada do aparelho e devolvida fisicamente ao estoque após cancelamento."
          />

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-orange-200">
            <input
              type="checkbox"
              checked={retornoFisico}
              disabled={salvando}
              onChange={(event) => {
                setRetornoFisico(event.target.checked);
                if (!event.target.checked) tentativaRef.current = null;
                setMensagem("");
              }}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm font-bold leading-6 text-slate-800">
              Confirmo que a peça retornou fisicamente ao estoque e foi
              conferida.
            </span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={salvando || !retornoFisico || motivo.trim().length < 10}
              onClick={confirmarEstorno}
              className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando ? "Estornando..." : "Confirmar estorno"}
            </button>

            <button
              type="button"
              disabled={salvando}
              onClick={fecharEstorno}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
`;

const integrationTest = `#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const orderApi = read("app/api/ordens/[id]/route.ts");
const reversalApi = read(
  "app/api/ordens/[id]/pecas-tecnicas/[itemId]/estornar/route.ts",
);
const page = read("app/ordens/[id]/page.tsx");
const component = read("app/ordens/[id]/PecasTecnicasOS.tsx");

let assertions = 0;
function check(fn) {
  fn();
  assertions += 1;
}

check(() => assert.match(orderApi, /technicalParts:\\s*\\{/));
check(() => assert.match(orderApi, /partNameSnapshot:\\s*true/));
check(() => assert.match(orderApi, /partSkuSnapshot:\\s*true/));
check(() => assert.match(orderApi, /unitPriceSnapshot:\\s*true/));
check(() => assert.match(orderApi, /totalPriceSnapshot:\\s*true/));
check(() => assert.match(orderApi, /technicalPart:\\s*\\{[\\s\\S]*?version:\\s*true/));
check(() => assert.doesNotMatch(orderApi, /unitCostSnapshot:\\s*true/));
check(() => assert.doesNotMatch(orderApi, /totalCostSnapshot:\\s*true/));
check(() => assert.doesNotMatch(orderApi, /currentCostPrice:\\s*true/));

check(() => assert.match(reversalApi, /exigirPermissaoApi\\("ordens\\.editar"\\)/));
check(() => assert.match(reversalApi, /reverseConsumedTechnicalPartManually/));
check(() => assert.match(reversalApi, /Idempotency-Key/));
check(() => assert.match(reversalApi, /UUID_PATTERN/));
check(() => assert.match(reversalApi, /origemPermitida/));
check(() => assert.match(reversalApi, /serviceOrderId:\\s*id/));
check(() => assert.match(reversalApi, /id:\\s*itemId/));
check(() => assert.match(reversalApi, /physicalReturnConfirmed:\\s*true/));
check(() => assert.match(reversalApi, /confirmation:\\s*true/));
check(() => assert.match(reversalApi, /usuarioPodeVerDadosFinanceirosSensiveis/));
check(() => assert.match(reversalApi, /operatorId:\\s*acesso\\.usuario\\.id\\s*\\|\\|\\s*null/));
check(() => assert.match(reversalApi, /Cache-Control/));
check(() => assert.match(reversalApi, /Retry-After/));
check(() => assert.doesNotMatch(reversalApi, /\\.update\\s*\\(\\s*\\{/));
check(() => assert.doesNotMatch(reversalApi, /console\\.(?:log|warn|error)\\s*\\(/));

check(() => assert.match(component, /useRef/));
check(() => assert.match(component, /requestLock\\.current/));
check(() => assert.match(component, /globalThis\\.crypto\\.randomUUID\\(\\)/));
check(() => assert.doesNotMatch(component, /Math\\.random/));
check(() => assert.match(component, /"Idempotency-Key":\\s*tentativa\\.key/));
check(() => assert.match(component, /AbortController/));
check(() => assert.match(component, /30_000/));
check(() => assert.match(component, /technicalPartVersion:\\s*tentativa\\.technicalPartVersion/));
check(() => assert.match(component, /expectedQuantity:\\s*tentativa\\.expectedQuantity/));
check(() => assert.match(component, /physicalReturnConfirmed:\\s*true/));
check(() => assert.match(component, /confirmation:\\s*true/));
check(() => assert.match(component, /maxLength=\\{1000\\}/));
check(() => assert.match(component, /retornou fisicamente ao estoque/i));
check(() => assert.doesNotMatch(component, /localStorage|sessionStorage/));
check(() => assert.doesNotMatch(component, /console\\.(?:log|warn|error)\\s*\\(/));

check(() => assert.match(page, /import PecasTecnicasOS/));
check(() => assert.match(page, /itens=\\{ordem\\.technicalParts \\|\\| \\[\\]\\}/));
check(() => assert.match(page, /podeEstornar=\\{tem\\("ordens\\.editar"\\)\\}/));
check(() => assert.match(page, /bloqueadoPorPagamento=\\{temPagamentoRegistrado\\}/));
check(() => assert.match(page, /Boolean\\(ordem\\.payments\\?\\.length\\)/));
check(() => assert.match(page, /aoAlterar=\\{carregarOrdem\\}/));

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\\n");
`;

function main() {
  // Todas as leituras/validações são feitas antes de qualquer escrita.
  const pageOriginal = readRequired(targets.page);
  const orderApiOriginal = readRequired(targets.orderApi);
  readRequired("lib/permissaoApi.ts");

  if (!pageOriginal.includes('import StatusRapidoOS from "./StatusRapidoOS";') &&
      !pageOriginal.includes('import PecasTecnicasOS from "./PecasTecnicasOS";')) {
    throw new Error(
      `Estrutura inesperada em ${targets.page}. Nenhum arquivo será alterado.`,
    );
  }

  if (!orderApiOriginal.includes('exigirPermissaoApi("ordens.ver")')) {
    throw new Error(
      `Estrutura inesperada em ${targets.orderApi}. Nenhum arquivo será alterado.`,
    );
  }

  const serviceImport = findReversalServiceImport();
  const pageNext = buildPage(pageOriginal);
  const orderApiNext = buildOrderApi(orderApiOriginal);
  const reversalApi = buildReversalApi(serviceImport);

  const changed = [];
  backupAndWrite(targets.orderApi, orderApiNext, changed);
  backupAndWrite(targets.page, pageNext, changed);
  backupAndWrite(targets.component, component, changed);
  backupAndWrite(targets.reversalApi, reversalApi, changed);
  backupAndWrite(targets.test, integrationTest, changed);

  console.log(
    JSON.stringify({
      ok: true,
      stage: "3C.3.5B",
      changed,
      reversalServiceImport: serviceImport,
      databaseChanged: false,
      schemaChanged: false,
      coreTransactionChanged: false,
    }),
  );
}

main();
