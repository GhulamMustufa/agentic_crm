# Backend Engineering Standards: Agentic Business OS

**Document Status:** Authoritative Backend Architecture & Engineering Guidelines  
**Stack Target:** NestJS, TypeScript, PostgreSQL, Prisma / Kysely, Redis, BullMQ  
**Authority:** Governs all server-side APIs, domain services, worker processors, and database layers

---

## 1. Architectural Philosophy: Layered Clean Architecture

The backend is built with **NestJS**, structured to enforce a strict separation of concerns following Clean Architecture and Ports & Adapters (Hexagonal) principles.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PRESENTATION LAYER                              │
│  Controllers • HTTP Endpoints • DTO Validation • Route Guards • Interceptors│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Calls Application Services
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             APPLICATION LAYER                               │
│  Use-Case Services • Command Handlers • Query Handlers • Workflow Sagas     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Enforces Invariants / Operates On
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                DOMAIN LAYER                                 │
│  Entities • Value Objects • Domain Exceptions • Pure Accounting Math        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Uses Repositories & Adapters via DI
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INFRASTRUCTURE LAYER                             │
│  Database Repositories • BullMQ Workers • Redis Cache • S3 Storage • AI SDK │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Strict Layer Boundaries

1. **Controllers are Ultra-Thin:** Controllers only handle HTTP concerns: extracting route/query parameters, authenticating the request, passing validated DTOs to the application service, and mapping results to HTTP responses. **Controllers must never contain SQL queries, business logic, or monetary arithmetic.**
2. **Services Orchestrate Use-Cases:** Application services orchestrate data flow: starting database transactions, invoking domain validation rules, coordinating repositories, dispatching events, and enqueuing background worker jobs.
3. **Domain Entities Enforce Invariants:** Core accounting rules (e.g., verifying that debits equal credits, checking if a financial period is locked) belong in pure domain classes/methods.
4. **Repositories Encapsulate Data Access:** Repositories only perform queries and mutations. They do not decide whether a transaction is valid from an accounting perspective.

---

## 2. NestJS Module Organization

Every business capability is encapsulated within a focused NestJS Module:

```
src/modules/
├── identity/                         # Auth, Users, Roles, Tenant Membership
├── organization/                     # Tenant profiles, Fiscal Years, Settings
├── ledger/                           # Chart of Accounts, Journal Entries, Balance Engine
├── banking/                          # Bank Accounts, Statement Ingestion, Parser
├── reconciliation/                   # Matching rules, Proposals, Cleared balances
├── invoices/                         # AR/AP, Vendor Bills, Customer Invoices
├── audit/                            # Immutable system event trail
└── ai-agent/                         # Agent tools, LLM extraction adapters, prompts
```

### 2.1 Module Structure Conventions

Each module must follow a uniform directory layout:

```
modules/banking/
├── banking.module.ts                 # NestJS Module definition
├── controllers/                      # HTTP API controllers
│   ├── bank-account.controller.ts
│   └── bank-statement.controller.ts
├── services/                         # Application use cases
│   ├── ingest-statement.service.ts
│   └── bank-reconciliation.service.ts
├── repositories/                     # Data access layer
│   └── bank-statement.repository.ts
├── dto/                              # Request / Response DTOs
│   ├── upload-statement.dto.ts
│   └── statement-response.dto.ts
├── entities/                         # Domain models
│   └── bank-statement.entity.ts
├── workers/                          # BullMQ job processors
│   └── statement-parser.processor.ts
└── __tests__/                        # Unit & integration tests
```

---

## 3. Dependency Injection & Inversion of Control

- **Inject Interfaces / Abstract Tokens:** Application services must depend on repository interfaces or abstract tokens, allowing easy swapping with in-memory mocks during unit testing.
- **Avoid Circular Dependencies:** Modules must not have circular imports. If Module A and Module B need to communicate, use domain events (`EventEmitter2` or BullMQ message queues) or introduce a shared application mediator.

---

## 4. Multi-Tenant Context & Security Enforcement

Multi-tenancy is the foundation of the platform. Under no circumstances may a request bypass tenant scoping.

### 4.1 TenantContext Service

The `TenantContext` service uses Node.js `AsyncLocalStorage` to provide request-scoped tenant isolation across all layers:

```typescript
@Injectable()
export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantSession>();

  static run(session: TenantSession, callback: () => Promise<void>): Promise<void> {
    return this.storage.run(session, callback);
  }

  get tenantId(): string {
    const session = TenantContext.storage.getStore();
    if (!session?.tenantId) {
      throw new UnauthorizedException('Missing tenant context in execution scope');
    }
    return session.tenantId;
  }

  get userId(): string {
    const session = TenantContext.storage.getStore();
    if (!session?.userId) {
      throw new UnauthorizedException('Missing user context in execution scope');
    }
    return session.userId;
  }
}
```

