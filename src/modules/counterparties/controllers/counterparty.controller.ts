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
import { CounterpartyService } from '../services/counterparty.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { CounterpartyType } from '../domain/counterparty.entity';
import type { CreateCounterpartyDto, UpdateCounterpartyDto } from '../dto/counterparty.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/counterparties')
export class CounterpartyController {
  constructor(private readonly counterpartyService: CounterpartyService) {}

  private requireTenant(user: TenantSessionContext): string {
    if (!user.tenantId) {
      throw new AuthorizationError('Tenant context required for counterparty operations');
    }
    return user.tenantId;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCounterparty(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: CreateCounterpartyDto,
  ) {
    const tenantId = this.requireTenant(user);
    const item = await this.counterpartyService.createCounterparty(tenantId, user.userId, dto);
    return { data: item };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async listCounterparties(
    @CurrentUser() user: TenantSessionContext,
    @Query('type') type?: CounterpartyType,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const items = await this.counterpartyService.listCounterparties(
      tenantId,
      type,
      activeOnly === 'true',
    );
    return { data: items };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getCounterparty(@CurrentUser() user: TenantSessionContext, @Param('id') id: string) {
    const tenantId = this.requireTenant(user);
    const item = await this.counterpartyService.findById(tenantId, id);
    return { data: item };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateCounterparty(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') id: string,
    @Body() dto: UpdateCounterpartyDto,
  ) {
    const tenantId = this.requireTenant(user);
    const item = await this.counterpartyService.updateCounterparty(tenantId, user.userId, id, dto);
    return { data: item };
  }
}
