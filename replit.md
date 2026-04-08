# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter
- **Browser automation**: Puppeteer + Chromium (system Nix package)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## EBON Panel — Web Dashboard

Full-stack Polish-language recruitment participant management dashboard.

### Architecture
- **Frontend**: `artifacts/ebon-panel/` — React + Vite app with 6 pages
- **Backend**: `artifacts/api-server/` — Express 5 REST API
- **Database**: PostgreSQL with 3 tables (participants, operations, settings)
- **API spec**: `lib/api-spec/openapi.yaml` — OpenAPI 3.0 spec
- **Generated code**: `lib/api-zod/` (Zod schemas), `lib/api-client/` (React Query hooks via Orval)

### Pages (all Polish)
1. **Pulpit** (`/`) — Dashboard with stats, operation history, quick actions
2. **Uczestnicy** (`/uczestnicy`) — CRUD table for 8 recruitment participants
3. **Walidacja** (`/walidacja`) — Data validation (PESEL checksum, email, phone)
4. **Plan** (`/plan`) — Generate scheduled action plans (workers, time slots)
5. **Automatyzacja** (`/symulacja`) — Real Puppeteer browser automation against projektebon.pl
6. **Ustawienia** (`/ustawienia`) — Schedule/portal configuration

### Database Tables
- `participants` — Full participant data (imie, nazwisko, PESEL, email, telefon, address, portal login/password)
- `operations` — Operation history log (validate/plan/simulate runs)
- `settings` — Key-value configuration store (schedule params, portal URL)

### API Routes
- `GET/POST /api/participants` — List/create participants
- `GET/PATCH/DELETE /api/participants/:id` — Read/update/delete participant
- `POST /api/operations/validate` — Run PESEL/email/phone validation
- `POST /api/operations/plan` — Generate time-slotted action plan
- `POST /api/operations/simulate` — Run screen-by-screen portal simulation
- `GET /api/operations/history` — List recent operations
- `GET /api/dashboard/summary` — Dashboard statistics
- `GET/PUT /api/settings/schedule` — Read/update schedule settings

### Data
- 8 real participants pre-seeded (Łódź area, recruitment context)
- Simulation stops before actual portal submission (safety by design)

## EBON CLI (legacy)

Python CLI toolkit located in `ebon_bezpieczny_pakiet/`. Run with Python 3.11 (`python3`).

### Structure
- `src/ebon_orchestrator/` — CLI modules: `cli.py`, `validator.py`, `planner.py`, `simulator.py`
- `data/participants_template.csv` — participant record template (no sensitive data)
- `config/config.example.yaml` — project settings example

### Usage
```bash
cd ebon_bezpieczny_pakiet
export PYTHONPATH=src
python3 -m ebon_orchestrator.cli validate --csv data/participants_template.csv --out sample_output/validate
python3 -m ebon_orchestrator.cli plan --csv data/participants_template.csv --start 2026-04-10T16:00:00+02:00 --workers 3 --spacing-sec 2 --out sample_output/plan
python3 -m ebon_orchestrator.cli simulate --csv data/participants_template.csv --config config/config.example.yaml --out sample_output/simulate
```

### Dependencies
- `pyyaml>=6.0` (installed via uv/pip)
