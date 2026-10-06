import { Controller, Post, Get, Param, Body, Query, Req } from '@nestjs/common';
import { Request } from 'express';

import { ExceptionStatus } from '../domain/exception.entity';
import { CreateExceptionDto, ResolveExceptionDto } from '../dto/exception.dto';
import { ExceptionService } from '../services/exception.service';

@Controller('exceptions')
export class ExceptionController {
  constructor(private readonly exceptionService: ExceptionService) {}

  @Post()
  async createException(@Body() dto: CreateExceptionDto, @Req() req: Request) {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default-tenant';
    return this.exceptionService.createException(tenantId, dto);
  }

  @Get()
  async getExceptions(@Req() req: Request, @Query('status') status?: ExceptionStatus) {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default-tenant';
    return this.exceptionService.getExceptions(tenantId, status);
  }

  @Post(':id/resolve')
  async resolveException(
    @Param('id') id: string,
    @Body() dto: ResolveExceptionDto,
    @Req() req: Request,
  ) {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default-tenant';
    const userId = (req.headers['x-user-id'] as string) || 'system-user';
    return this.exceptionService.resolveException(tenantId, id, userId, dto);
  }
}
