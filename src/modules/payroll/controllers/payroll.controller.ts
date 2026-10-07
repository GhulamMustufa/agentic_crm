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
import { PayrollService } from '../services/payroll.service';

import type { TenantSessionContext } from '../../../core/context/tenant-context.service';
import type { EmployeeStatus } from '../domain/employee.entity';
import type { PayrollRunStatus } from '../domain/payroll-run.entity';
import type {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  SetCompensationConfigDto,
  CreatePayrollRunDto,
} from '../dto/payroll.dto';

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
@Controller('api/v1/payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  private requireTenant(user: TenantSessionContext): string {
    if (!user.tenantId) {
      throw new AuthorizationError('Tenant context required for payroll operations');
    }
    return user.tenantId;
  }

  // Employees
  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(@CurrentUser() user: TenantSessionContext, @Body() dto: CreateEmployeeDto) {
    const tenantId = this.requireTenant(user);
    const employee = await this.payrollService.createEmployee(tenantId, user.userId, dto);
    return { data: serializeBigInt(employee) };
  }

  @Get('employees')
  async listEmployees(
    @CurrentUser() user: TenantSessionContext,
    @Query('status') status?: EmployeeStatus,
  ) {
    const tenantId = this.requireTenant(user);
    const employees = await this.payrollService.listEmployees(tenantId, status);
    return { data: serializeBigInt(employees) };
  }

  @Get('employees/:id')
  async getEmployee(@CurrentUser() user: TenantSessionContext, @Param('id') employeeId: string) {
    const tenantId = this.requireTenant(user);
    const employee = await this.payrollService.getEmployeeById(tenantId, employeeId);
    return { data: serializeBigInt(employee) };
  }

  @Patch('employees/:id')
  async updateEmployee(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const tenantId = this.requireTenant(user);
    const employee = await this.payrollService.updateEmployee(
      tenantId,
      user.userId,
      employeeId,
      dto,
    );
    return { data: serializeBigInt(employee) };
  }

  // Compensation
  @Post('employees/:id/compensation')
  @HttpCode(HttpStatus.OK)
  async setCompensation(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') employeeId: string,
    @Body() dto: SetCompensationConfigDto,
  ) {
    const tenantId = this.requireTenant(user);
    const config = await this.payrollService.setCompensationConfig(
      tenantId,
      user.userId,
      employeeId,
      dto,
    );
    return { data: serializeBigInt(config) };
  }

  @Get('employees/:id/compensation')
  async getCompensation(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') employeeId: string,
  ) {
    const tenantId = this.requireTenant(user);
    const config = await this.payrollService.getCompensationConfig(tenantId, employeeId);
    return { data: serializeBigInt(config) };
  }

  // Payroll Runs
  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  async createPayrollRun(
    @CurrentUser() user: TenantSessionContext,
    @Body() dto: CreatePayrollRunDto,
  ) {
    const tenantId = this.requireTenant(user);
    const result = await this.payrollService.createPayrollRun(tenantId, user.userId, dto);
    return { data: serializeBigInt(result) };
  }

  @Get('runs')
  async listPayrollRuns(
    @CurrentUser() user: TenantSessionContext,
    @Query('status') status?: PayrollRunStatus,
  ) {
    const tenantId = this.requireTenant(user);
    const runs = await this.payrollService.listPayrollRuns(tenantId, status);
    return { data: serializeBigInt(runs) };
  }

  @Get('runs/:id')
  async getPayrollRun(@CurrentUser() user: TenantSessionContext, @Param('id') runId: string) {
    const tenantId = this.requireTenant(user);
    const result = await this.payrollService.getPayrollRunById(tenantId, runId);
    return { data: serializeBigInt(result) };
  }

  @Post('runs/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approvePayrollRun(@CurrentUser() user: TenantSessionContext, @Param('id') runId: string) {
    const tenantId = this.requireTenant(user);
    const run = await this.payrollService.approvePayrollRun(tenantId, user.userId, runId);
    return { data: serializeBigInt(run) };
  }

  @Post('runs/:id/post')
  @HttpCode(HttpStatus.OK)
  async postPayrollRun(@CurrentUser() user: TenantSessionContext, @Param('id') runId: string) {
    const tenantId = this.requireTenant(user);
    const result = await this.payrollService.postPayrollRunToLedger(tenantId, user.userId, runId);
    return { data: serializeBigInt(result) };
  }

  @Post('runs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelPayrollRun(@CurrentUser() user: TenantSessionContext, @Param('id') runId: string) {
    const tenantId = this.requireTenant(user);
    const run = await this.payrollService.cancelPayrollRun(tenantId, user.userId, runId);
    return { data: serializeBigInt(run) };
  }

  // Payslips
  @Get('runs/:id/payslips')
  async listPayslips(@CurrentUser() user: TenantSessionContext, @Param('id') runId: string) {
    const tenantId = this.requireTenant(user);
    const payslips = await this.payrollService.listPayslips(tenantId, runId);
    return { data: serializeBigInt(payslips) };
  }

  @Get('runs/:id/payslips/:employeeId')
  async getPayslip(
    @CurrentUser() user: TenantSessionContext,
    @Param('id') runId: string,
    @Param('employeeId') employeeId: string,
  ) {
    const tenantId = this.requireTenant(user);
    const payslip = await this.payrollService.getPayslip(tenantId, runId, employeeId);
    return { data: serializeBigInt(payslip) };
  }
}
