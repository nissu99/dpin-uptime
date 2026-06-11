# Deployment

This app is a multi-service system:

- `frontend`: Next.js dashboard
- `api`: Express API
- `hub`: WebSocket validation coordinator
- `postgres`: database
- `validator`: optional worker that performs checks

The easiest single-provider deployment is Railway.

## Vercel Frontend + Railway Backend

For the requested GitHub/Vercel setup, deploy only `apps/frontend` to Vercel.
Deploy the long-running backend services on Railway:

- Railway Postgres
- API service with `Dockerfile.api`
- Hub service with `Dockerfile.hub`
- Optional validator service with `Dockerfile.validator`

Set `NEXT_PUBLIC_API_BACKEND_URL` in Vercel to the public Railway API URL, for
example `https://your-api-service.up.railway.app`. The current API and hub are
not Vercel serverless functions; the hub also needs a persistent WebSocket
process, so it should run on a long-running container host.

## Railway Setup

Create one Railway project with a Postgres database plus separate services for the frontend, API, and hub. Add the validator as a fourth service only when you have a validator `PRIVATE_KEY`.

For each service, keep the repository root as the service root and set `RAILWAY_DOCKERFILE_PATH`:

| Service   | Dockerfile path        |
| --------- | ---------------------- |
| Frontend  | `Dockerfile.frontend`  |
| API       | `Dockerfile.api`       |
| Hub       | `Dockerfile.hub`       |
| Validator | `Dockerfile.validator` |

## Variables

### Frontend

```txt
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
NEXT_PUBLIC_API_BACKEND_URL=https://your-api-service.up.railway.app
```

Set `NEXT_PUBLIC_API_BACKEND_URL` before the frontend build. Next.js inlines `NEXT_PUBLIC_` values into the browser bundle at build time.

The frontend Dockerfile declares these as build args so Railway can pass the service variables into the Next.js build.

### API

```txt
CLERK_SECRET_KEY=...
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Optional hardening after you know the final frontend URL:

```txt
CLERK_AUTHORIZED_PARTIES=https://your-frontend-service.up.railway.app
```

The API container runs Prisma migrations before starting.

### Hub

```txt
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Expose a public Railway domain for the hub if validators will connect from outside Railway. Validators should use `wss://your-hub-service.up.railway.app`.

### Validator

```txt
PRIVATE_KEY=[...]
HUB_URL=wss://your-hub-service.up.railway.app
VALIDATOR_IP=your-public-validator-label
```

## Local Commands

```bash
bun run db:migrate
bun run dev:api
bun run dev:frontend
bun run dev:hub
```

Run a validator locally only when `PRIVATE_KEY` is set:

```bash
bun run dev:validator
```

## Clerk

Add the deployed frontend URL in Clerk's allowed origins/redirect URLs. Rotate any secret key that has been shared outside the Clerk dashboard.
