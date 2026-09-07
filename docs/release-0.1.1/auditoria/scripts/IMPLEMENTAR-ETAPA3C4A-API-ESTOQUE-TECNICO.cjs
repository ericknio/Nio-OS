#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const files = {
  partService: "lib/estoqueTecnico/partService.ts",
  movementRepository: "lib/estoqueTecnico/movementRepository.ts",
  index: "lib/estoqueTecnico/index.ts",
  permissaoApi: "lib/permissaoApi.ts",
  movementService: "lib/estoqueTecnico/movementService.ts",
  http: "lib/server/estoqueTecnicoHttp.ts",
  collectionRoute: "app/api/estoque-tecnico/route.ts",
  itemRoute: "app/api/estoque-tecnico/[id]/route.ts",
  movementsRoute: "app/api/estoque-tecnico/[id]/movimentos/route.ts",
  test: "scripts/test-estoque-tecnico/etapa3c4a-api-estoque-tecnico.cjs",
};

function abs(relative) {
  return path.join(root, ...relative.split("/"));
}

function required(relative) {
  const file = abs(relative);
  if (!fs.existsSync(file)) throw new Error(`Arquivo obrigatório não encontrado: ${relative}`);
  return fs.readFileSync(file, "utf8");
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function backupAndWrite(relative, content, changed) {
  const file = abs(relative);
  ensureParent(file);

  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, "utf8");
    if (current === content) {
      console.log(`[OK JÁ ATUALIZADO] ${relative}`);
      return;
    }
    const backup = `${file}.bak-3c4a-${stamp}`;
    fs.copyFileSync(file, backup);
    console.log(`[BACKUP] ${path.basename(backup)}`);
  }

  fs.writeFileSync(file, content, "utf8");
  changed.push(relative);
  console.log(`[GRAVADO] ${relative}`);
}

function insertBefore(source, anchor, insertion, label) {
  if (source.includes(insertion.trim())) return source;
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`Âncora "${label}" não encontrada. Nenhum arquivo será alterado.`);
  return source.slice(0, index) + insertion + source.slice(index);
}

function patchMovementRepository(source) {
  if (source.includes("listTechnicalPartMovementRows")) return source;

  const anchor = `export function countMovementsForItemType(`;
  const addition = `
export function listTechnicalPartMovementRows(
  database: StockDatabase,
  input: { technicalPartId: string; page: number; pageSize: number },
): {
  items: TechnicalPartMovementRecord[];
  total: number;
  page: number;
  pageSize: number;
} {
  const total = Number(
    database.prepare(\`SELECT COUNT(*) AS "total"
      FROM "TechnicalPartMovement" WHERE "technicalPartId" = ?\`)
      .get(input.technicalPartId)?.total ?? 0,
  );
  const offset = (input.page - 1) * input.pageSize;
  const rows = database.prepare(\`SELECT \${MOVEMENT_COLUMNS}
    FROM "TechnicalPartMovement"
    WHERE "technicalPartId" = ?
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT ? OFFSET ?\`)
    .all(input.technicalPartId, input.pageSize, offset);

  return {
    items: rows.map(toMovement),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

`;

  return insertBefore(source, anchor, addition, "countMovementsForItemType");
}

function patchIndex(source) {
  if (source.includes('from "./movementService"')) return source;

  const anchor = `export {
  reserveTechnicalPartForOrder,`;

  const addition = `export { listTechnicalPartMovements } from "./movementService";
`;

  return insertBefore(source, anchor, addition, "exports de orderPartService");
}

