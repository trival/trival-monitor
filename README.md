# Trival Monitor

A simplified monitoring solution where each monitored URL gets its own isolated
Cloudflare Worker with D1 database.

## Features

- One Cloudflare Worker per monitored URL
- HTTP GET/POST ping monitoring
- SMTP email notifications (configurable per worker)
- Statistics endpoint (protected by bearer token)
- Grace period for transient failures
- D1 database for historical analysis

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: D1 with Drizzle ORM
- **SMTP**: worker-mailer library
- **Deployment**: Alchemy (TypeScript IaC)
- **Package Manager**: Bun
- **Language**: TypeScript

## Project Structure

```
trival-monitor/
├── src/                       # Worker code
│   ├── index.ts              # Entry point (scheduled + fetch handlers)
│   ├── monitor.ts            # HTTP ping logic
│   ├── notifier.ts           # SMTP via worker-mailer
│   ├── db/
│   │   ├── schema.ts         # Drizzle schema definitions
│   │   └── queries.ts        # Database query functions
│   └── types.ts              # TypeScript interfaces
├── deployments/               # One folder per monitor instance
│   └── test/
│       ├── deploy.ts         # Alchemy deployment script
│       └── .env.example      # Environment variables template
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── README.md
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- Cloudflare account with Workers and D1 access
- Cloudflare API credentials configured
- SMTP credentials for email notifications (for production)

### Installation

```bash
# Install dependencies
bun install

# Configure Cloudflare credentials for Alchemy
alchemy login cloudflare
# Or set environment variables:
# export CLOUDFLARE_API_TOKEN=your-token
# export CLOUDFLARE_ACCOUNT_ID=your-account-id

# Run type checking
bun run types
```

## Available Scripts

- `bun run types` - Run TypeScript type checking (alias for `typecheck`)
- `bun run typecheck` - Run TypeScript type checking
- `bun test` - Run all tests
- `bun run test:deploy` - Run deployment integration tests
- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:push` - Apply migrations to D1 database
- `bun run db:studio` - Open Drizzle Studio (database GUI)

## Database Migrations

This project uses Drizzle ORM for database schema management.

### Alchemy-Managed Migrations (Development/Test/Production)

Alchemy provides built-in support for applying Drizzle migrations automatically:

```typescript
// In deploy.ts
const db = await D1Database("db", {
  name: "monitor_test_d1",
  migrationsDir: join(projectRoot, "drizzle"),
});
```

When you specify `migrationsDir`, Alchemy will:
- Automatically apply all SQL migrations from the directory
- Track applied migrations in Cloudflare's `d1_migrations` table
- Work seamlessly in both local mode (`local: true`) and production deployments

**Key Benefits**:
- No manual migration steps needed
- Migrations are applied during deployment
- Same workflow for local development and production
- Integration tests can directly import and run deployments

### Alternative: Manual Migration with drizzle-kit

For deployments without Alchemy, you can still use `drizzle-kit push`:

```bash
bun run db:push
```

This applies migrations via Cloudflare's D1 HTTP API, following
[Drizzle's recommended approach](https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit)
for D1 production deployments.

**References**:

- [Alchemy D1 Database Documentation](https://alchemy.run/providers/cloudflare/d1-database/)
- [Cloudflare D1 Local Development](https://developers.cloudflare.com/d1/build-with-d1/local-development/)

## Development Workflow

### Stage 1: Minimal Setup (Current)

This stage validates that Alchemy, Drizzle, and Bun work together.

**Note**: The test deployment is configured with `local: true` to simulate
resources locally where possible. This avoids deploying to production during
development.

#### Steps:

1. **Type checking**:

   ```bash
   bun run types
   ```

2. **Run integration tests** (requires Cloudflare credentials):

   ```bash
   # Make sure Cloudflare credentials are configured first
   alchemy login cloudflare

   # Run the tests
   bun run test:deploy
   ```

   This test:

   - Imports the deployment script directly (Alchemy is embeddable)
   - Deploys the worker locally with `local: true` (no live deployment to Cloudflare)
   - Automatically applies Drizzle migrations via Alchemy's `migrationsDir` option
   - Exports `worker` and `db` resources for test access
   - Dynamically uses the actual worker URL from `worker.url` (no hardcoded ports)
   - Starts a local worker on port 1337 (or 1338+ if ports are busy)
   - Uses local D1 simulation via Alchemy/Miniflare
   - Tests all endpoints automatically
   - Migrations are tracked in Cloudflare's `d1_migrations` table

   **Note**: Even in local mode, Alchemy requires Cloudflare credentials to
   initialize. The `local: true` setting prevents actual deployment to
   Cloudflare but still needs auth for setup.

3. **Manual deployment and testing** (alternative):

   ```bash
   cd deployments/test
   bun run deploy.ts
   ```

   The deployment will automatically apply migrations. Then test manually:

   ```bash
   # Test endpoints (port may vary, check deployment output)
   curl http://localhost:1337
   curl http://localhost:1337/insert
   curl http://localhost:1337/messages
   ```

## License

Private project
