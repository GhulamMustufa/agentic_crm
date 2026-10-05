# Agentic Business OS

> Autonomous multi-tenant Agentic Business OS featuring deterministic double-entry accounting, AI exception orchestration, and immutable audit trails.

[![CI](https://github.com/GhulamMustufa/agentic_crm/actions/workflows/ci.yml/badge.svg)](https://github.com/GhulamMustufa/agentic_crm/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](<>)

---

## Overview

Agentic Business OS is an enterprise-grade multi-tenant SaaS designed to automate core business operations through deterministic software engines and controlled AI agents. Unlike simple chat assistants, this system executes concrete business workflows with zero direct LLM manipulation of authoritative financial records.

### Core Architecture Directives

1. **Deterministic Authority:** Double-entry general ledger, account balances, monetary arithmetic, and access controls are 100% deterministic and computed on the server.
2. **AI as Untrusted Advisory:** AI output is treated as advisory and staged for human/rules-based approval before ledger mutations occur ([ADR-0004](docs/adr/ADR-0004-ai-agent-staging-and-zero-direct-ledger-mutation.md)).
3. **Multi-Tenant Isolation:** Tenant boundary is strictly enforced via database partitioning, row-level security, and Node.js `AsyncLocalStorage` session context.
4. **Zero Secrets in Source:** Rigorous boundary validation, structured JSON logging with recursive PII/token redaction, and strict `.gitignore` safeguards.

---

## Phase 0: Implemented Foundation

- **Modular Monolith Core:** NestJS modular architecture with explicit layer boundaries ([ADR-0002](docs/adr/ADR-0002-modular-monolith-architecture.md)).
- **Identity & Authentication:** Dual JWT token model (15-min access token + rotating 7-day refresh token with SHA-256 session tracking).
- **Multi-Tenancy & RBAC:** Organization creation, slug collision safety, automated `OWNER` assignment, and granular tenant membership role checks.
- **Cryptographic Audit Trail:** SHA-256 hash-chained immutable audit log with genesis hash chaining and tamper detection.
- **Storage Abstraction:** Pluggable object storage (`LocalStorageDriver` & `S3StorageDriver`) with presigned URL capabilities.
- **Background Jobs:** Worker queue contracts with exponential backoff and dead-letter routing aligned with Transactional Outbox pattern ([ADR-0003](docs/adr/ADR-0003-transactional-outbox-and-bullmq.md)).
- **AI Gateway:** Provider abstraction layer with structured JSON schema output validation and latency simulation.
- **Feature Flags:** Environment defaults and per-tenant dynamic overrides.
- **Database & Migrations:** PostgreSQL 16+ relational schema with foreign key integrity and check constraints.
- **CI/CD Pipeline:** Automated GitHub Actions quality gate enforcing linting, typechecking, tests, format, and production builds.

---

## Project Structure

```
├── .github/workflows/       # CI/CD pipeline definitions
├── docs/                    # Authoritative engineering & architecture standards
│   ├── adr/                 # Architecture Decision Records
│   ├── ARCHITECTURE.md      # Master system design & domain map
│   ├── CODING_STANDARDS.md  # Engineering directives
│   └── DATABASE_SCHEMA.md   # Relational schemas & DDL
├── src/
│   ├── core/                # Reusable platform primitives
│   │   ├── ai/              # AI provider abstraction gateway
│   │   ├── config/          # Zod-validated environment configuration
│   │   ├── context/         # AsyncLocalStorage tenant context
│   │   ├── errors/          # RFC 7807 problem details error handling
│   │   ├── feature-flags/   # Tenant-aware feature toggling
│   │   ├── logging/         # RFC 5424 structured JSON logging with redaction
│   │   ├── queue/           # Background job abstraction
│   │   ├── security/        # JWT auth, password hasher, RBAC guards
│   │   └── storage/         # Pluggable object storage drivers
│   ├── migrations/          # PostgreSQL DDL migrations
│   └── modules/             # Bounded business domains
│       ├── audit/           # Hash-chained immutable audit log
│       ├── identity/        # Users, authentication, session tokens
│       └── organization/    # Tenants, memberships, organization settings
└── test/
    ├── integration/         # Supertest end-to-end API integration tests
    └── unit/                # Domain and service unit test suites
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/GhulamMustufa/agentic_crm.git
cd agentic_crm

# Install dependencies
npm ci

# Configure environment variables
cp .env.example .env
```

### Quality Gates & Verification

```bash
# Run unit & integration test suites
npm test

# Run strict TypeScript typechecking
npm run typecheck

# Run static code analysis
npm run lint

# Verify code formatting
npm run format:check

# Execute production build
npm run build
```

---

## Documentation Index

| Topic                     | Document                                                   |
| :------------------------ | :--------------------------------------------------------- |
| **System Architecture**   | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)             |
| **Coding Standards**      | [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md)     |
| **Database Schema**       | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md)       |
| **Frontend Standards**    | [`docs/FRONTEND_STANDARDS.md`](docs/FRONTEND_STANDARDS.md) |
| **Backend Standards**     | [`docs/BACKEND_STANDARDS.md`](docs/BACKEND_STANDARDS.md)   |
| **API Standards**         | [`docs/API_STANDARDS.md`](docs/API_STANDARDS.md)           |
| **Git Workflow**          | [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md)             |
| **Repository Governance** | [`AGENTS.md`](AGENTS.md)                                   |
