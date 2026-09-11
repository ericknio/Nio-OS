/**
 * @file lib/estoqueTecnico/movementService.ts
 * @description Serviço de consulta paginada do histórico de movimentações de peças técnicas.
 * 
 * Permite extrair o extrato de entradas, saídas, reservas, consumos e estornos de uma peça específica,
 * com sanitização e ocultação automática de dados de custo para usuários não autorizados.
 */

import {
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
