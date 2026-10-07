import {
  Controller,
  Post,
  Get,
  Patch,
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
import { InventoryService } from '../services/inventory.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { InventoryAlertStatus } from '../domain/inventory-alert.entity';
import type {
  CreateProductDto,
  UpdateProductDto,
  RecordPurchaseBatchDto,
  RecordSaleDto,
  RecordAdjustmentDto,
} from '../dto/inventory.dto';

function serializeBigInt(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (obj instanceof Date) {
    return obj.toISOString();
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
@Controller('api/v1/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  private requireTenant(user: TenantSessionContext): string {
    if (!user.tenantId) {
      throw new AuthorizationError('Tenant context required for inventory operations');
    }
    return user.tenantId;
  }

  // Products
  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@CurrentUser() user: TenantSessionContext, @Body() dto: CreateProductDto) {
    const tenantId = this.requireTenant(user);
    const product = await this.inventoryService.createProduct(tenantId, user.userId, dto);
    return { data: serializeBigInt(product) };
  }

  @Get('products')
  async listProducts(
    @CurrentUser() user: TenantSessionContext,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const products = await this.inventoryService.listProducts(tenantId, activeOnly === 'true');
    return { data: serializeBigInt(products) };
  }

  @Get('products/:id')
  async getProduct(@CurrentUser() user: TenantSessionContext, @Param('id') productId: string) {
    const tenantId = this.requireTenant(user);
    const product = await this.inventoryService.getProductById(tenantId, productId);
    return { data: serializeBigInt(product) };
  }

  @Patch('products/:id')
  async updateProduct(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    const tenantId = this.requireTenant(user);
    const product = await this.inventoryService.updateProduct(
      tenantId,
      user.userId,
      productId,
      dto,
    );
    return { data: serializeBigInt(product) };
  }

  @Get('products/:id/stock-balance')
  async getStockBalance(@CurrentUser() user: TenantSessionContext, @Param('id') productId: string) {
    const tenantId = this.requireTenant(user);
    const balance = await this.inventoryService.getStockBalance(tenantId, productId);
    return { data: { productId, availableStock: balance } };
  }

  // Purchases
  @Post('purchases')
  @HttpCode(HttpStatus.CREATED)
  async recordPurchaseBatch(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: RecordPurchaseBatchDto,
  ) {
    const tenantId = this.requireTenant(user);
    const result = await this.inventoryService.recordPurchaseBatch(tenantId, user.userId, dto);
    return { data: serializeBigInt(result) };
  }

  // Sales
  @Post('sales')
  @HttpCode(HttpStatus.CREATED)
  async recordSale(@CurrentUser() user: TenantSessionContext, @Body() dto: RecordSaleDto) {
    const tenantId = this.requireTenant(user);
    const result = await this.inventoryService.recordSale(tenantId, user.userId, dto);
    return { data: serializeBigInt(result) };
  }

  // Adjustments
  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  async recordAdjustment(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: RecordAdjustmentDto,
  ) {
    const tenantId = this.requireTenant(user);
    const result = await this.inventoryService.recordAdjustment(tenantId, user.userId, dto);
    return { data: serializeBigInt(result) };
  }

  // Valuation
  @Get('valuation')
  async getValuation(
    @CurrentUser() user: TenantSessionContext,
    @Query('asOfDate') asOfDate?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const valuation = await this.inventoryService.calculateValuation(tenantId, asOfDate);
    return { data: serializeBigInt(valuation) };
  }

  // Movements
  @Get('movements')
  async listMovements(
    @CurrentUser() user: TenantSessionContext,
    @Query('productId') productId?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const movements = await this.inventoryService.listStockMovements(tenantId, productId);
    return { data: serializeBigInt(movements) };
  }

  // Alerts
  @Get('alerts')
  async listAlerts(
    @CurrentUser() user: TenantSessionContext,
    @Query('status') status?: InventoryAlertStatus,
  ) {
    const tenantId = this.requireTenant(user);
    const alerts = await this.inventoryService.listAlerts(tenantId, status);
    return { data: serializeBigInt(alerts) };
  }

  @Post('alerts/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissAlert(@CurrentUser() user: TenantSessionContext, @Param('id') alertId: string) {
    const tenantId = this.requireTenant(user);
    const alert = await this.inventoryService.dismissAlert(tenantId, user.userId, alertId);
    return { data: serializeBigInt(alert) };
  }
}
