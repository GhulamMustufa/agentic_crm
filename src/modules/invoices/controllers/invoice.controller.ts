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
import { InvoiceService } from '../services/invoice.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { InvoiceType, InvoiceStatus } from '../domain/invoice.entity';
import type { CreateInvoiceDto, RecordPaymentDto, VoidInvoiceDto } from '../dto/invoice.dto';

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
@Controller('api/v1/invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  private requireTenant(user: TenantSessionContext): string {
    if (!user.tenantId) {
      throw new AuthorizationError('Tenant context required for invoice operations');
    }
    return user.tenantId;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createInvoice(@CurrentUser() user: TenantSessionContext, @Body() dto: CreateInvoiceDto) {
    const tenantId = this.requireTenant(user);
    const invoice = await this.invoiceService.createInvoice(tenantId, dto);
    return { data: serializeBigInt(invoice) };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async listInvoices(
    @CurrentUser() user: TenantSessionContext,
    @Query('counterpartyId') counterpartyId?: string,
    @Query('type') type?: InvoiceType,
    @Query('status') status?: InvoiceStatus,
  ) {
    const tenantId = this.requireTenant(user);
    const invoices = await this.invoiceService.listInvoices(tenantId, {
      counterpartyId,
      type,
      status,
    });
    return { data: serializeBigInt(invoices) };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getInvoice(@CurrentUser() user: TenantSessionContext, @Param('id') id: string) {
    const tenantId = this.requireTenant(user);
    const invoice = await this.invoiceService.getInvoiceById(tenantId, id);
    return { data: serializeBigInt(invoice) };
  }

  @Post(':id/post')
  @HttpCode(HttpStatus.OK)
  async postInvoice(@CurrentUser() user: TenantSessionContext, @Param('id') id: string) {
    const tenantId = this.requireTenant(user);
    const posted = await this.invoiceService.postInvoice(tenantId, user.userId, id);
    return { data: serializeBigInt(posted) };
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  async voidInvoice(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Body() dto: VoidInvoiceDto,
  ) {
    const tenantId = this.requireTenant(user);
    const voided = await this.invoiceService.voidInvoice(tenantId, user.userId, id, dto);
    return { data: serializeBigInt(voided) };
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(@CurrentUser() user: TenantSessionContext, @Body() dto: RecordPaymentDto) {
    const tenantId = this.requireTenant(user);
    const payment = await this.invoiceService.recordPayment(tenantId, user.userId, dto);
    return { data: serializeBigInt(payment) };
  }

  @Get('payments')
  @HttpCode(HttpStatus.OK)
  async listPayments(
    @CurrentUser() user: TenantSessionContext,
    @Query('counterpartyId') counterpartyId?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const payments = await this.invoiceService.listPayments(tenantId, counterpartyId);
    return { data: serializeBigInt(payments) };
  }
}
