# Trival Monitor

A simplified monitoring solution where each monitored URL gets its own isolated Cloudflare Worker with D1 database.

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
- SMTP credentials for email notifications

### Installation

```bash
# Install dependencies
bun install

# Run type checking
bun run types
# or
bun run typecheck
```

## Available Scripts

- `bun run types` - Run TypeScript type checking (alias for `typecheck`)
- `bun run typecheck` - Run TypeScript type checking
- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:push` - Apply migrations to D1 database
- `bun run db:studio` - Open Drizzle Studio (database GUI)

## Development Workflow

### Stage 1: Minimal Setup (Current)

This stage validates that Alchemy, Drizzle, and Bun work together:

1. **Type checking**:
   ```bash
   bun run types
   ```

2. **Deploy test worker**:
   ```bash
   cd deployments/test
   bun run deploy.ts
   ```

3. **Apply database schema**:
   ```bash
   bun run db:push
   ```

4. **Test the worker**:
   ```bash
   curl https://monitor-test.workers.dev
   curl https://monitor-test.workers.dev/insert
   curl https://monitor-test.workers.dev/messages
   ```

## License

Private project
