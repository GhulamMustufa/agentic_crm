import { describe, it, expect, beforeEach } from 'vitest';

import { BankAdapterRegistry } from '../../src/modules/banking/parsers/adapters/bank-adapter.registry';
import { GenericBankAdapter } from '../../src/modules/banking/parsers/adapters/generic-bank.adapter';

import type { IBankStatementAdapter } from '../../src/modules/banking/parsers/adapters/bank-adapter.interface';
import type { DocumentInspectionResult } from '../../src/modules/banking/parsers/layout/layout.types';
import type { ParsedStatementResult } from '../../src/modules/banking/parsers/statement-parser.interface';

describe('BankAdapterRegistry', () => {
  let registry: BankAdapterRegistry;
  let genericAdapter: GenericBankAdapter;

  beforeEach(() => {
    genericAdapter = new GenericBankAdapter();
    registry = new BankAdapterRegistry(genericAdapter);
  });

  it('returns generic fallback adapter when no matching bank adapter is registered', () => {
    const inspection: DocumentInspectionResult = {
      isValidPdf: true,
      isEncrypted: false,
      pageCount: 1,
      totalCharacters: 500,
      averageCharsPerPage: 500,
      isSearchableText: true,
      detectedBank: 'UNKNOWN',
      bankDisplayName: 'Unknown Bank',
      detectedFormat: 'GENERIC',
      suggestedMode: 'NATIVE_TEXT',
      confidence: 0.1,
      reasons: [],
    };

    const adapter = registry.getAdapter(inspection);
    expect(adapter).toBe(genericAdapter);
    expect(adapter.bankCode).toBe('UNKNOWN');
  });

  it('resolves registered specialized bank adapter for known bank', () => {
    const mockMaybankAdapter: IBankStatementAdapter = {
      bankCode: 'MAYBANK',
      adapterVersion: '2.0.0-maybank',
      supports: (ins) => ins.detectedBank === 'MAYBANK',
      parse: async (): Promise<ParsedStatementResult> => ({
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        openingBalanceCents: 1000n,
        closingBalanceCents: 2000n,
        totalDebitsCents: 0n,
        totalCreditsCents: 1000n,
        transactions: [],
      }),
    };

    registry.registerAdapter(mockMaybankAdapter);

    const inspection: DocumentInspectionResult = {
      isValidPdf: true,
      isEncrypted: false,
      pageCount: 1,
      totalCharacters: 1000,
      averageCharsPerPage: 1000,
      isSearchableText: true,
      detectedBank: 'MAYBANK',
      bankDisplayName: 'Malayan Banking Berhad',
      detectedFormat: 'MAYBANK_STATEMENT',
      suggestedMode: 'NATIVE_TEXT',
      confidence: 0.95,
      reasons: [],
    };

    const resolved = registry.getAdapter(inspection);
    expect(resolved).toBe(mockMaybankAdapter);
    expect(resolved.bankCode).toBe('MAYBANK');
  });

  it('lists all registered adapters with version lineage', () => {
    const mockCimbAdapter: IBankStatementAdapter = {
      bankCode: 'CIMB',
      adapterVersion: '1.2.0-cimb',
      supports: (ins) => ins.detectedBank === 'CIMB',
      parse: async () => ({}) as ParsedStatementResult,
    };

    registry.registerAdapter(mockCimbAdapter);
    const adapters = registry.listAdapters();

    expect(adapters.some((a) => a.bankCode === 'CIMB' && a.version === '1.2.0-cimb')).toBe(true);
    expect(adapters.some((a) => a.bankCode === 'UNKNOWN' && a.version === '1.0.0-generic')).toBe(
      true,
    );
  });

  it('initializes with all core Malaysian bank adapters registered by default', () => {
    const defaultRegistry = new BankAdapterRegistry();
    const adapters = defaultRegistry.listAdapters();
    const bankCodes = adapters.map((a) => a.bankCode);

    expect(bankCodes).toContain('MAYBANK');
    expect(bankCodes).toContain('CIMB');
    expect(bankCodes).toContain('PUBLIC_BANK');
    expect(bankCodes).toContain('RHB');
    expect(bankCodes).toContain('HONG_LEONG');
    expect(bankCodes).toContain('AMBANK');
    expect(bankCodes).toContain('BANK_ISLAM');
    expect(bankCodes).toContain('UNKNOWN');
  });
});
