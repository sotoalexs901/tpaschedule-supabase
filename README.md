
# TPA Schedule — Firebase Edition (Dashboard + Schedule + Budget)

## Features

- Login by **user + PIN** with roles:
  - `anapoles` → Station Manager
  - `amartinez`, `ogiraldo`, `gmoya` → Duty Managers
- Dashboard for Duty Managers:
  - Station Manager message
  - Photos (metadata)
  - Documents (metadata)
  - Events
  - Notices / invitations
- Dashboard Editor for Station Manager.
- Employees management (replaces Employee Database sheet).
- Blocked Employees (PTO, Sick, Day Off, Maternity, Suspended).
- Weekly Schedule builder:
  - Multiple rows per employee (two shifts / 24h coverage).
  - Hours sum per employee.
  - Hours per airline vs weekly budget.
  - Submit schedule for approval.
- Approval screen for Station Manager.

## Firestore Collections (minimal)

- `users`:
  - `username`, `pin`, `role`

- `employees`:
  - `name`, `position`, `department`, `status`

- `restrictions`:
  - `employeeId`, `reason`, `start_date`, `end_date`

- `airlineBudgets`:
  - `airline`, `weekStart`, `budgetHours`

- `schedules`:
  - `weekStart`, `status`, `createdAt`

- `schedules/{scheduleId}/shifts`:
  - `dateDay`, `employeeId`, `airline`, `role`, `start`, `end`

- `dashboard` (doc `main`):
  - `message`, `updatedAt`, `updatedBy`

- `dashboard_photos`, `dashboard_docs`, `dashboard_events`, `dashboard_notices`


## Setup

1. Create a Firebase project and a Web App.
2. Enable **Cloud Firestore**.
3. Copy `.env.example` to `.env` and fill Firebase config.
4. Create the collections above, insert documents from `users_initial.json` into `users`.
5. Install dependencies and run:

```bash
npm install
npm run dev
```

Then deploy with your preferred hosting (Firebase Hosting, Netlify, Vercel, etc.).
