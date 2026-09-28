---
name: typeorm
description: "TypeORM patterns and database development guidelines.\nTRIGGER when: planning or implementing features involving database, TypeORM entities, repositories, migrations, queries, or data source configuration.\nDO NOT TRIGGER when: only reading database code without intent to modify, working on frontend, or asking general TypeScript questions."
---

## Codex execution

Paths are repository-relative unless explicitly relative to this skill. Use the session's file-reading/editing tools and shell (`rg --files` for globs, `rg` for search; `rg --pcre2` when lookarounds are required). Tool labels such as Read/Grep/Glob/Write/Edit/Bash below describe operations, not required tool names. Load another skill by reading its available `SKILL.md`; pass the user's arguments in text.

Ask unresolved questions with an available question tool in the current mode, or in conversation; accept free text and preserve pending decisions until answered. Respect the tool's actual batch limit. Prior authorization remains valid; never treat silence as approval. Maintain progress in the workflow's existing artifact/checklist rather than tool-specific task IDs.

For reader delegation, read `.codex/agents/<name>.toml` and pass its developer instructions, inputs, repository root and applicable AGENTS/rule paths explicitly. Use named agents only when supported and permitted. Otherwise perform that exact read-only contract sequentially, including its filters, read bounds and output shape; this has no separate sandbox. Reader-only bounded reads are allowed in this fallback in addition to the caller's own reads. Do not fix a model or reasoning level.

Context7 may be replaced by official documentation for the installed library version when unavailable; record the fallback. Missing custom rule directories under `docs/codex/planning-rules/` mean no custom rules. Persistent commands use a retained shell session or `docker compose exec -d`, followed by readiness checks. Figma evidence-dependent steps use `docs/codex/figma-workflow.md`; missing capabilities must be reported, never fabricated.


# TypeORM Development Guidelines

Expert guidance for TypeORM with TypeScript, focused on the Data Mapper pattern, PostgreSQL, and enterprise application architecture.

**Core principles:** explicit types on all columns, Data Mapper over Active Record, migrations over synchronize, environment-based configuration, and bidirectional relationships with explicit foreign keys.

## Rules Index

Rules are organized by priority. Load the relevant rule file when working on that topic.

### CRITICAL — Configuration

- `rules/config-datasource-setup.md` — DataSource with env vars, pooling, SSL. Never hardcode credentials.
- `rules/config-typescript-settings.md` — Required tsconfig flags for decorators and metadata.

### CRITICAL — Entity Design

- `rules/entity-define-proper-structure.md` — Explicit table names, typed columns, timestamps.
- `rules/entity-primary-key-strategy.md` — Auto-increment vs UUID vs composite PK by context.
- `rules/entity-column-types.md` — Explicit column types, enums, JSON, soft delete, versioning.

### HIGH — Relationships

- `rules/rel-one-to-one-and-many.md` — Bidirectional OneToOne/OneToMany with JoinColumn and FK.
- `rules/rel-many-to-many.md` — ManyToMany with explicit JoinTable configuration.

### HIGH — Query Patterns

- `rules/query-repository-basics.md` — Repository CRUD: create, save, find, delete, softDelete.
- `rules/query-custom-repository.md` — Custom repositories for domain-specific queries.
- `rules/query-builder-and-n-plus-one.md` — QueryBuilder usage and N+1 prevention.

### HIGH — Migrations

- `rules/migration-workflow.md` — CLI commands, workflow, and why synchronize must be false.
- `rules/migration-file-structure.md` — Reversible migrations with proper up/down methods.

### MEDIUM-HIGH — Transactions

- `rules/tx-use-transactions.md` — QueryRunner and transaction callback for multi-entity writes.

### MEDIUM — Integration

- `rules/integ-nestjs-setup.md` — NestJS forRoot/forFeature setup with DI.

### MEDIUM — Conventions

- `rules/conv-eager-lazy-loading.md` — Explicit loading over eager/lazy; when to use each.
- `rules/conv-indexes-naming-cascades.md` — Indexes, SnakeNamingStrategy, cascade operations.

## Quick Reference

| Topic | Key Rule |
|-------|----------|
| New entity | Always: explicit table name, typed columns, timestamps |
| New relation | Always: bidirectional, @JoinColumn on owning side, explicit FK |
| New query | Prefer Repository API; use QueryBuilder for complex joins |
| Schema change | Generate migration, review SQL, implement down() |
| Multi-entity write | Wrap in transaction (QueryRunner or callback) |
| NestJS setup | forRoot() at app level, forFeature() per module |

## Metadata

- **Category index:** `rules/_sections.md`
- **Rule template:** `rules/_template.md`
- **Total rules:** 16 across 8 categories