### 4.2 Guard Pipeline

Every protected route must pass through the standard guard chain:

1. `JwtAuthGuard`: Validates bearer token signature and expiration.
2. `TenantGuard`: Resolves active organization membership and sets `TenantContext`.
3. `RolesGuard`: Verifies that the user holds the required permissions (`@Roles('CONTROLLER', 'ADMIN')`).

---

## 5. DTOs & Boundary Validation

All incoming HTTP requests must be validated using `class-validator` and `class-transformer` or `ZodValidationPipe`.

### 5.1 Global Validation Pipe Configuration

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip properties not defined in the DTO
    forbidNonWhitelisted: true, // Throw error if unknown properties are sent
    transform: true, // Transform payloads to DTO instances
    transformOptions: { enableImplicitConversion: false },
  }),
);
```

### 5.2 Example DTO Specification

```typescript
export class CreateJournalEntryDto {
  @IsUUID('4')
  @IsNotEmpty()
  accountId!: string;

  @IsDateString()
  entryDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(255)
  description!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  @ArrayMinSize(2, { message: 'A journal entry must contain at least 2 lines (debit and credit)' })
  lines!: JournalEntryLineDto[];
}
```

---

## 6. Database Transactions & Atomicity

Financial operations must maintain ACID guarantees. Any operation that touches multiple ledger lines, bank balances, or invoices must execute within an explicit database transaction.

### 6.1 Transaction Unit-of-Work Pattern

```typescript
@Injectable()
export class PostJournalEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
    private readonly auditService: AuditService,
  ) {}

  async execute(dto: CreateJournalEntryDto): Promise<JournalEntryResponseDto> {
    const tenantId = this.tenantContext.tenantId;

    // 1. Pure domain validation
    this.assertDoubleEntryBalance(dto.lines);

    // 2. Atomic database transaction
    return await this.prisma.$transaction(async (tx) => {
      // Check period lock inside transaction to prevent race conditions
      await this.assertPeriodOpen(tx, tenantId, dto.entryDate);

      const entry = await tx.journalEntry.create({
        data: {
          tenantId,
          entryDate: new Date(dto.entryDate),
          description: dto.description,
          lines: {
            create: dto.lines.map((l) => ({
              tenantId,
              accountId: l.accountId,
              debitAmount: l.debitAmount,
              creditAmount: l.creditAmount,
            })),
          },
        },
        include: { lines: true },
      });

      // Update materialized balances
      await this.updateAccountBalances(tx, tenantId, dto.lines);

      // Audit log entry
      await this.auditService.logWithTx(tx, {
        action: 'JOURNAL_ENTRY_POSTED',
        entityId: entry.id,
        tenantId,
      });

      return JournalEntryResponseDto.fromEntity(entry);
    });
  }
}
```

---

## 7. Background Processing & Worker Standards

Long-running workflows (PDF OCR parsing, multi-month reconciliation, batch export) must run asynchronously via **BullMQ** backed by Redis.

### 7.1 Queue Rules

- **Queue Naming:** Prefixed by namespace and tenant type: `business-os:statement-parsing`, `business-os:audit-logging`.
- **Idempotency Key / Job ID:** Set `jobId` explicitly to prevent duplicate jobs:
  ```typescript
  await this.statementQueue.add(
    'parse-statement',
    { statementId, tenantId },
    {
      jobId: `stmt-parse-${statementId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  );
  ```
- **Graceful Failure:** Workers must catch unrecoverable errors (e.g., corrupted file) and mark the job failed with a clear reason rather than retrying indefinitely.

---

## 8. Error Handling & Global Filters

All exceptions thrown within the application are intercepted by a global NestJS `HttpExceptionFilter`:

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.resolveHttpStatus(exception);
    const errorCode = this.resolveErrorCode(exception);
    const correlationId = request.headers['x-correlation-id'] || randomUUID();

    // Log unexpected 500 errors with full stack trace; log 4xx errors as warnings
    if (status >= 500) {
      this.logger.error(`Internal error [${correlationId}]:`, exception);
    } else {
      this.logger.warn(`Handled error [${correlationId}] [${errorCode}]: ${exception}`);
    }

    response.status(status).json({
      statusCode: status,
      errorCode,
      message: this.sanitizeMessage(exception, status),
      correlationId,
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## 9. Testing Standards for Backend

- **Unit Tests:** Fast, isolated tests for application services and domain entities. Mock repositories using typed interfaces.
- **Integration Tests:** Use **Testcontainers** to spin up an ephemeral PostgreSQL database and Redis instance. Run real Prisma migrations and test multi-tenant constraints and transactions directly against PostgreSQL.
- **API E2E Tests:** Execute Supertest requests hitting compiled NestJS endpoints, verifying route guards, DTO validation pipes, and response serialization.
