export enum ExceptionType {
  LOW_CONFIDENCE = 'LOW_CONFIDENCE',
  UNKNOWN_TRANSACTION = 'UNKNOWN_TRANSACTION',
  DUPLICATE = 'DUPLICATE',
  INVOICE_MISMATCH = 'INVOICE_MISMATCH',
  MISSING_INFORMATION = 'MISSING_INFORMATION',
  RECONCILIATION_DISCREPANCY = 'RECONCILIATION_DISCREPANCY',
  PAYROLL_EXCEPTION = 'PAYROLL_EXCEPTION',
  INVENTORY_DISCREPANCY = 'INVENTORY_DISCREPANCY',
  FAILED_WORKFLOW = 'FAILED_WORKFLOW',
}

export enum ExceptionStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED',
}

export enum ResolutionAction {
  APPROVE = 'APPROVE',
  CORRECT = 'CORRECT',
  REJECT = 'REJECT',
  RETRY = 'RETRY',
  ESCALATE = 'ESCALATE',
}

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
  context: Record<string, any>;
  
  // Evidence for the exception (e.g. OCR text, mismatched fields)
  evidence: Record<string, any>;
  
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
