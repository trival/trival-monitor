# Trival Monitor - Implementation Plan

## Overview
Create a simplified monitoring solution where each monitored URL gets its own isolated Cloudflare Worker, addressing the limitations of uptimeflare's centralized architecture.

## Problems with Uptimeflare
1. **Terraform hardcoded names**: Worker and D1 database names are hardcoded (`uptimeflare_worker`, `uptimeflare_d1`), limiting to one instance per Cloudflare account
2. **Shared notification channel**: All monitors share a single notification configuration, can't have different email destinations per monitor
3. **Over-engineered**: Status page, KV/D1 storage, complex state management - too much for simple ping monitoring

## Requirements
- One Cloudflare Worker per monitored URL
- HTTP GET/POST ping monitoring only
- SMTP email notifications (configurable per worker)
- Statistics endpoint (protected by bearer token) returning JSON
- Environment variables for configuration:
  - `SERVICE_NAME`: Human-readable service name
  - `TARGET_URL`: URL to monitor
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: SMTP credentials
  - `NOTIFICATION_EMAIL`: Destination email for alerts
  - `API_BEARER_TOKEN`: Token to protect statistics endpoint
  - `CHECK_INTERVAL`: Cron schedule (default: every 1 minute)
  - `PING_TIMEOUT`: Configurable timeout for each health check
  - `GRACE_PERIOD_FAILURES`: Number of consecutive failures before alerting

## Key Decisions

### 1. Use D1 Instead of Durable Objects
**Rationale**: User wants SQL analysis capability
- Store health check history in D1 database
- Each worker has its own D1 database instance
- Enables direct SQL queries via wrangler CLI or dashboard
- More suitable for analytics and historical analysis

### 2. Use Alchemy (No Terraform)
**Decision**: Alchemy only for deployment
- **Alchemy**: TypeScript-native IaC (Infrastructure as Code)
- Resources are async functions - simple and type-safe
- Local state files (no remote backend complexity)
- Native D1 and Worker support
- Skip Terraform entirely - simpler toolchain

### 3. Use Drizzle ORM for D1
**Decision**: Drizzle ORM instead of raw SQL
- Type-safe schema definitions
- Native D1 support
- Built-in migrations
- User has experience with it
- Easy to extend schema later

### 4. Use Bun Instead of Node/npm
**Decision**: Bun for package management and runtime
- Faster than npm/node
- Native TypeScript support
- Built-in bundler
- Single tool for install/build/run

### 5. Implement Grace Period
**From Uptimeflare pattern**: Don't alert on first failure
- Store ALL health checks (successes and failures)
- Track consecutive failures
- Send notification only after N consecutive failures (configurable, default: 3)
- Example: ping fails at 10:00, 10:01, 10:02 → alert at 10:02
- On recovery: Send UP notification immediately

### 6. Add Service Name Configuration
**Why**: Generate meaningful notifications
- ENV var: `SERVICE_NAME` (e.g., "Trival.xyz Website")
- Used in email subjects and messages
- Different from worker name (e.g., "monitor-trival-xyz")

### 7. No Dashboard/UI Complexity
**Note**: Uptimeflare includes a complex Next.js dashboard coupled to the backend
- We don't need any of that for this minimal proof of concept
- Just worker + D1 + API endpoint
- Separate aggregator/dashboard project will come later

## Tech Stack Summary
- **Runtime**: Cloudflare Workers
- **Database**: D1 with Drizzle ORM
- **SMTP**: worker-mailer library
- **Deployment**: Alchemy (TypeScript IaC)
- **Package Manager**: Bun
- **Language**: TypeScript

