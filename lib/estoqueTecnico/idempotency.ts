/**
 * @file lib/estoqueTecnico/idempotency.ts
 * @description Mecanismo de idempotência determinística para mutações no Estoque Técnico.
 * 
 * Previne execuções duplicadas acidentais de reservas, consumos ou baixas de peças decorrentes
 * de duplo clique, reconexão de rede ou timeouts, usando hash criptográfico SHA-256 e comparação de replays.
 */

import { createHash } from "node:crypto";
import { stockError, validationError } from "./errors";
import { requireIdempotencyKey } from "./validation";
import type { IdempotentResponse } from "./types";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,191}$/;

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw validationError("O payload idempotente é inválido.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, seen));
  if (typeof value !== "object" || value === null) {
    throw validationError("O payload idempotente é inválido.");
  }
  if (seen.has(value)) throw validationError("O payload idempotente é inválido.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw validationError("O payload idempotente é inválido.");
  }
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) throw validationError("O payload idempotente é inválido.");
    result[key] = canonicalValue(entry, seen);
  }
  seen.delete(value);
  return result;
}

/**
 * Converte um payload em uma string JSON canônica determinística com chaves ordenadas alfabeticamente.
 */
export function canonicalizeIdempotentPayload(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set<object>()));
}

/**
 * Gera o hash SHA-256 em hexadecimal a partir do payload canônico da requisição.
 */
export function hashIdempotentPayload(value: unknown): string {
  return createHash("sha256").update(canonicalizeIdempotentPayload(value)).digest("hex");
}

function requireSafeSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value)) {
    throw validationError("A composição da chave idempotente é inválida.", { field });
  }
  return value;
}

export function buildPersistedIdempotencyKey(input: {
  namespace: unknown;
  operation: unknown;
  version: unknown;
  resources?: readonly unknown[];
  requestKey: unknown;
}): string {
  const segments = [
    requireSafeSegment(input.namespace, "namespace"),
    requireSafeSegment(input.operation, "operation"),
    requireSafeSegment(input.version, "version"),
    ...(input.resources ?? []).map((resource) => requireSafeSegment(resource, "resource")),
    requireIdempotencyKey(input.requestKey),
  ];
  const persisted = segments.join(":");
  if (persisted.length > 512) {
    throw validationError("A composição da chave idempotente é inválida.");
  }
  return persisted;
}

/**
 * Compara uma requisição repetida com o hash armazenado no log de comandos.
 * Se os hashes divergirem, acusa erro 409 (`IDEMPOTENCY_KEY_REUSED`).
 * Se forem idênticos, retorna a resposta previamente calculada com a flag `replay: true`.
 */
export function compareIdempotentReplay<T>(input: {
  storedPayloadHash: string;
  currentPayloadHash: string;
  storedValue: T;
}): IdempotentResponse<T> {
  if (input.storedPayloadHash !== input.currentPayloadHash) {
    throw stockError(
      "IDEMPOTENCY_KEY_REUSED",
      409,
      "A chave de idempotência já foi usada com dados diferentes.",
    );
  }
  return {
    value: input.storedValue,
    replay: true,
    payloadHash: input.currentPayloadHash,
  };
}

