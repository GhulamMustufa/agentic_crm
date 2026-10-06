import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { CurrentUser } from '../../../core/security/decorators/auth.decorators';
import { JwtAuthGuard } from '../../../core/security/guards/jwt-auth.guard';
import { OrganizationService } from '../services/organization.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type {
  CreateTenantDto,
  InviteMemberDto,
  UpdateTenantSettingsDto,
} from '../dto/organization.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1/organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: CreateTenantDto,
  ) {
    const tenant = await this.orgService.createOrganization(user.userId, dto);
    return { data: tenant };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getMyOrganizations(@CurrentUser() user: TenantSessionContext) {
    const tenants = await this.orgService.getUserOrganizations(user.userId);
    return { data: tenants };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOrganization(@CurrentUser() user: TenantSessionContext, @Param('id') tenantId: string) {
    const tenant = await this.orgService.getTenantById(tenantId, user.userId);
    return { data: tenant };
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async inviteMember(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') tenantId: string,
    @Body() dto: InviteMemberDto,
  ) {
    const result = await this.orgService.inviteMember(tenantId, user.userId, dto);
    return { data: result };
  }

  @Get(':id/members')
  @HttpCode(HttpStatus.OK)
  async getMembers(@CurrentUser() user: TenantSessionContext, @Param('id') tenantId: string) {
    const members = await this.orgService.getMembers(tenantId, user.userId);
    return { data: members };
  }

  @Get(':id/settings')
  @HttpCode(HttpStatus.OK)
  async getSettings(@CurrentUser() user: TenantSessionContext, @Param('id') tenantId: string) {
    const settings = await this.orgService.getSettings(tenantId, user.userId);
    return {
      data: {
        ...settings,
        maxAutoPostAmountCents: settings.maxAutoPostAmountCents.toString(),
        requireReceiptAboveCents: settings.requireReceiptAboveCents.toString(),
      },
    };
  }

  @Patch(':id/settings')
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    const settings = await this.orgService.updateSettings(tenantId, user.userId, dto);
    return {
      data: {
        ...settings,
        maxAutoPostAmountCents: settings.maxAutoPostAmountCents.toString(),
        requireReceiptAboveCents: settings.requireReceiptAboveCents.toString(),
      },
    };
  }
}
