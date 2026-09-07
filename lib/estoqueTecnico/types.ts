import type {
  ServiceOrderPartState,
  TechnicalPartMovementType,
  TechnicalPartCommandOperation,
} from "@prisma/client";

export type ControlledTechnicalStock = {
  mode: "controlled";
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
};

export type UnlimitedTechnicalStock = {
  mode: "unlimited";
  quantityOnHand: null;
  quantityReserved: number;
  quantityAvailable: null;
};

export type TechnicalStockBalance =
  | ControlledTechnicalStock
  | UnlimitedTechnicalStock;

export type OperatorSnapshot = {
  id: string | null;
  name: string;
};

export type InternalCommandContext = {
  operatorId: string | null;
  operatorName: string;
  canViewFinancialData: boolean;
  idempotencyKey: string;
};

export type ValidatedCommandContext = InternalCommandContext & {
  payloadHash: string;
};

export type TechnicalPartRecord = {
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
  minStock: number;
  currentCostPrice: number;
  defaultSalePrice: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type TechnicalPartMovementRecord = {
  id: string;
  technicalPartId: string;
  serviceOrderPartId: string | null;
  type: TechnicalPartMovementType;
  quantity: number;
  onHandBefore: number | null;
  onHandAfter: number | null;
  reservedBefore: number;
  reservedAfter: number;
  unitCostSnapshot: number | null;
  reason: string | null;
  operatorId: string | null;
  operatorNameSnapshot: string;
  idempotencyKey: string;
  createdAt: string;
};

export type TechnicalPartCommandLogRecord = {
  id: string;
  logicalKey: string;
  payloadHash: string;
  operation: TechnicalPartCommandOperation;
  technicalPartId: string;
  operatorId: string | null;
  operatorNameSnapshot: string;
  reason: string | null;
  resultVersion: number;
  createdAt: string;
};

export type TechnicalPartCommandResult = {
  part: TechnicalPartPublicProjection;
  movement?: TechnicalPartMovementPublicProjection;
  idempotentReplay: boolean;
};

export type ProfitShareTechnicianRecord = {
  id: string;
  name: string;
  profitShareEnabled: boolean;
  profitSharePercent: number;
};

export type TechnicalServiceOrderRecord = {
  id: string;
  status: string;
  partsCost: number;
  laborCost: number;
  discount: number;
  totalAmount: number;
  technicianResponsible: string | null;
  technicianUserId: string | null;
  technicianProfitPercentSnapshot: number | null;
  paidAmount: number;
  paymentPercent: number;
  paymentReceivedAt: string | null;
  finalizedAt: string | null;
  requiredParts: string | null;
  hasFinalization: boolean;
  paymentCount: number;
};

export type ServiceOrderTechnicalCommandLogRecord = {
  id: string;
  logicalKey: string;
  payloadHash: string;
  operation: "CONSUME_ON_READY" | "RELEASE_ON_CANCEL" | "MANUAL_REVERSAL";
  serviceOrderId: string;
  operatorId: string | null;
  operatorNameSnapshot: string;
  affectedItems: number;
  resultOrderStatus: string;
  createdAt: string;
};

export type ConsumeReadyOrderProjection = {
  id: string;
  status: string;
  technicianResponsible: string | null;
  technicianUserId: string | null;
  technicianProfitPercentSnapshot?: number | null;
  partsCost: number;
  laborCost: number;
  discount: number;
  totalAmount: number;
};

export type ConsumeReadyResult = {
  order: ConsumeReadyOrderProjection;
  consumedItems: ServiceOrderPartPublicProjection[];
  movements: TechnicalPartMovementPublicProjection[];
  affectedItems: number;
  affectedUnits: number;
  idempotentReplay: boolean;
};

export type CancelTechnicalResult = {
  order: ConsumeReadyOrderProjection;
  releasedItems: ServiceOrderPartPublicProjection[];
  movements: TechnicalPartMovementPublicProjection[];
  affectedItems: number;
  affectedUnits: number;
  idempotentReplay: boolean;
};

export type ManualReversalResult = ReserveTechnicalPartResult;

export type ServiceOrderPartRecord = {
  id: string;
  serviceOrderId: string;
  technicalPartId: string;
  partNameSnapshot: string;
  partSkuSnapshot: string | null;
  unitCostSnapshot: number;
  unitPriceSnapshot: number;
  quantity: number;
  totalCostSnapshot: number;
  totalPriceSnapshot: number;
  state: ServiceOrderPartState;
  reservedAt: string;
  consumedAt: string | null;
  releasedAt: string | null;
  reversedAt: string | null;
  responsibleUserId: string | null;
  responsibleUserNameSnapshot: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type TechnicalOrderTotals = {
  partsCost: number;
  laborCost: number;
  discount: number;
  totalAmount: number;
};

export type ReserveTechnicalPartResult = {
  item: ServiceOrderPartPublicProjection;
  movement: TechnicalPartMovementPublicProjection;
  totals: TechnicalOrderTotals;
  idempotentReplay: boolean;
};

export type TransactionResult<T> = {
  value: T;
  durationMs: number;
  journalMode: string;
};

export type IdempotentResponse<T> = {
  value: T;
  replay: boolean;
  payloadHash: string;
};

export type TechnicalPartPublicProjection = Record<string, unknown>;

export type ServiceOrderPartPublicProjection = {
  id: string;
  serviceOrderId: string;
  technicalPartId: string;
  partNameSnapshot: string;
  partSkuSnapshot: string | null;
  unitPriceSnapshot: number;
  quantity: number;
  totalPriceSnapshot: number;
  state: ServiceOrderPartState;
  reservedAt: string;
  consumedAt: string | null;
  releasedAt: string | null;
  reversedAt: string | null;
  responsibleUserNameSnapshot: string;
  createdAt: string;
  updatedAt: string;
  subtotal: number;
  unitCostSnapshot?: number;
  totalCostSnapshot?: number;
};

export type TechnicalPartMovementPublicProjection = {
  id: string;
  technicalPartId: string;
  serviceOrderPartId: string | null;
  type: TechnicalPartMovementType;
  quantity: number;
  onHandBefore: number | null;
  onHandAfter: number | null;
  reservedBefore: number;
  reservedAfter: number;
  reason: string | null;
  operatorNameSnapshot: string;
  createdAt: string;
  unitCostSnapshot?: number | null;
};

export type TechnicalPartsForOrderResult = {
  items: ServiceOrderPartPublicProjection[];
  totals: TechnicalOrderTotals;
  movements?: TechnicalPartMovementPublicProjection[];
};

export type FinancialProjection<T extends Record<string, unknown>> = T;

export type TechnicalPartMovementInvariant = {
  type: TechnicalPartMovementType;
  quantity: number;
  onHandBefore: number | null;
  onHandAfter: number | null;
  reservedBefore: number;
  reservedAfter: number;
};

export type ServiceOrderPartOperationalState = {
  state: ServiceOrderPartState;
  quantity: number;
};

export type StockTechnicalLogEvent = {
  operation: string;
  status: "success" | "error";
  durationMs: number;
  code?: string;
  replay?: boolean;
  affectedRows?: number;
};

export type StockTechnicalLogger = (event: StockTechnicalLogEvent) => void;

export type SqlValue = string | number | bigint | null | Uint8Array;

export type SqlRunResult = {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
};

export type StockPreparedStatement = {
  get(...params: SqlValue[]): Record<string, unknown> | undefined;
  all(...params: SqlValue[]): Array<Record<string, unknown>>;
  run(...params: SqlValue[]): SqlRunResult;
};

export type StockDatabase = {
  exec(sql: string): void;
  prepare(sql: string): StockPreparedStatement;
  close(): void;
};
