import { Injectable, Logger } from '@nestjs/common';

import { AmBankAdapter } from './ambank.adapter';
import { BankIslamAdapter } from './bank-islam.adapter';
import { CimbAdapter } from './cimb.adapter';
import { GenericBankAdapter } from './generic-bank.adapter';
import { HongLeongAdapter } from './hong-leong.adapter';
import { MaybankAdapter } from './maybank.adapter';
import { PublicBankAdapter } from './public-bank.adapter';
import { RhbAdapter } from './rhb.adapter';

import type { IBankStatementAdapter } from './bank-adapter.interface';
import type { BankCode, DocumentInspectionResult } from '../layout/layout.types';

@Injectable()
export class BankAdapterRegistry {
  private readonly logger = new Logger(BankAdapterRegistry.name);
  private readonly adapters = new Map<BankCode, IBankStatementAdapter>();
  private readonly fallbackAdapter: GenericBankAdapter;

  constructor(
    fallbackAdapter?: GenericBankAdapter,
    maybankAdapter?: MaybankAdapter,
    cimbAdapter?: CimbAdapter,
    publicBankAdapter?: PublicBankAdapter,
    rhbAdapter?: RhbAdapter,
    hongLeongAdapter?: HongLeongAdapter,
    ambankAdapter?: AmBankAdapter,
    bankIslamAdapter?: BankIslamAdapter,
  ) {
    this.fallbackAdapter = fallbackAdapter ?? new GenericBankAdapter();
    this.registerAdapter(maybankAdapter ?? new MaybankAdapter());
    this.registerAdapter(cimbAdapter ?? new CimbAdapter());
    this.registerAdapter(publicBankAdapter ?? new PublicBankAdapter());
    this.registerAdapter(rhbAdapter ?? new RhbAdapter());
    this.registerAdapter(hongLeongAdapter ?? new HongLeongAdapter());
    this.registerAdapter(ambankAdapter ?? new AmBankAdapter());
    this.registerAdapter(bankIslamAdapter ?? new BankIslamAdapter());
  }

  /**
   * Registers a specialized bank statement adapter.
   */
  registerAdapter(adapter: IBankStatementAdapter): void {
    if (adapter.bankCode === 'UNKNOWN') {
      return;
    }
    this.adapters.set(adapter.bankCode, adapter);
    if (adapter.bankCode === 'MAYBANK') {
      this.adapters.set('MAYBANK_ISLAMIC', adapter);
    }
    this.logger.log(
      `Registered bank statement adapter for ${adapter.bankCode} (${adapter.adapterVersion})`,
    );
  }

  /**
   * Resolves the best matching adapter for a document inspection result.
   */
  getAdapter(inspection: DocumentInspectionResult): IBankStatementAdapter {
    // 1. Direct bank code lookup
    if (inspection.detectedBank !== 'UNKNOWN') {
      const directAdapter = this.adapters.get(inspection.detectedBank);
      if (directAdapter && directAdapter.supports(inspection)) {
        return directAdapter;
      }
    }

    // 2. Iterate registered adapters to test support
    for (const adapter of this.adapters.values()) {
      if (adapter.supports(inspection)) {
        return adapter;
      }
    }

    // 3. Fall back to generic adapter
    return this.fallbackAdapter;
  }

  /**
   * Lists all currently registered bank statement adapters.
   */
  listAdapters(): Array<{ bankCode: BankCode; version: string }> {
    const list: Array<{ bankCode: BankCode; version: string }> = [];
    for (const adapter of this.adapters.values()) {
      list.push({
        bankCode: adapter.bankCode,
        version: adapter.adapterVersion,
      });
    }
    list.push({
      bankCode: this.fallbackAdapter.bankCode,
      version: this.fallbackAdapter.adapterVersion,
    });
    return list;
  }
}
