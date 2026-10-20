/**
 * @file app/estoque-tecnico/page.tsx
 * @description Tela de Gestão de Estoque Técnico e Peças de Reparo (Frontend).
 * 
 * Funcionalidades:
 * - Cadastro e catálogo de peças técnicas, componentes e insumos de bancada.
 * - Controle triplo de saldo: Físico (em mãos), Reservado (em O.S. abertas) e Disponível.
 * - Suporte a componentes de estoque controlado vs. insumos de estoque ilimitado (ex: solda, pasta térmica).
 * - Histórico completo de auditoria e movimentações por peça (entradas, saídas, consumos e estornos).
 * - Ajustes manuais de estoque com exigência de motivo auditável e controle de idempotência.
 * - Filtros rápidos por status de alerta (estoque baixo, zerado, inativo).
 */

"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useUsuarioPermissoes } from "@/app/Permissao";

type TechnicalPart = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  brand: string | null;
  compatibleModel: string | null;
  description: string | null;
  location: string | null;
  notes: string | null;
  quantityOnHand: number | null;
  quantityReserved: number;
  quantityAvailable: number | null;
  minStock: number;
  currentCostPrice?: number;
  defaultSalePrice: number;
  isActive: boolean;
  isUnlimited: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type Movement = {
  id: string;
  technicalPartId: string;
  serviceOrderPartId: string | null;
  type: string;
  quantity: number;
  onHandBefore: number | null;
  onHandAfter: number | null;
  reservedBefore: number;
  reservedAfter: number;
  unitCostSnapshot?: number | null;
  reason: string | null;
  operatorNameSnapshot: string;
  createdAt: string;
};

type ListResponse = {
  items?: TechnicalPart[];
  total?: number;
  page?: number;
  pageSize?: number;
  message?: string;
};

type MovementResponse = {
  items?: Movement[];
  total?: number;
  page?: number;
  pageSize?: number;
  message?: string;
};

type CommandResponse = {
  part?: TechnicalPart;
  movement?: Movement;
  idempotentReplay?: boolean;
  message?: string;
};

type PartForm = {
  name: string;
  sku: string;
  category: string;
  brand: string;
  compatibleModel: string;
  description: string;
  location: string;
  notes: string;
  minStock: string;
  currentCostPrice: string;
  defaultSalePrice: string;
  unlimitedStock: boolean;
  initialQuantity: string;
};

type PendingWrite = {
  fingerprint: string;
  body: string;
  key: string;
};

const inputClass =
  "w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 disabled:text-slate-500 dark:text-slate-400";

const emptyForm: PartForm = {
  name: "",
  sku: "",
  category: "",
  brand: "",
  compatibleModel: "",
  description: "",
  location: "",
  notes: "",
  minStock: "0",
  currentCostPrice: "",
  defaultSalePrice: "0",
  unlimitedStock: false,
  initialQuantity: "0",
};

