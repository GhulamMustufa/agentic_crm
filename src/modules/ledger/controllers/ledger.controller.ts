import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { AuthorizationError } from '../../../core/errors/app-error';
import { CurrentUser } from '../../../core/security/decorators/auth.decorators';
import { JwtAuthGuard } from '../../../core/security/guards/jwt-auth.guard';
import { LedgerService } from '../services/ledger.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type {
  CreateAccountDto,
  CreateJournalEntryDto,
  ReverseJournalEntryDto,
} from '../dto/ledger.dto';

function serializeBigInt(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, serializeBigInt(v)]));
  }
  return obj;
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  private requireTenant(user: TenantSessionContext): string {
    if (!user.tenantId) {
      throw new AuthorizationError('Tenant context required for ledger operations');
    }
    return user.tenantId;
  }

  @Post('accounts/seed-standard')
  @HttpCode(HttpStatus.CREATED)
  async seedStandardAccounts(@CurrentUser() user: TenantSessionContext) {
    const tenantId = this.requireTenant(user);
    const accounts = await this.ledgerService.seedStandardChartOfAccounts(tenantId);
    return { data: accounts };
  }

  @Post('fiscal-years')
  @HttpCode(HttpStatus.CREATED)
  async createFiscalYear(@CurrentUser() user: TenantSessionContext, @Body('year') year: number) {
    const tenantId = this.requireTenant(user);
    const result = await this.ledgerService.createFiscalYearAndPeriods(
      tenantId,
      year || new Date().getFullYear(),
    );
    return { data: result };
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  async createAccount(@CurrentUser() user: TenantSessionContext, @Body() dto: CreateAccountDto) {
    const tenantId = this.requireTenant(user);
    const account = await this.ledgerService.createAccount(tenantId, dto);
    return { data: account };
  }

  @Get('accounts')
  @HttpCode(HttpStatus.OK)
  async listAccounts(
    @CurrentUser() user: TenantSessionContext,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const accounts = await this.ledgerService.listAccounts(tenantId, activeOnly === 'true');
    return { data: accounts };
  }

  @Post('journal-entries')
  @HttpCode(HttpStatus.CREATED)
  async postJournalEntry(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: CreateJournalEntryDto,
  ) {
    const tenantId = this.requireTenant(user);
    const entry = await this.ledgerService.postJournalEntry(tenantId, user.userId, dto);
    return { data: serializeBigInt(entry) };
  }

  @Get('journal-entries')
  @HttpCode(HttpStatus.OK)
  async listJournalEntries(
    @CurrentUser() user: TenantSessionContext,
    @Query('periodId') periodId?: string,
    @Query('status') status?: 'DRAFT' | 'POSTED' | 'REVERSED',
  ) {
    const tenantId = this.requireTenant(user);
    const entries = await this.ledgerService.listEntries(tenantId, { periodId, status });
    return { data: serializeBigInt(entries) };
  }

  @Get('journal-entries/:id')
  @HttpCode(HttpStatus.OK)
  async getJournalEntry(@CurrentUser() user: TenantSessionContext, @Param('id') id: string) {
    const tenantId = this.requireTenant(user);
    const entry = await this.ledgerService.getEntryById(tenantId, id);
    return { data: serializeBigInt(entry) };
  }

  @Post('journal-entries/:id/reverse')
  @HttpCode(HttpStatus.OK)
  async reverseJournalEntry(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Body() dto: ReverseJournalEntryDto,
  ) {
    const tenantId = this.requireTenant(user);
    const reversed = await this.ledgerService.reverseJournalEntry(tenantId, user.userId, id, dto);
    return { data: serializeBigInt(reversed) };
  }

  @Get('reports/trial-balance')
  @HttpCode(HttpStatus.OK)
  async getTrialBalance(
    @CurrentUser() user: TenantSessionContext,
    @Query('periodId') periodId: string,
  ) {
    const tenantId = this.requireTenant(user);
    const report = await this.ledgerService.getTrialBalance(tenantId, periodId);
    return { data: serializeBigInt(report) };
  }

  @Get('reports/profit-and-loss')
  @HttpCode(HttpStatus.OK)
  async getProfitAndLoss(
    @CurrentUser() user: TenantSessionContext,
    @Query('periodId') periodId: string,
  ) {
    const tenantId = this.requireTenant(user);
    const report = await this.ledgerService.getProfitAndLoss(tenantId, periodId);
    return { data: serializeBigInt(report) };
  }

  @Get('reports/balance-sheet')
  @HttpCode(HttpStatus.OK)
  async getBalanceSheet(
    @CurrentUser() user: TenantSessionContext,
    @Query('periodId') periodId?: string,
    @Query('asOfPeriodId') asOfPeriodId?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const targetPeriodId = asOfPeriodId || periodId || '';
    const report = await this.ledgerService.getBalanceSheet(tenantId, targetPeriodId);
    return { data: serializeBigInt(report) };
  }
}
