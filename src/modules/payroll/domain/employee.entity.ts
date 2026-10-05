export type EmployeeStatus = 'ACTIVE' | 'TERMINATED' | 'LEAVE';
export type PayType = 'SALARY' | 'HOURLY';

export interface EmployeeEntity {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string;
  ssnLast4: string;
  department: string;
  jobTitle: string;
  payType: PayType;
  rateCents: bigint; // Annual salary in cents OR hourly rate in cents
  status: EmployeeStatus;
  hireDate: string; // YYYY-MM-DD
  terminationDate?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