## Project Structure
```
trival-monitor/
├── shared/                    # Shared worker code (reusable)
│   ├── src/
│   │   ├── index.ts          # Entry point (scheduled + fetch handlers)
│   │   ├── monitor.ts        # HTTP ping logic (from uptimeflare)
│   │   ├── notifier.ts       # SMTP via worker-mailer
│   │   ├── db/
│   │   │   ├── schema.ts     # Drizzle schema definitions
│   │   │   └── queries.ts    # Database query functions
│   │   └── types.ts          # TypeScript interfaces
│   ├── package.json
│   ├── tsconfig.json
│   ├── drizzle.config.ts     # Drizzle configuration
│   └── README.md
├── deployments/               # One folder per monitor instance
│   └── trival-xyz/
│       ├── deploy.ts         # Alchemy deployment script
│       ├── .env              # Environment variables (gitignored)
│       └── .env.example      # Environment variables template
├── scripts/
│   └── new-monitor.sh        # Helper to scaffold new monitor
├── package.json               # Root dependencies (Alchemy)
├── bunfig.toml               # Bun configuration
├── .gitignore
├── implementation-plan.md     # This file
└── README.md
```

## Implementation Stages

### Stage 1: Project Skeleton & Toolchain Validation 🏗️
**Goal**: Verify Alchemy, Drizzle, and Bun work together before building features

#### 1.1 Initialize Project Structure
- [x] Create root directory
- [x] Write implementation-plan.md
- [ ] Create root package.json with Bun workspaces
- [ ] Create bunfig.toml
- [ ] Create .gitignore
- [ ] Create shared/package.json with minimal dependencies

#### 1.2 Minimal Worker (Hello World)
- [ ] Create `shared/src/index.ts` with simple fetch handler:
  ```typescript
  export default {
    async fetch(request: Request): Promise<Response> {
      return new Response('Hello from Trival Monitor!')
    }
  }
  ```
- [ ] Create `shared/tsconfig.json`

#### 1.3 Minimal D1 + Drizzle Setup
- [ ] Create `shared/src/db/schema.ts` with simple test table:
  ```typescript
  export const testTable = sqliteTable('test', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    message: text('message').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
  })
  ```
- [ ] Create `shared/src/db/client.ts` with Drizzle setup
- [ ] Create `shared/drizzle.config.ts`

#### 1.4 Minimal Alchemy Deployment
- [ ] Create `deployments/test/deploy.ts` with:
  - D1 database creation
  - Worker creation with D1 binding
  - Minimal ENV vars
- [ ] Create `deployments/test/.env.example`
- [ ] Test local deployment: `cd deployments/test && bun run deploy.ts --dev`

#### 1.5 Integration Test
- [ ] Create `shared/src/index.test.ts` using Bun test:
  ```typescript
  import { describe, test, expect } from 'bun:test'

  describe('Minimal Worker', () => {
    test('responds with hello message', async () => {
      // Test worker responds
    })

    test('can write to D1', async () => {
      // Test D1 connection via Drizzle
    })

    test('can read from D1', async () => {
      // Test D1 query via Drizzle
    })
  })
  ```
- [ ] Run tests: `cd shared && bun test`
- [ ] Verify all tests pass ✅

**Success Criteria**:
- Worker deploys locally with Alchemy
- D1 database is created and accessible
- Drizzle can read/write to D1
- All tests pass

---

### Stage 2: Core Monitoring Logic 🔍
**Goal**: Implement HTTP ping monitoring without notifications

#### 2.1 Health Check Schema
- [ ] Replace test table with `health_checks` table in schema.ts
- [ ] Create Drizzle queries in `shared/src/db/queries.ts`:
  - `saveHealthCheck()`
  - `getRecentChecks()`
  - `getConsecutiveFailures()` (grace period logic)

#### 2.2 Monitor Logic
- [ ] Create `shared/src/monitor.ts`
- [ ] Copy and adapt `checkTarget()` from uptimeflare
- [ ] Add tests for monitoring logic

#### 2.3 Types & Config Parser
- [ ] Create `shared/src/types.ts`
- [ ] Implement `parseConfig()` for ENV vars
- [ ] Add types for MonitorConfig, AppConfig

#### 2.4 Worker with Scheduled Handler
- [ ] Update `shared/src/index.ts` to add:
  - `scheduled()` handler
  - Health check execution
  - D1 storage of results
  - Grace period logic (no notification yet)
- [ ] Add tests for scheduled logic

