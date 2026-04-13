# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Project: EBON Panel

A Polish recruitment automation panel (EBON Panel) for managing participants and automating form submissions on projektebon.pl and FST portals using Playwright browser automation.

**Login:** admin / admin (hardcoded, session-based)

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
- **Browser automation**: playwright-core 1.59+ + Chromium via Nix (migrated from puppeteer-core for Blazor Server compatibility — `blazorFill()` helper uses `pressSequentially()` for Blazor SignalR inputs; EBON plain HTML uses `page.fill()`)

## Artifacts

- `artifacts/api-server` — Express API server on port 8080 (external port 80)
  - `/api/participants` — CRUD for participants
  - `/api/operations/validate` — validate participant data (PESEL, email, phone)
  - `/api/operations/plan` — generate scheduling plan
  - `/api/operations/simulate` — dry-run simulation of automation flow
  - `/api/operations/history` — operation log
  - `/api/dashboard/summary` — dashboard stats
  - `/api/settings/schedule` — schedule settings (GET/PUT)
  - `/api/automation/prewarm` — test Chromium launch
  - `/api/automation/run-single-sync/:id` — run automation for one participant
  - `/api/automation/run-all` — async batch automation
  - `/api/automation/status/:jobId` — poll job status
  - `/api/automation/fst-*` — FST portal automation endpoints

- `artifacts/ebon-panel` — React + Vite frontend on port 18384 (external port 3000)
  - Proxy: `/api` → `http://localhost:8080`
  - Pages: Pulpit, Uczestnicy, Walidacja, Plan, Automatyzacja, Ustawienia
  - Routes: `/`, `/uczestnicy`, `/walidacja`, `/plan`, `/symulacja`, `/ustawienia`

## NABOR 9 Info

- Open: 2026-04-10T16:00+02:00
- Close: 2026-04-16T17:00+02:00
- Portal: https://projektebon.pl
- FST portal: fst-lodzkie.teradane.com

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Chromium Path (Automation)

```
/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium
```

Or set `CHROMIUM_PATH` env var.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
