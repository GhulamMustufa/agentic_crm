export const ExceptionType = {
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  UNKNOWN_TRANSACTION: 'UNKNOWN_TRANSACTION',
  DUPLICATE: 'DUPLICATE',
  INVOICE_MISMATCH: 'INVOICE_MISMATCH',
  MISSING_INFORMATION: 'MISSING_INFORMATION',
  RECONCILIATION_DISCREPANCY: 'RECONCILIATION_DISCREPANCY',
  PAYROLL_EXCEPTION: 'PAYROLL_EXCEPTION',
  INVENTORY_DISCREPANCY: 'INVENTORY_DISCREPANCY',
  FAILED_WORKFLOW: 'FAILED_WORKFLOW',
} as const;

export type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];

export const ExceptionStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  ESCALATED: 'ESCALATED',
} as const;

export type ExceptionStatus = (typeof ExceptionStatus)[keyof typeof ExceptionStatus];

export const ResolutionAction = {
  APPROVE: 'APPROVE',
  CORRECT: 'CORRECT',
  REJECT: 'REJECT',
  RETRY: 'RETRY',
  ESCALATE: 'ESCALATE',
} as const;

export type ResolutionAction = (typeof ResolutionAction)[keyof typeof ResolutionAction];

export interface ExceptionHistoryEntry {
  action: string;
  timestamp: Date;
  actorId: string;
  notes?: string;
}

export interface ExceptionEntity {
  id: string;
  tenantId: string;
  type: ExceptionType;
  status: ExceptionStatus;
  
  // The context in which the exception occurred (e.g. transaction ID, invoice ID)
  context: Record<string, unknown>;
  
  // Evidence for the exception (e.g. OCR text, mismatched fields)
  evidence: Record<string, unknown>;
  
  // AI recommendation for resolution
  aiRecommendation: string;
  
  // Confidence score from the AI model (0-100)
  confidence: number;
  
  // Reason for the exception
  reason: string;
  
  // Available actions for this specific exception
  availableActions: ResolutionAction[];
  
  // History of the exception lifecycle
  history: ExceptionHistoryEntry[];

  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionAction?: ResolutionAction;
}