#### 2.5 Stats API Endpoint
- [ ] Implement `fetch()` handler for `/api/stats`
- [ ] Add Bearer token authentication
- [ ] Implement `get24hStats()` query
- [ ] Add tests for API endpoint

**Success Criteria**:
- Health checks execute on schedule
- Results stored in D1
- Grace period logic works
- Stats API returns valid JSON
- All tests pass

---

### Stage 3: SMTP Notifications 📧
**Goal**: Add email notifications with worker-mailer

#### 3.1 SMTP Notifier
- [ ] Install worker-mailer: `cd shared && bun add worker-mailer`
- [ ] Create `shared/src/notifier.ts`
- [ ] Implement `sendEmailNotification()`
- [ ] Implement `formatMessage()` for plain text
- [ ] Implement `convertToHtml()` for HTML emails

#### 3.2 Integration with Worker
- [ ] Add SMTP config to types
- [ ] Wire up notifications in scheduled handler
- [ ] Test DOWN notification (after grace period)
- [ ] Test UP notification (immediate)

#### 3.3 Test with Real SMTP
- [ ] Configure test SMTP server (Mailtrap or similar)
- [ ] Deploy and trigger test failure
- [ ] Verify email received
- [ ] Verify HTML formatting

**Success Criteria**:
- Emails sent on state changes
- Grace period respected for DOWN alerts
- UP alerts sent immediately
- HTML emails render correctly

---

### Stage 4: Production Deployment Setup 🚀
**Goal**: Create real deployment configuration and tooling

#### 4.1 Real Deployment Config
- [ ] Create `deployments/trival-xyz/deploy.ts`
- [ ] Create `deployments/trival-xyz/.env.example`
- [ ] Add all ENV vars (SMTP, target URL, grace period, etc.)
- [ ] Update Drizzle config to point to real deployment

#### 4.2 Scaffold Script
- [ ] Create `scripts/new-monitor.sh`
- [ ] Script generates new deployment from template
- [ ] Make script executable: `chmod +x scripts/new-monitor.sh`
- [ ] Test scaffold: `./scripts/new-monitor.sh test-monitor`

#### 4.3 Documentation
- [ ] Create root README.md
- [ ] Document deployment workflow
- [ ] Document environment variables
- [ ] Document grace period behavior
- [ ] Add SQL query examples

#### 4.4 Deploy First Real Monitor
- [ ] Configure trival.xyz monitor
- [ ] Deploy: `cd deployments/trival-xyz && bun run deploy.ts`
- [ ] Apply migrations: `cd shared && bun run db:push`
- [ ] Verify worker is running
- [ ] Test API endpoint
- [ ] Trigger test notification

**Success Criteria**:
- Real monitor deployed and running
- Cron triggers working
- Email notifications working
- Stats API accessible
- Documentation complete

---

### Stage 5: Polish & Optimization ✨
**Goal**: Clean up, optimize, and add nice-to-haves

#### 5.1 Cleanup & Refactoring
- [ ] Remove test deployment
- [ ] Clean up old test code
- [ ] Add JSDoc comments
- [ ] Ensure consistent code style

#### 5.2 Additional Features
- [ ] Add `cleanupOldChecks()` for 90-day retention
- [ ] Add support for custom HTTP headers
- [ ] Add support for POST body
- [ ] Add support for custom expected codes

#### 5.3 Drizzle Studio
- [ ] Test Drizzle Studio: `cd shared && bun run db:studio`
- [ ] Verify database browsing works
- [ ] Document in README

#### 5.4 Final Testing
- [ ] Test multiple concurrent monitors
- [ ] Test grace period edge cases
- [ ] Load test with high-frequency checks
- [ ] Verify 90-day cleanup works

**Success Criteria**:
- Code is clean and documented
- All features working
- Multiple monitors deployed
- Performance acceptable

## Key Benefits vs Uptimeflare