const movementService = `import {
  __withStockDatabaseForTests,
  withStockDatabase,
} from "./db";
import { stockError, validationError } from "./errors";
import { listTechnicalPartMovementRows } from "./movementRepository";
import { findTechnicalPartById } from "./partRepository";
import { sanitizeTechnicalPartMovement } from "./sanitize";
import type { StockDatabase } from "./types";
import {
  requirePage,
  requirePositiveInteger,
} from "./validation";

type TestLocation = { runtimeRoot: string; databasePath: string };
type ReadRunner = <T>(callback: (database: StockDatabase) => T) => T;

const PART_ID_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;

function requirePartId(value: unknown): string {
  if (typeof value !== "string" || !PART_ID_PATTERN.test(value)) {
    throw validationError("A identificação da peça técnica é inválida.", {
      field: "partId",
    });
  }
  return value;
}

function pagination(value: unknown): { page: number; pageSize: number } {
  const input =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const page = input.page === undefined ? 1 : requirePage(input.page, "page");
  const pageSize =
    input.pageSize === undefined
      ? 50
      : requirePositiveInteger(input.pageSize, "pageSize");

  if (pageSize > 100) {
    throw validationError("O limite máximo por página é 100.", {
      field: "pageSize",
    });
  }

  return { page, pageSize };
}

function makeService(read: ReadRunner) {
  return function listTechnicalPartMovements(
    partIdValue: unknown,
    paginationValue?: unknown,
    optionsValue?: unknown,
  ) {
    const partId = requirePartId(partIdValue);
    const paging = pagination(paginationValue);
    const options =
      typeof optionsValue === "object" &&
      optionsValue !== null &&
      !Array.isArray(optionsValue)
        ? (optionsValue as Record<string, unknown>)
        : {};

    const canViewFinancialData = options.canViewFinancialData === true;

    return read((database) => {
      if (!findTechnicalPartById(database, partId)) {
        throw stockError(
          "TECHNICAL_PART_NOT_FOUND",
          404,
          "A peça técnica não foi encontrada.",
        );
      }

      const result = listTechnicalPartMovementRows(database, {
        technicalPartId: partId,
        ...paging,
      });

      return {
        ...result,
        items: result.items.map((movement) =>
          sanitizeTechnicalPartMovement(movement, canViewFinancialData),
        ),
      };
    });
  };
}

export const listTechnicalPartMovements = makeService((callback) =>
  withStockDatabase(callback),
);

/** @internal Somente para banco descartável de laboratório. */
export function __createMovementServicesForTests(location: TestLocation) {
  return {
    listTechnicalPartMovements: makeService((callback) =>
      __withStockDatabaseForTests(location, callback),
    ),
  };
}
`;

const httpHelper = `import { NextResponse } from "next/server";
import {
  toFutureHttpError,
} from "@/lib/estoqueTecnico";
import {
  usuarioPodeVerDadosFinanceirosSensiveis,
  usuarioTemPermissao,
} from "@/lib/permissaoApi";
import {
  requireIdempotencyKey,
} from "@/lib/estoqueTecnico/validation";
import {
  stockError,
  validationError,
} from "@/lib/estoqueTecnico/errors";

type UsuarioSessao = NonNullable<Parameters<typeof usuarioTemPermissao>[0]>;

export function jsonNoStore(
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

export function stockHttpError(error: unknown) {
  const mapped = toFutureHttpError(error);
  return jsonNoStore(
    mapped.body,
    mapped.status,
    mapped.body.retryable ? { "Retry-After": "1" } : undefined,
  );
}

export function sameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: Request): void {
  if (!sameOriginOrNoOrigin(request)) {
    throw stockError(
      "PERMISSION_DENIED",
      403,
      "Origem da requisição não permitida.",
    );
  }
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw validationError("Content-Type application/json é obrigatório.");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError("Informe um objeto JSON válido.");
  }

  return body as Record<string, unknown>;
}

export function operatorName(
  usuario: UsuarioSessao | null | undefined,
): string {
  return usuario?.name?.trim() || usuario?.username?.trim() || "Sistema";
}

export function canViewFinancialData(
  usuario: UsuarioSessao | null | undefined,
): boolean {
  return usuarioPodeVerDadosFinanceirosSensiveis(usuario);
}

export function commandContext(
  request: Request,
  usuario: UsuarioSessao,
) {
  return {
    operatorId: usuario.id || null,
    operatorName: operatorName(usuario),
    canViewFinancialData: canViewFinancialData(usuario),
    idempotencyKey: requireIdempotencyKey(
      request.headers.get("Idempotency-Key"),
    ),
  };
}

export function dispatchBody(
  body: Record<string, unknown>,
): { operation: string; command: unknown } {
  const keys = Object.keys(body);
  if (
    keys.length !== 2 ||
    !keys.includes("operation") ||
    !keys.includes("command") ||
    typeof body.operation !== "string" ||
    typeof body.command !== "object" ||
    body.command === null ||
    Array.isArray(body.command)
  ) {
    throw validationError(
      "Informe somente operation e command com valores válidos.",
    );
  }

  return {
    operation: body.operation,
    command: body.command,
  };
}

export function assertQueryKeys(
  params: URLSearchParams,
  allowed: readonly string[],
): void {
  const allowlist = new Set(allowed);
  for (const key of params.keys()) {
    if (!allowlist.has(key)) {
      throw validationError("O parâmetro informado não é permitido.", {
        field: key,
      });
    }
  }
}

export function queryBoolean(
  params: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw validationError("Informe true ou false.", { field: key });
}

export function queryInteger(
  params: URLSearchParams,
  key: string,
): number | undefined {
  const value = params.get(key);
  if (value === null) return undefined;
  if (!/^[0-9]+$/.test(value)) {
    throw validationError("Informe um número inteiro válido.", { field: key });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw validationError("Informe um número inteiro válido.", { field: key });
  }
  return parsed;
}

export function queryString(
  params: URLSearchParams,
  key: string,
): string | undefined {
  const value = params.get(key);
  return value === null ? undefined : value;
}
`;