const movementLabels: Record<string, string> = {
  ENTRY: "Entrada",
  POSITIVE_ADJUSTMENT: "Ajuste positivo",
  NEGATIVE_ADJUSTMENT: "Ajuste negativo",
  RESERVATION: "Reserva em OS",
  RESERVATION_INCREASE: "Aumento de reserva",
  RESERVATION_DECREASE: "Redução de reserva",
  RELEASE: "Liberação de reserva",
  CONSUMPTION: "Consumo em OS",
  STOCK_MODE_CHANGE: "Mudança de modo",
  MANUAL_REVERSAL: "Estorno manual",
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return numberValue(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function stockText(part: TechnicalPart) {
  return part.quantityOnHand === null
    ? "Ilimitado"
    : `${part.quantityAvailable ?? 0} disp. / ${part.quantityOnHand} físico`;
}

function formFromPart(part: TechnicalPart): PartForm {
  return {
    name: part.name,
    sku: part.sku || "",
    category: part.category || "",
    brand: part.brand || "",
    compatibleModel: part.compatibleModel || "",
    description: part.description || "",
    location: part.location || "",
    notes: part.notes || "",
    minStock: String(part.minStock ?? 0),
    currentCostPrice:
      part.currentCostPrice === undefined ? "" : String(part.currentCostPrice),
    defaultSalePrice: String(part.defaultSalePrice ?? 0),
    unlimitedStock: part.quantityOnHand === null,
    initialQuantity:
      part.quantityOnHand === null ? "0" : String(part.quantityOnHand),
  };
}

function nonNegativeInteger(value: string, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} deve ser um número inteiro igual ou maior que zero.`);
  }
  return parsed;
}

function positiveInteger(value: string, field: string) {
  const parsed = nonNegativeInteger(value, field);
  if (parsed <= 0) throw new Error(`${field} deve ser maior que zero.`);
  return parsed;
}

function nonNegativeMoney(value: string, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} deve ser um valor igual ou maior que zero.`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function statusBadge(part: TechnicalPart) {
  if (!part.isActive) return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30";
  if (part.quantityOnHand === null) {
    return "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30";
  }
  if ((part.quantityAvailable ?? 0) === 0) {
    return "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30";
  }
  if (part.minStock > 0 && (part.quantityAvailable ?? 0) < part.minStock) {
    return "bg-orange-50 text-orange-700 dark:text-orange-400 dark:bg-orange-900/30 dark:text-orange-400 ring-orange-200 dark:ring-orange-500/30";
  }
  return "bg-blue-50 text-blue-700 dark:text-blue-400 dark:bg-blue-900/30 dark:text-blue-400 ring-blue-200 dark:ring-blue-500/30";
}

function Card({
  title,
  value,
  detail,
}: {
  title: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{title}</p>
      <strong className="mt-2 block text-2xl font-black text-slate-950 dark:text-slate-100">
        {value}
      </strong>
      {detail && (
        <div className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{detail}</div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-black text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Componente principal da Tela de Estoque Técnico.
 * 
 * Gerencia a listagem paginada de componentes técnicos, busca facetada por
 * marca/modelo/categoria, operações de entrada/saída com chave de idempotência
 * e visualização da trilha de auditoria e movimentos em tempo real.
 */
export default function EstoqueTecnicoPage() {
  const { carregando: carregandoPermissoes, tem } = useUsuarioPermissoes();

  const podeVer = !carregandoPermissoes && tem("estoque.ver");
  const podeAjustar = !carregandoPermissoes && tem("estoque.ajustar");
  const podeVerFinanceiro =
    !carregandoPermissoes && tem("relatorios.financeiro");

  const [items, setItems] = useState<TechnicalPart[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TechnicalPart | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [movementPage, setMovementPage] = useState(1);

  const [q, setQ] = useState("");
  const [active, setActive] = useState("all");
  const [mode, setMode] = useState("all");
  const [alert, setAlert] = useState("all");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState("name_asc");

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<PartForm>(emptyForm);

  const [movementOperation, setMovementOperation] = useState("ENTRY");
  const [movementQuantity, setMovementQuantity] = useState("1");
  const [movementReason, setMovementReason] = useState("");
  const [movementUnitCost, setMovementUnitCost] = useState("");

  const [adminOperation, setAdminOperation] = useState("");
  const [adminReason, setAdminReason] = useState("");
  const [controlledQuantity, setControlledQuantity] = useState("0");

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const writeLock = useRef(false);
  const pendingWrite = useRef<PendingWrite | null>(null);

  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const selectedSummary = useMemo(() => {
    if (!selected) return null;
    return {
      reserved: selected.quantityReserved,
      available:
        selected.quantityOnHand === null ? "∞" : selected.quantityAvailable ?? 0,
      mode: selected.quantityOnHand === null ? "Ilimitado" : "Controlado",
    };
  }, [selected]);

  function listQuery(targetPage = page) {
    const params = new URLSearchParams({
      page: String(targetPage),
      pageSize: String(pageSize),
      sort,
    });

    if (q.trim()) params.set("q", q.trim());
    if (active !== "all") params.set("active", active);
    if (mode === "unlimited") params.set("unlimited", "true");
    if (mode === "controlled") params.set("unlimited", "false");
    if (alert === "out") params.set("outOfStock", "true");
    if (alert === "below") params.set("belowMin", "true");
    if (category.trim()) params.set("category", category.trim());
    if (brand.trim()) params.set("brand", brand.trim());

    return params.toString();
  }

  async function loadList(targetPage = 1, queryOverride?: string) {
    try {
      setLoading(true);
      setMessage("");

      const query = queryOverride ?? listQuery(targetPage);
      const response = await fetch(`/api/estoque-tecnico?${query}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as ListResponse | null;

      if (!response.ok) {
        setItems([]);
        setTotal(0);
        setMessage(data?.message || "Erro ao carregar o estoque técnico.");
        return;
      }

      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(numberValue(data?.total));
      setPage(numberValue(data?.page) || targetPage);
    } catch {
      setItems([]);
      setTotal(0);
      setMessage("Erro ao carregar o estoque técnico.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMovements(partId: string, targetPage = 1, append = false) {
    try {
      const response = await fetch(
        `/api/estoque-tecnico/${partId}/movimentos?page=${targetPage}&pageSize=50`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      );
      const data = (await response.json().catch(() => null)) as
        | MovementResponse
        | null;

      if (!response.ok) {
        setMessage(data?.message || "Erro ao carregar movimentações.");
        if (!append) setMovements([]);
        return;
      }

      const next = Array.isArray(data?.items) ? data.items : [];
      setMovements((current) => (append ? [...current, ...next] : next));
      setMovementTotal(numberValue(data?.total));
      setMovementPage(numberValue(data?.page) || targetPage);
    } catch {
      setMessage("Erro ao carregar movimentações.");
      if (!append) setMovements([]);
    }
  }

  async function selectPart(partId: string) {
    try {
      setLoadingDetail(true);

      const response = await fetch(`/api/estoque-tecnico/${partId}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => null)) as
        | TechnicalPart
        | { message?: string }
        | null;

      if (!response.ok || !data || !("id" in data)) {
        setMessage(
          (data && "message" in data && data.message) ||
            "Erro ao carregar a peça técnica.",
        );
        return;
      }

      setSelected(data);
      setFormMode(null);
      setAdminOperation("");
      setAdminReason("");
      setMovementReason("");
      setMovementQuantity("1");
      setMovementUnitCost("");
      await loadMovements(data.id, 1);
    } catch {
      setMessage("Erro ao carregar a peça técnica.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function secureWrite(
    url: string,
    method: "POST" | "PATCH",
    fingerprint: string,
    payload: unknown,
  ): Promise<{ ok: boolean; data: CommandResponse | null }> {
    if (writeLock.current) return { ok: false, data: null };

    const body = JSON.stringify(payload);
    let pending = pendingWrite.current;

    if (
      !pending ||
      pending.fingerprint !== fingerprint ||
      pending.body !== body
    ) {
      if (!globalThis.crypto?.randomUUID) {
        setMessage(
          "Não foi possível iniciar a operação com segurança. Recarregue a página.",
        );
        return { ok: false, data: null };
      }

      pending = {
        fingerprint,
        body,
        key: globalThis.crypto.randomUUID(),
      };
      pendingWrite.current = pending;
    }

    writeLock.current = true;
    setSaving(true);
    setMessage("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.key,
        },
        body: pending.body,
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as
        | CommandResponse
        | null;

      if (!response.ok) {
        if (response.status < 500) pendingWrite.current = null;

        if (response.status === 409 && selected) {
          await Promise.all([selectPart(selected.id), loadList(page)]);
        }

        setMessage(
          response.status >= 500
            ? `${data?.message || "Falha temporária."} Tente novamente sem alterar os dados; a mesma tentativa segura será reutilizada.`
            : data?.message || "Não foi possível concluir a operação.",
        );
        return { ok: false, data };
      }

      pendingWrite.current = null;
      return { ok: true, data };
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "A resposta demorou mais que o esperado. Tente novamente sem alterar os dados; a mesma tentativa segura será reutilizada."
          : "Não foi possível confirmar a resposta do servidor. Tente novamente sem alterar os dados; a mesma tentativa segura será reutilizada.",
      );
      return { ok: false, data: null };
    } finally {
      window.clearTimeout(timeout);
      writeLock.current = false;
      setSaving(false);
    }
  }

  async function refreshAfterWrite(part?: TechnicalPart) {
    await loadList(page);
    const partId = part?.id || selected?.id;
    if (partId) await selectPart(partId);
  }

  function openCreate() {
    pendingWrite.current = null;
    setForm({ ...emptyForm });
    setFormMode("create");
    setMessage("");
  }

  function openEdit() {
    if (!selected) return;
    pendingWrite.current = null;
    setForm(formFromPart(selected));
    setFormMode("edit");
    setMessage("");
  }

  async function savePart() {
    if (!podeAjustar) return;

    try {
      const minStock = nonNegativeInteger(form.minStock, "Estoque mínimo");
      const defaultSalePrice = nonNegativeMoney(
        form.defaultSalePrice,
        "Preço de venda",
      );

      const metadata = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category: form.category.trim(),
        brand: form.brand.trim(),
        compatibleModel: form.compatibleModel.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        notes: form.notes.trim(),
        minStock,
        defaultSalePrice,
        ...(podeVerFinanceiro
          ? {
              currentCostPrice: nonNegativeMoney(
                form.currentCostPrice || "0",
                "Preço de custo",
              ),
            }
          : {}),
      };

      if (!metadata.name) throw new Error("Informe o nome da peça.");

      if (formMode === "create") {
        const payload = {
          ...metadata,
          unlimitedStock: form.unlimitedStock,
          ...(form.unlimitedStock
            ? {}
            : {
                initialQuantity: nonNegativeInteger(
                  form.initialQuantity,
                  "Quantidade inicial",
                ),
              }),
        };

        const result = await secureWrite(
          "/api/estoque-tecnico",
          "POST",
          "technical-part:create",
          payload,
        );

        if (!result.ok) return;

        const success = result.data?.idempotentReplay
          ? "Cadastro confirmado por repetição segura."
          : "Peça técnica cadastrada com sucesso.";
        setFormMode(null);
        await refreshAfterWrite(result.data?.part);
        setMessage(success);
        return;
      }

      if (!selected) return;

      const result = await secureWrite(
        `/api/estoque-tecnico/${selected.id}`,
        "PATCH",
        `technical-part:update:${selected.id}`,
        {
          operation: "UPDATE_METADATA",
          command: {
            version: selected.version,
            ...metadata,
          },
        },
      );

      if (!result.ok) return;

      const success = result.data?.idempotentReplay
        ? "Alteração confirmada por repetição segura."
        : "Cadastro atualizado com sucesso.";
      setFormMode(null);
      await refreshAfterWrite(result.data?.part);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dados inválidos.");
    }
  }

  async function saveMovement() {
    if (!selected || !podeAjustar) return;

    try {
      if (!selected.isActive) {
        throw new Error("Reative a peça antes de registrar movimentação física.");
      }
      if (selected.quantityOnHand === null) {
        throw new Error(
          "Estoque ilimitado não aceita movimentação física. Converta para controlado.",
        );
      }

      const command: Record<string, unknown> = {
        version: selected.version,
        quantity: positiveInteger(movementQuantity, "Quantidade"),
        reason: movementReason.trim(),
      };

      if (!command.reason) throw new Error("Informe o motivo da movimentação.");

      if (
        podeVerFinanceiro &&
        movementOperation !== "NEGATIVE_ADJUSTMENT" &&
        movementUnitCost.trim()
      ) {
        command.unitCost = nonNegativeMoney(
          movementUnitCost,
          "Custo unitário",
        );
      }

      const result = await secureWrite(
        `/api/estoque-tecnico/${selected.id}/movimentos`,
        "POST",
        `technical-part:movement:${selected.id}:${movementOperation}`,
        {
          operation: movementOperation,
          command,
        },
      );

      if (!result.ok) return;

      const success = result.data?.idempotentReplay
        ? "Movimentação confirmada por repetição segura."
        : "Movimentação registrada com sucesso.";
      setMovementReason("");
      setMovementQuantity("1");
      setMovementUnitCost("");
      await refreshAfterWrite(result.data?.part);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dados inválidos.");
    }
  }

  async function saveAdministrativeAction() {
    if (!selected || !podeAjustar || !adminOperation) return;

    try {
      const reason = adminReason.trim();
      if (!reason) throw new Error("Informe o motivo da operação.");

      let command: Record<string, unknown> = {
        version: selected.version,
        reason,
      };

      if (adminOperation === "TO_CONTROLLED") {
        command = {
          ...command,
          confirmation: true,
          initialQuantity: nonNegativeInteger(
            controlledQuantity,
            "Quantidade inicial",
          ),
        };
      }

      if (adminOperation === "TO_UNLIMITED") {
        command = { ...command, confirmation: true };
      }

      const confirmationMessage =
        adminOperation === "DEACTIVATE"
          ? "Confirma a inativação desta peça técnica?"
          : adminOperation === "TO_UNLIMITED"
            ? `Confirma converter "${selected.name}" para estoque ilimitado? O saldo físico atual deixará de ser controlado.`
            : adminOperation === "TO_CONTROLLED"
              ? `Confirma converter "${selected.name}" para estoque controlado com ${controlledQuantity || "0"} unidade(s)?`
              : "";

      if (confirmationMessage && !window.confirm(confirmationMessage)) return;

      const result = await secureWrite(
        `/api/estoque-tecnico/${selected.id}`,
        "PATCH",
        `technical-part:admin:${selected.id}:${adminOperation}`,
        {
          operation: adminOperation,
          command,
        },
      );

      if (!result.ok) return;

      const success = result.data?.idempotentReplay
        ? "Operação administrativa confirmada por repetição segura."
        : "Operação administrativa concluída com sucesso.";
      setAdminReason("");
      setAdminOperation("");
      await refreshAfterWrite(result.data?.part);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dados inválidos.");
    }
  }

  function clearFilters() {
    setQ("");
    setActive("all");
    setMode("all");
    setAlert("all");
    setCategory("");
    setBrand("");
    setSort("name_asc");
    loadList(1, `page=1&pageSize=${pageSize}&sort=name_asc`);
  }

  useEffect(() => {
    if (carregandoPermissoes) return;
    if (!podeVer) {
      setLoading(false);
      return;
    }
    loadList(1);
  }, [carregandoPermissoes, podeVer]);

  if (carregandoPermissoes || loading) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          Carregando estoque técnico...
        </section>
      </main>
    );
  }

  if (!podeVer) {
    return (
      <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
        <section className="mx-auto max-w-7xl rounded-3xl bg-white dark:bg-slate-900 p-6 text-sm font-bold text-red-700 dark:text-red-400 shadow-sm ring-1 ring-red-200">
          Você não tem permissão para acessar o estoque técnico.
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-800 p-5 text-slate-950 dark:text-slate-100 lg:p-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-600">Assistência técnica</p>
              <h1 className="text-3xl font-black tracking-tight">
                Estoque técnico
              </h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
                Controle separado das peças usadas nas ordens de serviço, com
                reserva, consumo, ajustes, estorno e histórico auditável.
              </p>
            </div>

            {podeAjustar && (
              <button
                type="button"
                onClick={openCreate}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              >
                + Nova peça técnica
              </button>
            )}
          </div>
        </header>

        {message && (
          <div
            className={`rounded-2xl p-4 text-sm font-bold ring-1 ${
              /sucesso|confirmad|concluída/i.test(message)
                ? "bg-green-50 text-green-700 dark:text-green-400 dark:bg-green-900/30 dark:text-green-400 ring-green-200 dark:ring-green-500/30"
                : "bg-red-50 text-red-700 dark:text-red-400 dark:bg-red-900/30 dark:text-red-400 ring-red-200 dark:ring-red-500/30"
            }`}
          >
            {message}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Resultados" value={total} detail={`Página ${page} de ${pages}`} />
          <Card
            title="Peça selecionada"
            value={selected?.name || "-"}
            detail={selected ? `Versão ${selected.version}` : "Selecione uma peça"}
          />
          <Card
            title="Disponível"
            value={selectedSummary?.available ?? "-"}
            detail={selected ? stockText(selected) : "Saldo operacional"}
          />
          <Card
            title="Reservado"
            value={selectedSummary?.reserved ?? "-"}
            detail={selectedSummary ? `Modo: ${selectedSummary.mode}` : "Reservas em OS"}
          />
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
          <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-8">
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") loadList(1);
              }}
              placeholder="Nome, SKU ou modelo..."
              className={`${inputClass} lg:col-span-2`}
            />

            <select value={active} onChange={(event) => setActive(event.target.value)} className={inputClass}>
              <option value="all">Ativos e inativos</option>
              <option value="true">Somente ativos</option>
              <option value="false">Somente inativos</option>
            </select>

            <select value={mode} onChange={(event) => setMode(event.target.value)} className={inputClass}>
              <option value="all">Todos os modos</option>
              <option value="controlled">Controlado</option>
              <option value="unlimited">Ilimitado</option>
            </select>

            <select value={alert} onChange={(event) => setAlert(event.target.value)} className={inputClass}>
              <option value="all">Todos os saldos</option>
              <option value="out">Sem estoque</option>
              <option value="below">Abaixo do mínimo</option>
            </select>

            <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Categoria exata" className={inputClass} />
            <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Marca exata" className={inputClass} />

            <select value={sort} onChange={(event) => setSort(event.target.value)} className={inputClass}>
              <option value="name_asc">Nome A-Z</option>
              <option value="name_desc">Nome Z-A</option>
              <option value="updated_desc">Mais recentes</option>
              <option value="updated_asc">Mais antigos</option>
            </select>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => loadList(1)} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
              Aplicar filtros
            </button>
            <button type="button" onClick={clearFilters} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50">
              Limpar
            </button>
          </div>
        </section>

        {formMode && (
          <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-blue-200">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  {formMode === "create" ? "Novo cadastro" : "Editar cadastro"}
                </p>
                <h2 className="text-2xl font-black tracking-tight">
                  {formMode === "create" ? "Nova peça técnica" : selected?.name}
                </h2>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  pendingWrite.current = null;
                  setFormMode(null);
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-black text-slate-700 dark:text-slate-200"
              >
                Fechar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Nome *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="SKU">
                <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Categoria">
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Marca">
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Modelo compatível">
                <input value={form.compatibleModel} onChange={(e) => setForm({ ...form, compatibleModel: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Localização">
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Estoque mínimo">
                <input type="number" min="0" step="1" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Preço padrão de venda">
                <input type="number" min="0" step="0.01" value={form.defaultSalePrice} onChange={(e) => setForm({ ...form, defaultSalePrice: e.target.value })} disabled={saving} className={inputClass} />
              </Field>

              {podeVerFinanceiro && (
                <Field label="Preço de custo">
                  <input type="number" min="0" step="0.01" value={form.currentCostPrice} onChange={(e) => setForm({ ...form, currentCostPrice: e.target.value })} disabled={saving} className={inputClass} />
                </Field>
              )}

              {formMode === "create" && (
                <>
                  <Field label="Modo de estoque">
                    <select
                      value={form.unlimitedStock ? "unlimited" : "controlled"}
                      onChange={(e) => setForm({ ...form, unlimitedStock: e.target.value === "unlimited" })}
                      disabled={saving}
                      className={inputClass}
                    >
                      <option value="controlled">Controlado</option>
                      <option value="unlimited">Ilimitado</option>
                    </select>
                  </Field>

                  {!form.unlimitedStock && (
                    <Field label="Quantidade inicial">
                      <input type="number" min="0" step="1" value={form.initialQuantity} onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })} disabled={saving} className={inputClass} />
                    </Field>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Descrição">
                <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
              <Field label="Observações internas">
                <textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={saving} className={inputClass} />
              </Field>
            </div>

            <button type="button" disabled={saving} onClick={savePart} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
              {saving ? "Salvando..." : formMode === "create" ? "Cadastrar peça" : "Salvar alterações"}
            </button>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <aside className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
            <div className="mb-4">
              <p className="text-sm font-bold text-blue-600">Catálogo técnico</p>
              <h2 className="text-2xl font-black tracking-tight">Peças</h2>
            </div>

            <div className="max-h-[760px] space-y-3 overflow-auto pr-1">
              {items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                  Nenhuma peça técnica encontrada.
                </p>
              ) : (
                items.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => {
                      setMessage("");
                      selectPart(part.id);
                    }}
                    className={`w-full rounded-2xl p-4 text-left ring-1 transition ${
                      selected?.id === part.id
                        ? "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300 dark:ring-blue-500/40"
                        : "bg-slate-50 dark:bg-slate-800/50 ring-slate-100 dark:ring-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950 dark:text-slate-100">{part.name}</p>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                          SKU: {part.sku || "-"} • {part.category || "Sem categoria"}
                        </p>
                      </div>

                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${statusBadge(part)}`}>
                        {!part.isActive
                          ? "Inativa"
                          : part.quantityOnHand === null
                            ? "Ilimitada"
                            : `${part.quantityAvailable ?? 0} disp.`}
                      </span>
                    </div>

                    <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                      Venda: {money(part.defaultSalePrice)} • Reservado: {part.quantityReserved}
                    </p>
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" disabled={page <= 1} onClick={() => loadList(page - 1)} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-black text-slate-700 dark:text-slate-200 disabled:opacity-40">
                Anterior
              </button>
              <span className="text-xs font-black text-slate-500 dark:text-slate-400">{page}/{pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => loadList(page + 1)} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-black text-slate-700 dark:text-slate-200 disabled:opacity-40">
                Próxima
              </button>
            </div>
          </aside>

          <section className="space-y-5">
            {!selected ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 text-center text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                Selecione uma peça para visualizar e movimentar o estoque.
              </div>
            ) : loadingDetail ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 p-8 text-sm font-bold text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                Atualizando peça técnica...
              </div>
            ) : (
              <>
                <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-bold text-blue-600">Peça selecionada</p>
                      <h2 className="mt-1 text-2xl font-black tracking-tight">{selected.name}</h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                        SKU: {selected.sku || "-"} • {selected.brand || "Sem marca"} • {selected.compatibleModel || "Modelo não informado"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${statusBadge(selected)}`}>
                          {selected.isActive ? "Ativa" : "Inativa"}
                        </span>
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-800">
                          {selected.quantityOnHand === null ? "Ilimitado" : "Controlado"}
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:bg-blue-900/20 dark:ring-blue-500/30">
                          {stockText(selected)}
                        </span>
                      </div>
                    </div>

                    {podeAjustar && (
                      <button type="button" onClick={openEdit} className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50">
                        Editar cadastro
                      </button>
                    )}
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                      <p className="text-xs font-black uppercase text-slate-400">Venda padrão</p>
                      <strong className="mt-1 block">{money(selected.defaultSalePrice)}</strong>
                    </div>
                    {podeVerFinanceiro && (
                      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                        <p className="text-xs font-black uppercase text-slate-400">Custo atual</p>
                        <strong className="mt-1 block">{money(selected.currentCostPrice)}</strong>
                      </div>
                    )}
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                      <p className="text-xs font-black uppercase text-slate-400">Mínimo</p>
                      <strong className="mt-1 block">{selected.minStock}</strong>
                    </div>
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                      <p className="text-xs font-black uppercase text-slate-400">Localização</p>
                      <strong className="mt-1 block">{selected.location || "-"}</strong>
                    </div>
                  </div>
                </section>

                {podeAjustar && (
                  <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                    <p className="text-sm font-bold text-blue-600">Movimentação física</p>
                    <h2 className="text-2xl font-black tracking-tight">Entrada e ajustes</h2>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                      <Field label="Operação">
                        <select value={movementOperation} onChange={(e) => { pendingWrite.current = null; setMovementOperation(e.target.value); }} disabled={saving || !selected.isActive || selected.quantityOnHand === null} className={inputClass}>
                          <option value="ENTRY">Entrada</option>
                          <option value="POSITIVE_ADJUSTMENT">Ajuste positivo</option>
                          <option value="NEGATIVE_ADJUSTMENT">Ajuste negativo</option>
                        </select>
                      </Field>
                      <Field label="Quantidade">
                        <input type="number" min="1" step="1" value={movementQuantity} onChange={(e) => { pendingWrite.current = null; setMovementQuantity(e.target.value); }} disabled={saving || !selected.isActive || selected.quantityOnHand === null} className={inputClass} />
                      </Field>
                      <Field label="Motivo">
                        <input value={movementReason} onChange={(e) => { pendingWrite.current = null; setMovementReason(e.target.value); }} disabled={saving || !selected.isActive || selected.quantityOnHand === null} placeholder="Compra, conferência, perda..." className={inputClass} />
                      </Field>
                      {podeVerFinanceiro && movementOperation !== "NEGATIVE_ADJUSTMENT" && (
                        <Field label="Novo custo unitário (opcional)">
                          <input type="number" min="0" step="0.01" value={movementUnitCost} onChange={(e) => { pendingWrite.current = null; setMovementUnitCost(e.target.value); }} disabled={saving || !selected.isActive || selected.quantityOnHand === null} className={inputClass} />
                        </Field>
                      )}
                    </div>

                    {(!selected.isActive || selected.quantityOnHand === null) && (
                      <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-sm font-bold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
                        {!selected.isActive
                          ? "Reative a peça para registrar movimentações físicas."
                          : "Estoque ilimitado não aceita movimentações físicas. Converta para controlado."}
                      </p>
                    )}

                    <button type="button" disabled={saving || !selected.isActive || selected.quantityOnHand === null} onClick={saveMovement} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
                      {saving ? "Salvando..." : "Registrar movimentação"}
                    </button>
                  </section>
                )}

                {podeAjustar && (
                  <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                    <p className="text-sm font-bold text-blue-600">Administração</p>
                    <h2 className="text-2xl font-black tracking-tight">Estado e modo do estoque</h2>

                    <div className="mt-4 grid gap-4 lg:grid-cols-3">
                      <Field label="Operação">
                        <select value={adminOperation} onChange={(e) => { pendingWrite.current = null; setAdminOperation(e.target.value); }} disabled={saving} className={inputClass}>
                          <option value="">Selecione...</option>
                          {selected.isActive ? (
                            <option value="DEACTIVATE">Inativar peça</option>
                          ) : (
                            <option value="REACTIVATE">Reativar peça</option>
                          )}
                          {selected.quantityOnHand === null ? (
                            <option value="TO_CONTROLLED">Converter para controlado</option>
                          ) : (
                            <option value="TO_UNLIMITED">Converter para ilimitado</option>
                          )}
                        </select>
                      </Field>

                      <Field label="Motivo">
                        <input value={adminReason} onChange={(e) => { pendingWrite.current = null; setAdminReason(e.target.value); }} disabled={saving} className={inputClass} />
                      </Field>

                      {adminOperation === "TO_CONTROLLED" && (
                        <Field label="Quantidade inicial">
                          <input type="number" min="0" step="1" value={controlledQuantity} onChange={(e) => { pendingWrite.current = null; setControlledQuantity(e.target.value); }} disabled={saving} className={inputClass} />
                        </Field>
                      )}
                    </div>

                    {selected.quantityReserved > 0 &&
                      ["DEACTIVATE", "TO_CONTROLLED", "TO_UNLIMITED"].includes(adminOperation) && (
                        <p className="mt-4 rounded-xl bg-yellow-50 p-3 text-sm font-bold text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-900/20 dark:ring-yellow-500/30">
                          Esta peça possui {selected.quantityReserved} unidade(s)
                          reservada(s). O servidor bloqueará operações incompatíveis
                          enquanto existirem reservas.
                        </p>
                      )}

                    <button type="button" disabled={saving || !adminOperation} onClick={saveAdministrativeAction} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50">
                      {saving ? "Processando..." : "Executar operação"}
                    </button>
                  </section>
                )}

                <section className="rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
                  <div className="mb-5">
                    <p className="text-sm font-bold text-blue-600">Auditoria</p>
                    <h2 className="text-2xl font-black tracking-tight">Histórico de movimentações</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {movements.length} de {movementTotal} registro(s).
                    </p>
                  </div>

                  {movements.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-5 text-sm font-bold text-slate-500 dark:text-slate-400">
                      Nenhuma movimentação registrada.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {movements.map((movement) => (
                        <article key={movement.id} className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 ring-1 ring-slate-100">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <span className="rounded-full bg-white dark:bg-slate-900 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-200 ring-1 ring-slate-200 dark:ring-slate-800">
                                {movementLabels[movement.type] || movement.type}
                              </span>
                              <p className="mt-2 text-sm font-black text-slate-900 dark:text-white">{movement.reason || "Sem motivo informado"}</p>
                              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {dateTime(movement.createdAt)} • {movement.operatorNameSnapshot || "Sistema"}
                              </p>
                              {podeVerFinanceiro &&
                                movement.unitCostSnapshot !== undefined &&
                                movement.unitCostSnapshot !== null && (
                                  <p className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-400">
                                    Custo registrado: {money(movement.unitCostSnapshot)}
                                  </p>
                                )}
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
                              <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p>Qtd.</p>
                                <strong className="mt-1 block text-base text-slate-950 dark:text-slate-100">{movement.quantity}</strong>
                              </div>
                              <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p>Físico</p>
                                <strong className="mt-1 block text-base text-slate-950 dark:text-slate-100">
                                  {movement.onHandBefore === null ? "∞" : movement.onHandBefore}{" → "}{movement.onHandAfter === null ? "∞" : movement.onHandAfter}
                                </strong>
                              </div>
                              <div className="rounded-xl bg-white dark:bg-slate-900 p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                                <p>Reservado</p>
                                <strong className="mt-1 block text-base text-slate-950 dark:text-slate-100">
                                  {movement.reservedBefore} → {movement.reservedAfter}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {movements.length < movementTotal && (
                    <button type="button" onClick={() => loadMovements(selected.id, movementPage + 1, true)} className="mt-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50">
                      Carregar mais
                    </button>
                  )}
                </section>
              </>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