| Feature | Uptimeflare | Trival-Monitor |
|---------|-------------|----------------|
| **Instances per account** | 1 | Unlimited |
| **Notification targets** | 1 for all | 1 per monitor |
| **Deployment tool** | Terraform | Alchemy (TypeScript) |
| **Dashboard** | Complex Next.js | None (API only) |
| **Configuration** | TypeScript file | ENV vars |
| **State management** | Complex grace periods | Simple up/down |
| **Storage** | D1 (shared) | D1 (isolated) |
| **Package manager** | npm | Bun |
| **Database layer** | Raw SQL | Drizzle ORM |

## Deployment Workflow (Using Bun)

### Initial Setup (One Time)
```bash
# 1. Initialize project with Bun
cd trival-monitor
bun install

# 2. Install shared worker dependencies
cd shared
bun install

# 3. Verify TypeScript setup
bun run typecheck
```

### Deploy a New Monitor
```bash
# 1. Use scaffold script
./scripts/new-monitor.sh trival-xyz

# 2. Configure environment
cd deployments/trival-xyz
cp .env.example .env
# Edit .env with your values

# 3. Deploy with Alchemy
bun run deploy.ts

# 4. Apply Drizzle migrations to D1
cd ../../shared
bun run db:push
```

### Query Statistics

**Via API:**
```bash
curl -H "Authorization: Bearer your-token" \
  https://monitor-trival-xyz.workers.dev/api/stats | jq
```

**Via Drizzle Studio (GUI):**
```bash
cd shared
bun run db:studio
# Opens browser with D1 database explorer
```

**Via SQL (wrangler CLI):**
```bash
wrangler d1 execute monitor_trival_xyz_d1 \
  --command "SELECT * FROM health_checks ORDER BY timestamp DESC LIMIT 10"
```

## Environment Variables

```bash
# Service Configuration
SERVICE_NAME=Trival.xyz Website          # Human-readable name
TARGET_URL=https://trival.xyz            # URL to monitor
HTTP_METHOD=GET                          # GET or POST
PING_TIMEOUT=10000                       # Timeout in milliseconds
CHECK_INTERVAL="* * * * *"               # Cron schedule (every 1 min)

# Grace Period Configuration
GRACE_PERIOD_FAILURES=3                  # Alert after N consecutive failures

# Optional HTTP Configuration
# HTTP_HEADERS={"Authorization":"Bearer token"}
# HTTP_BODY={"check":"health"}
# EXPECTED_CODES=200,301,302

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=your-app-password             # Use app-specific password
NOTIFICATION_EMAIL=oncall@example.com
# NOTIFICATION_EMAIL_FROM=monitoring@example.com

# API Security
API_BEARER_TOKEN=random-secure-token-here
```

## Grace Period Behavior

### Scenario 1: Service Goes Down
1. **10:00** - Check fails (consecutive failures: 1)
   - Action: Store failure, no notification
2. **10:01** - Check fails (consecutive failures: 2)
   - Action: Store failure, no notification
3. **10:02** - Check fails (consecutive failures: 3)
   - Action: Store failure, **send DOWN notification** ✉️
4. **10:03** - Check fails (consecutive failures: 4)
   - Action: Store failure, no notification (already alerted)

### Scenario 2: Service Recovers
1. **10:04** - Check succeeds
   - Action: Store success, **send UP notification immediately** ✉️

### Scenario 3: Transient Failures (No Alert)
1. **10:00** - Check fails (consecutive failures: 1)
2. **10:01** - Check fails (consecutive failures: 2)
3. **10:02** - Check succeeds (consecutive failures: 0)
   - Action: No notification sent (grace period not met)

## Sources
- [Alchemy GitHub](https://github.com/alchemy-run/alchemy)
- [Alchemy D1 + Drizzle Guide](https://alchemy.run/guides/drizzle-d1/)
- [Uptimeflare Repository](https://github.com/lyc8503/UptimeFlare)
- [worker-mailer](https://www.npmjs.com/package/worker-mailer)
- [Drizzle ORM](https://orm.drizzle.team/)

## Next Steps

After reading this plan, proceed with implementation:
1. Create all root files (package.json, bunfig.toml, .gitignore)
2. Set up shared/ directory with Drizzle schema
3. Implement worker code
4. Create deployment example
5. Test with first monitor
