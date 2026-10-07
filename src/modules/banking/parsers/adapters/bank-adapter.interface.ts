import type {
  BankCode,
  DocumentInspectionResult,
  StructuredDocumentLayout,
} from '../layout/layout.types';
import type { ParsedStatementResult } from '../statement-parser.interface';

export const BANK_STATEMENT_ADAPTERS = Symbol('BANK_STATEMENT_ADAPTERS');

export interface IBankStatementAdapter {
  readonly bankCode: BankCode;
  readonly adapterVersion: string;

  /**
   * Evaluates if this adapter can process the given document inspection result.
   */
  supports(inspection: DocumentInspectionResult): boolean;

  /**
   * Deterministically parses the structured document layout into a canonical statement result.
   */
  parse(
    layout: StructuredDocumentLayout,
    inspection: DocumentInspectionResult,
  ): Promise<ParsedStatementResult>;
}
