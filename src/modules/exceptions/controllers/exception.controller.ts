import { Controller, Post, Get, Param, Body, Query, Req } from '@nestjs/common';
import { ExceptionService } from '../services/exception.service';
import { CreateExceptionDto, ResolveExceptionDto } from '../dto/exception.dto';
import { ExceptionStatus } from '../domain/exception.entity';

@Controller('exceptions')
export class ExceptionController {
  constructor(private readonly exceptionService: ExceptionService) {}

  @Post()
  async createException(@Body() dto: CreateExceptionDto, @Req() req: any) {
    const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
    return this.exceptionService.createException(tenantId, dto);
  }

  @Get()
  async getExceptions(
    @Req() req: any, 
    @Query('status') status?: ExceptionStatus
  ) {
    const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
    return this.exceptionService.getExceptions(tenantId, status);
  }

  @Post(':id/resolve')
  async resolveException(
    @Param('id') id: string,
    @Body() dto: ResolveExceptionDto,
    @Req() req: any
  ) {
    const tenantId = req.headers['x-tenant-id'] || 'default-tenant';
    const userId = req.headers['x-user-id'] || 'system-user';
    return this.exceptionService.resolveException(tenantId, id, userId, dto);
  }
}
