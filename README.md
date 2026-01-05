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

### Production Mode

- Use `drizzle-kit push` to apply migrations via Cloudflare's D1 HTTP API
- This follows
  [Drizzle's recommended approach](https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit)
  for D1 production deployments

### Development/Test Mode

**Note**: We're currently exploring the best approach for applying Drizzle
migrations in local development/test environments with Alchemy's local mode.

The worker has `nodejs_compat` compatibility flag enabled (required for
worker_mailer), which makes Node.js built-ins available. However, challenges
remain:

- Migration files aren't bundled with the worker by default
- Alchemy's local D1 (via Miniflare) creates SQLite files dynamically on first
  database access
- Miniflare stores data in `.alchemy/miniflare/v3/d1/` but file creation is
  lazy
- Need to determine the best point in the workflow to apply migrations

**Potential Solutions to Explore**:

- Configure Miniflare persistence options through Alchemy's local mode settings
- Use wrangler's `--persist` flag equivalent in Alchemy
- Pre-initialize D1 database before migration application
- Use Drizzle's `migrate()` with proper timing after database file creation

The goal is to use Drizzle's standard `migrate()` mechanism to apply migrations
to Alchemy's local D1 database before running tests, while keeping the worker
code clean without hardcoded SQL.

**References**:

- [Cloudflare D1 Local Development](https://developers.cloudflare.com/d1/build-with-d1/local-development/)
- [Miniflare Persistence](https://www.npmjs.com/package/miniflare)

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

   - Imports and runs the deployment script with `local: true`
   - Deploys the worker locally (no live deployment to Cloudflare)
   - Starts a local worker (port varies, typically 1337 or 1338)
   - Uses local D1 simulation via Alchemy/Miniflare
   - Tests all endpoints automatically

   **Note**: Even in local mode, Alchemy requires Cloudflare credentials to
   initialize. The `local: true` setting prevents actual deployment to
   Cloudflare but still needs auth for setup.

   **Database migrations**: Currently exploring the best approach for applying
   migrations in local mode. See "Database Migrations" section above.

3. **Manual deployment and testing** (alternative):

   ```bash
   cd deployments/test
   bun run deploy.ts
   ```

   Then test manually (after applying migrations):

   ```bash
   # Test endpoints (port may vary, check deployment output)
   curl http://localhost:1337
   curl http://localhost:1337/insert
   curl http://localhost:1337/messages
   ```

4. **Apply database schema** (for production):

   ```bash
   # For production deployments, use drizzle-kit to apply migrations via D1 HTTP API
   bun run db:push
   ```

## License

Private project