const collectionRoute = `import {
  createTechnicalPart,
  listTechnicalParts,
} from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  assertQueryKeys,
  canViewFinancialData,
  commandContext,
  jsonNoStore,
  queryBoolean,
  queryInteger,
  queryString,
  readJsonObject,
  requireSameOrigin,
  stockHttpError,
} from "@/lib/server/estoqueTecnicoHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ver");
    if (!acesso.ok) return acesso.response;

    const params = new URL(request.url).searchParams;
    assertQueryKeys(params, [
      "q",
      "active",
      "unlimited",
      "outOfStock",
      "belowMin",
      "category",
      "brand",
      "page",
      "pageSize",
      "sort",
    ]);
    const result = listTechnicalParts(
      {
        q: queryString(params, "q"),
        active: queryBoolean(params, "active"),
        unlimited: queryBoolean(params, "unlimited"),
        outOfStock: queryBoolean(params, "outOfStock"),
        belowMin: queryBoolean(params, "belowMin"),
        category: queryString(params, "category"),
        brand: queryString(params, "brand"),
        page: queryInteger(params, "page"),
        pageSize: queryInteger(params, "pageSize"),
        sort: queryString(params, "sort"),
      },
      {
        canViewFinancialData: canViewFinancialData(acesso.usuario),
      },
    );

    return jsonNoStore(result);
  } catch (error) {
    return stockHttpError(error);
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ajustar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const body = await readJsonObject(request);
    const result = createTechnicalPart(
      body,
      commandContext(request, acesso.usuario),
    );

    return jsonNoStore(result, result.idempotentReplay ? 200 : 201);
  } catch (error) {
    return stockHttpError(error);
  }
}
`;

const itemRoute = `import {
  changeTechnicalPartToControlled,
  changeTechnicalPartToUnlimited,
  deactivateTechnicalPart,
  getTechnicalPartById,
  reactivateTechnicalPart,
  updateTechnicalPartMetadata,
} from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  canViewFinancialData,
  commandContext,
  dispatchBody,
  jsonNoStore,
  readJsonObject,
  requireSameOrigin,
  stockHttpError,
} from "@/lib/server/estoqueTecnicoHttp";
import { validationError } from "@/lib/estoqueTecnico/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ver");
    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const part = getTechnicalPartById(id, {
      canViewFinancialData: canViewFinancialData(acesso.usuario),
    });

    return jsonNoStore(part);
  } catch (error) {
    return stockHttpError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ajustar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const { id } = await context.params;
    const { operation, command } = dispatchBody(await readJsonObject(request));
    const ctx = commandContext(request, acesso.usuario);

    const handlers = {
      UPDATE_METADATA: () => updateTechnicalPartMetadata(id, command, ctx),
      DEACTIVATE: () => deactivateTechnicalPart(id, command, ctx),
      REACTIVATE: () => reactivateTechnicalPart(id, command, ctx),
      TO_CONTROLLED: () => changeTechnicalPartToControlled(id, command, ctx),
      TO_UNLIMITED: () => changeTechnicalPartToUnlimited(id, command, ctx),
    } as const;

    const handler = handlers[operation as keyof typeof handlers];
    if (!handler) {
      throw validationError("A operação administrativa é inválida.", {
        field: "operation",
      });
    }

    return jsonNoStore(handler());
  } catch (error) {
    return stockHttpError(error);
  }
}
`;

