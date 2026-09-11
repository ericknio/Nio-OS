/**
 * @file lib/estoqueTecnico/index.ts
 * @description Ponto de entrada público (Barrel File) do Módulo de Estoque Técnico.
 * 
 * Exporta serviços de domínio, repositórios, tipos e tratamentos de erro padronizados
 * para controle de peças técnicas utilizadas em Ordens de Serviço (reserva, consumo, estorno e movimentação).
 */

export {
  StockDomainError,
  mapUnknownStockError,
  toFutureHttpError,
} from "./errors";
export {
  createTechnicalPart,
  getTechnicalPartById,
  listTechnicalParts,
  updateTechnicalPartMetadata,
  deactivateTechnicalPart,
  reactivateTechnicalPart,
  registerTechnicalPartEntry,
  registerPositiveAdjustment,
  registerNegativeAdjustment,
  changeTechnicalPartToControlled,
  changeTechnicalPartToUnlimited,
} from "./partService";
export { listTechnicalPartMovements } from "./movementService";
export {
  reserveTechnicalPartForOrder,
  listTechnicalPartsForOrder,
} from "./orderPartService";
export {
  changeReservedTechnicalPartQuantity,
  releaseTechnicalPartFromOrder,
} from "./orderPartMutationService";
export { markServiceOrderReadyAndConsumeTechnicalParts } from "./orderConsumptionService";
export { cancelServiceOrderAndReleaseReservedTechnicalParts } from "./orderCancellationService";
export { reverseConsumedTechnicalPartManually } from "./orderReversalService";
export type {
  InternalCommandContext,
  ConsumeReadyResult,
  CancelTechnicalResult,
  ManualReversalResult,
  ReserveTechnicalPartResult,
  ServiceOrderPartPublicProjection,
  TechnicalOrderTotals,
  TechnicalPartCommandResult,
  TechnicalPartMovementPublicProjection,
  TechnicalPartPublicProjection,
  TechnicalPartsForOrderResult,
  TechnicalStockBalance,
} from "./types";
