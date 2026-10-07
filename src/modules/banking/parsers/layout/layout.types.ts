export type BankCode =
  | 'MAYBANK'
  | 'MAYBANK_ISLAMIC'
  | 'CIMB'
  | 'PUBLIC_BANK'
  | 'RHB'
  | 'HONG_LEONG'
  | 'AMBANK'
  | 'OCBC'
  | 'UOB'
  | 'BANK_ISLAM'
  | 'AFFIN'
  | 'ALLIANCE'
  | 'STANDARD_CHARTERED'
  | 'HSBC'
  | 'UNKNOWN';

export type SuggestedExtractionMode =
  'NATIVE_TEXT' | 'OCR_ASSISTED' | 'HYBRID_VISION' | 'UNSUPPORTED';

export interface DocumentInspectionResult {
  isValidPdf: boolean;
  isEncrypted: boolean;
  pageCount: number;
  totalCharacters: number;
  averageCharsPerPage: number;
  isSearchableText: boolean;
  detectedBank: BankCode;
  bankDisplayName: string;
  detectedFormat: string;
  suggestedMode: SuggestedExtractionMode;
  accountNumber?: string;
  statementDate?: string;
  confidence: number;
  reasons: string[];
}

export interface ExtractedPage {
  pageNumber: number;
  rawText: string;
  lines: string[];
  tableLines: string[];
  metadataLines: string[];
}

export interface StructuredDocumentLayout {
  pageCount: number;
  totalCharacters: number;
  pages: ExtractedPage[];
  detectedBank: BankCode;
  detectedFormat: string;
}