const movementsRoute = `import {
  listTechnicalPartMovements,
  registerNegativeAdjustment,
  registerPositiveAdjustment,
  registerTechnicalPartEntry,
} from "@/lib/estoqueTecnico";
import { exigirPermissaoApi } from "@/lib/permissaoApi";
import {
  assertQueryKeys,
  canViewFinancialData,
  commandContext,
  dispatchBody,
  jsonNoStore,
  queryInteger,
  readJsonObject,
  requireSameOrigin,
  stockHttpError,
} from "@/lib/server/estoqueTecnicoHttp";
import { validationError } from "@/lib/estoqueTecnico/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ver");
    if (!acesso.ok) return acesso.response;

    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    assertQueryKeys(params, ["page", "pageSize"]);
    const result = listTechnicalPartMovements(
      id,
      {
        page: queryInteger(params, "page"),
        pageSize: queryInteger(params, "pageSize"),
      },
      {
        canViewFinancialData: canViewFinancialData(acesso.usuario),
      },
    );

    return jsonNoStore(result);
  } catch (error) {
    return stockHttpError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const acesso = await exigirPermissaoApi("estoque.ajustar");
    if (!acesso.ok) return acesso.response;

    requireSameOrigin(request);
    const { id } = await context.params;
    const { operation, command } = dispatchBody(await readJsonObject(request));
    const ctx = commandContext(request, acesso.usuario);

    const handlers = {
      ENTRY: () => registerTechnicalPartEntry(id, command, ctx),
      POSITIVE_ADJUSTMENT: () => registerPositiveAdjustment(id, command, ctx),
      NEGATIVE_ADJUSTMENT: () => registerNegativeAdjustment(id, command, ctx),
    } as const;

    const handler = handlers[operation as keyof typeof handlers];
    if (!handler) {
      throw validationError("A operação de estoque é inválida.", {
        field: "operation",
      });
    }

    return jsonNoStore(handler());
  } catch (error) {
    return stockHttpError(error);
  }
}
`;

const staticTest = `#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const read = (relative) =>
  fs.readFileSync(path.join(root, ...relative.split("/")), "utf8");

const collection = read("app/api/estoque-tecnico/route.ts");
const item = read("app/api/estoque-tecnico/[id]/route.ts");
const movements = read("app/api/estoque-tecnico/[id]/movimentos/route.ts");
const http = read("lib/server/estoqueTecnicoHttp.ts");
const service = read("lib/estoqueTecnico/movementService.ts");
const repository = read("lib/estoqueTecnico/movementRepository.ts");
const index = read("lib/estoqueTecnico/index.ts");

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };

check(() => assert.match(collection, /exigirPermissaoApi\\("estoque\\.ver"\\)/));
check(() => assert.match(collection, /exigirPermissaoApi\\("estoque\\.ajustar"\\)/));
check(() => assert.match(collection, /createTechnicalPart/));
check(() => assert.match(collection, /listTechnicalParts/));
check(() => assert.match(collection, /queryBoolean\\(params, "unlimited"\\)/));
check(() => assert.match(collection, /queryBoolean\\(params, "outOfStock"\\)/));
check(() => assert.match(collection, /queryBoolean\\(params, "belowMin"\\)/));
check(() => assert.doesNotMatch(collection, /prisma\\./));
check(() => assert.doesNotMatch(collection, /console\\.(?:log|warn|error)\\s*\\(/));

check(() => assert.match(item, /getTechnicalPartById/));
check(() => assert.match(item, /updateTechnicalPartMetadata/));
check(() => assert.match(item, /deactivateTechnicalPart/));
check(() => assert.match(item, /reactivateTechnicalPart/));
check(() => assert.match(item, /changeTechnicalPartToControlled/));
check(() => assert.match(item, /changeTechnicalPartToUnlimited/));
check(() => assert.match(item, /UPDATE_METADATA/));
check(() => assert.match(item, /DEACTIVATE/));
check(() => assert.match(item, /REACTIVATE/));
check(() => assert.match(item, /TO_CONTROLLED/));
check(() => assert.match(item, /TO_UNLIMITED/));
check(() => assert.doesNotMatch(item, /prisma\\./));

check(() => assert.match(movements, /listTechnicalPartMovements/));
check(() => assert.match(movements, /registerTechnicalPartEntry/));
check(() => assert.match(movements, /registerPositiveAdjustment/));
check(() => assert.match(movements, /registerNegativeAdjustment/));
check(() => assert.match(movements, /ENTRY/));
check(() => assert.match(movements, /POSITIVE_ADJUSTMENT/));
check(() => assert.match(movements, /NEGATIVE_ADJUSTMENT/));
check(() => assert.doesNotMatch(movements, /prisma\\./));

check(() => assert.match(http, /requireIdempotencyKey/));
check(() => assert.match(http, /request\\.headers\\.get\\("Idempotency-Key"\\)/));
check(() => assert.match(http, /usuarioPodeVerDadosFinanceirosSensiveis/));
check(() => assert.match(http, /operatorId:\\s*usuario\\.id\\s*\\|\\|\\s*null/));
check(() => assert.match(http, /Cache-Control/));
check(() => assert.match(http, /Retry-After/));
check(() => assert.match(http, /sameOriginOrNoOrigin/));
check(() => assert.match(http, /"PERMISSION_DENIED"/));
check(() => assert.match(http, /assertQueryKeys/));
check(() => assert.match(http, /Content-Type application\\/json/));
check(() => assert.match(http, /keys\\.length !== 2/));
check(() => assert.doesNotMatch(http, /console\\.(?:log|warn|error)\\s*\\(/));

check(() => assert.match(service, /sanitizeTechnicalPartMovement/));
check(() => assert.match(service, /TECHNICAL_PART_NOT_FOUND/));
check(() => assert.match(service, /pageSize > 100/));
check(() => assert.match(repository, /ORDER BY "createdAt" DESC, "id" DESC/));
check(() => assert.match(repository, /WHERE "technicalPartId" = \\?/));
check(() => assert.match(index, /listTechnicalPartMovements/));

for (const source of [collection, item, movements]) {
  check(() => assert.match(source, /stockHttpError/));
  check(() => assert.match(source, /jsonNoStore/));
}

process.stdout.write(JSON.stringify({ ok: true, assertions }) + "\\n");
`;

