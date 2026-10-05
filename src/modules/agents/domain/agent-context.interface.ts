export interface AgentContext {
  tenantId: string;
  userId: string;
  roles: string[];
  correlationId: string;
}
