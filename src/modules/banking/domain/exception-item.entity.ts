export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ExceptionStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export type ExceptionType =
  | 'DUPLICATE_STATEMENT'
  | 'DUPLICATE_TRANSACTION'
  | 'MALFORMED_PDF'
  | 'MISSING_FIELDS'
  | 'AMBIGUOUS_TRANSACTION'
  | 'EXTRACTION_UNCERTAIN'
  | 'UNMATCHED_PAYMENT'
  | 'UNRECOGNIZED_VENDOR'
  | 'AI_TIMEOUT'
  | 'AI_FAILURE'
  | 'UNASSIGNED_STATEMENT';

export interface ExceptionItemEntity {
  id: string;
  tenantId: string;
  entityType: 'STATEMENT' | 'BANK_TRANSACTION' | 'PROPOSAL' | 'INVOICE';
  entityId: string;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  reason: string;
  evidence?: unknown[];
  proposedResolution?: Record<string, unknown>;
  status: ExceptionStatus;
  resolvedByUserId?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