function validateExisting() {
  const partService = required(files.partService);
  const movementRepository = required(files.movementRepository);
  const index = required(files.index);
  const permissaoApi = required(files.permissaoApi);

  const requiredPartSymbols = [
    "createTechnicalPart",
    "getTechnicalPartById",
    "listTechnicalParts",
    "updateTechnicalPartMetadata",
    "deactivateTechnicalPart",
    "reactivateTechnicalPart",
    "registerTechnicalPartEntry",
    "registerPositiveAdjustment",
    "registerNegativeAdjustment",
    "changeTechnicalPartToControlled",
    "changeTechnicalPartToUnlimited",
  ];

  for (const symbol of requiredPartSymbols) {
    if (!partService.includes(symbol)) {
      throw new Error(`Core incompatível: ${symbol} não encontrado em ${files.partService}.`);
    }
  }

  for (const permission of ["estoque.ver", "estoque.ajustar"]) {
    if (!permissaoApi.includes("exigirPermissaoApi")) {
      throw new Error(`Infraestrutura de permissão não encontrada em ${files.permissaoApi}.`);
    }
  }

  if (!movementRepository.includes("insertTechnicalPartMovement")) {
    throw new Error(`Repository técnico incompatível: ${files.movementRepository}.`);
  }

  if (!index.includes('from "./partService"')) {
    throw new Error(`Barrel do estoque técnico incompatível: ${files.index}.`);
  }

  return {
    movementRepository,
    index,
  };
}

function main() {
  // Todas as validações e transformações são calculadas antes da primeira escrita.
  const current = validateExisting();
  const movementRepositoryNext = patchMovementRepository(current.movementRepository);
  const indexNext = patchIndex(current.index);

  const changed = [];
  backupAndWrite(files.movementRepository, movementRepositoryNext, changed);
  backupAndWrite(files.index, indexNext, changed);
  backupAndWrite(files.movementService, movementService, changed);
  backupAndWrite(files.http, httpHelper, changed);
  backupAndWrite(files.collectionRoute, collectionRoute, changed);
  backupAndWrite(files.itemRoute, itemRoute, changed);
  backupAndWrite(files.movementsRoute, movementsRoute, changed);
  backupAndWrite(files.test, staticTest, changed);

  console.log(JSON.stringify({
    ok: true,
    stage: "3C.4A",
    changed,
    readPermission: "estoque.ver",
    writePermission: "estoque.ajustar",
    financialPermission: "relatorios.financeiro",
    databaseChanged: false,
    schemaChanged: false,
    prismaWritesAdded: false,
  }));
}

main();
