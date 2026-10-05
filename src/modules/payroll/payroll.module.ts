import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayrollController } from './controllers/payroll.controller';
import { PAYROLL_REPOSITORY_TOKEN } from './domain/payroll.repository.interface';
import { InMemoryPayrollRepository } from './repositories/in-memory-payroll.repository';
import { PayrollService } from './services/payroll.service';

@Module({
  imports: [LedgerModule, AuditModule],
  controllers: [PayrollController],
  providers: [
    {
      provide: PAYROLL_REPOSITORY_TOKEN,
      useClass: InMemoryPayrollRepository,
    },
    PayrollService,
  ],
  exports: [PayrollService, PAYROLL_REPOSITORY_TOKEN],
})
export class PayrollModule {}
