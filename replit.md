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

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## EBON — bezpieczny pakiet operacyjno-testowy

Python CLI toolkit located in `ebon_bezpieczny_pakiet/`. Run with Python 3.11 (`python3`).

### Structure
- `src/ebon_orchestrator/` — CLI modules: `cli.py`, `validator.py`, `planner.py`, `simulator.py`
- `data/participants_template.csv` — participant record template (no sensitive data)
- `config/config.example.yaml` — project settings example
- `docs/` — runbook, screen map, risk register, go-live checklist
- `scheduler/` — cron and systemd timer examples
- `tests/` — unit tests
- `sample_output/` — example command outputs

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
