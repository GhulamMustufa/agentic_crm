import { Module } from '@nestjs/common';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayrollController } from './controllers/payroll.controller';
import { PAYROLL_REPOSITORY_TOKEN } from './domain/payroll.repository.interface';
import { PrismaPayrollRepository } from './repositories/prisma-payroll.repository';
import { PayrollService } from './services/payroll.service';

@Module({
  imports: [PrismaModule, LedgerModule, AuditModule],
  controllers: [PayrollController],
  providers: [
    {
      provide: PAYROLL_REPOSITORY_TOKEN,
      useClass: PrismaPayrollRepository,
    },
    PayrollService,
  ],
  exports: [PayrollService, PAYROLL_REPOSITORY_TOKEN],
})
export class PayrollModule {}
