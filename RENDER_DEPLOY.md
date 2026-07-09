# Deploying shulesoft to Render

## What was fixed
The GitHub repo had all `.ts` files sitting flat at the repo root, but the
code imports them as if they live in nested folders (e.g. `app.module.ts`
imports `./prisma/prisma.module`, `./auth/auth.module`, `./mail/mail.module`).
As uploaded, `nest build` would fail immediately. This package reorganizes
everything into the structure the imports actually expect:

```
src/
  main.ts
  app.module.ts
  prisma/
    prisma.module.ts
    prisma.service.ts
  auth/
    auth.module.ts
    auth.controller.ts
    auth.service.ts
    dto/
      register-teacher.dto.ts
      login.dto.ts
      misc.dto.ts
    strategies/
      jwt.strategy.ts
      refresh.strategy.ts
  mail/
    mail.module.ts
    mail.service.ts
  common/
    guards/
      jwt-auth.guard.ts
      roles.guard.ts
      refresh-jwt.guard.ts
    decorators/
      roles.decorator.ts
      current-user.decorator.ts
prisma/
  schema.prisma
nest-cli.json         <- was missing, required for `nest build`
tsconfig.build.json   <- was missing
.gitignore            <- was missing
```

No migration files existed either (`prisma/migrations` folder was absent),
so `prisma migrate deploy` would fail on first deploy with nothing to apply.

## Push this to your GitHub repo
Replace the contents of the repo with this folder's contents (keep the same
repo, just fix the layout), then commit and push.

## Option A: Use the included render.yaml (recommended)
This repo now includes a `render.yaml` Blueprint that defines the web
service, a free Postgres database, and every environment variable as code.

1. Push the fixed repo to GitHub (must include `render.yaml` at the root).
2. In Render: **New → Blueprint** → select this repo.
3. Render reads `render.yaml` and provisions:
   - A Postgres database (`shulesoft-db`), automatically wired to
     `DATABASE_URL` on the web service — you never touch this value.
   - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — Render generates strong
     random values for these automatically on first deploy.
   - Static values (`JWT_ACCESS_EXPIRES_IN`, `NODE_ENV`, etc.) — already
     filled in.
   - Six vars marked `sync: false` (`FRONTEND_URL`, `MAIL_HOST`,
     `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`) — Render will
     prompt you to type these in during setup since only you know them.
4. Click **Apply** — Render creates both resources and deploys.

If you'd rather set things up by hand in the dashboard instead of using the
Blueprint, use Option B below.

## Option B: Manual Render Web Service settings

**Build Command (first deploy — uses db push since there's no migration history yet):**
```
npm install && npx prisma generate && npx prisma db push && npm run build
```

**Once you've deployed successfully once**, switch to proper migrations for
all future changes: run `npx prisma migrate dev --name init` on your own
machine (with a local Postgres or the Render DB URL), commit the generated
`prisma/migrations/` folder, then change the Render build command to:
```
npm install && npx prisma generate && npx prisma migrate deploy && npm run build
```

**Start Command:**
```
npm run start
```

**Runtime:** Node

## Environment variables

| Key | Value |
|---|---|
| DATABASE_URL | Internal Database URL from your Render PostgreSQL instance |
| JWT_ACCESS_SECRET | `openssl rand -hex 32` |
| JWT_ACCESS_EXPIRES_IN | 15m |
| JWT_REFRESH_SECRET | `openssl rand -hex 32` (different from access secret) |
| JWT_REFRESH_EXPIRES_IN | 7d |
| FRONTEND_URL | your deployed frontend URL (used for CORS) |
| NODE_ENV | production |
| MAIL_HOST | e.g. smtp.gmail.com |
| MAIL_PORT | 587 |
| MAIL_USER | sending email address |
| MAIL_PASSWORD | SMTP password / app password |
| MAIL_FROM | e.g. "Exam System <no-reply@yourdomain.com>" |
| ALLOWED_SCHOOL_EMAIL_DOMAINS | e.g. school.ac.ke |

Render sets its own PORT automatically; main.ts already reads
`process.env.PORT`, so no need to set it manually.
