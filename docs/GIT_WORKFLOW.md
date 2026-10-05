# Git Workflow & Release Engineering: Agentic Business OS

**Document Status:** Authoritative Git Workflow & Release Specification  
**Version:** 1.0.0  
**Authority:** Governs branching, commits, code reviews, migrations, and deployment strategies

---

## 1. Branch Strategy: GitHub Flow (Lightweight & Linear)

We employ a lightweight, trunk-based GitHub Flow optimized for high velocity, clean history, and continuous integration.

```
      (main branch)
───────────●───────────────────●───────────────────●──────────> [Production]
            \                 / (Squash & Merge)
             ●───●───●───────●
             (feat/statement-parser)
```

### 1.1 Branch Naming Conventions

All branch names must be lowercase, hyphen-separated, and prefixed by intent:

- `feat/<scope>-<description>`: New functionality (e.g., `feat/banking-statement-ocr`).
- `fix/<scope>-<description>`: Bug fix (e.g., `fix/ledger-rounding-discrepancy`).
- `perf/<scope>-<description>`: Performance optimization (e.g., `perf/reconciliation-query-index`).
- `docs/<description>`: Documentation only (e.g., `docs/update-api-standards`).
- `chore/<description>`: Dependency bumps, tooling changes (e.g., `chore/bump-prisma-version`).
- `hotfix/<description>`: Urgent production fix directly targeting `main`.

---

## 2. Commit Message Conventions (Conventional Commits)

Commit messages must follow the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <short imperative description>

[optional body explaining WHY, business context, or tradeoffs]

[optional footer(s): Closes #123, Breaking Changes]
```

### 2.1 Types

- `feat`: A new user-facing feature or API endpoint.
- `fix`: A bug fix in existing code.
- `perf`: Code change that improves performance without altering behavior.
- `test`: Adding or correcting tests; no production code change.
- `docs`: Documentation updates only.
- `refactor`: Code change that neither fixes a bug nor adds a feature.
- `chore`: Build scripts, CI workflow, or package updates.

### 2.2 Examples

- `feat(ledger): enforce double-entry validation on draft journal entries`
- `fix(banking): correct minor currency unit conversion in CSV parser`
- `docs(ux): add keyboard navigation shortcuts to UX principles`

---

## 3. Pull Request (PR) & Review Standards

### 3.1 Pull Request Requirements

Every PR must include:

1. **Summary:** Clear explanation of what was changed and why.
2. **Deterministic Test Plan:** Step-by-step instructions on how the reviewer can verify the change.
3. **Automated CI Green:** All linting, type-checking, unit tests, integration tests, and build checks must pass.
4. **No Giant PRs:** PRs should ideally be under 400 lines of code changes (excluding auto-generated lockfiles or schema migrations). Split large features into iterative, reviewable chunks.

### 3.2 Code Review Checklist

Reviewers verify:

- [ ] Does this PR adhere to [`/docs/CODING_STANDARDS.md`](file:///Users/mac/Desktop/projects/agentic_crm/docs/CODING_STANDARDS.md)?
- [ ] Are all financial arithmetic operations deterministic with zero floating point math?
- [ ] Is tenant isolation strictly enforced?
- [ ] Are new database queries indexed and free of N+1 cascades?
- [ ] Are tests included and passing deterministically?

### 3.3 Merge Policy

- **Squash and Merge:** PRs are squashed into a single clean commit on `main` to preserve a linear, bisectable commit history.

---

## 4. Database Migrations & Release Discipline

### 4.1 Zero-Downtime Deployment Sequence

1. **Step 1 (Pre-Deployment):** Run forward-compatible database migrations (`prisma migrate deploy`). New tables and nullable columns are created.
2. **Step 2 (Deployment):** Deploy new application containers (Next.js and NestJS) using rolling deployment.
3. **Step 3 (Post-Deployment):** Verify health checks (`/health/ready`).
4. **Step 4 (Cleanup):** In a subsequent release, run contract migrations to remove obsolete columns once all old containers have drained.

---

## 5. Rollback & Hotfix Protocols

- **Application Rollback:** If a deployment introduces a critical regression, immediately roll back container images to the previous stable release tag. Because database migrations are strictly additive/backward-compatible, the previous application version will continue running without database rollbacks.
- **Hotfixes:** Urgent hotfixes branch directly from `main` (`hotfix/patch-description`), undergo accelerated peer review, run full CI, and are squashed into `main` for instant deployment.
