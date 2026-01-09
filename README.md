# Trival Monitor

A simplified monitoring solution where each monitored URL gets its own isolated
Cloudflare Worker with D1 database.

## Features

- **One Cloudflare Worker per monitored URL** - Isolated monitoring instances
- **HTTP GET/POST ping monitoring** - Configurable timeout and expected status
  codes
- **Grace period logic** - Avoid alert fatigue from transient failures
- **Email notifications** - Optional SMTP support with styled HTML emails
  (DOWN/UP alerts)
- **Bearer token authentication** - All API endpoints protected (including root
  health check)
- **Flexible statistics API** - Query 24h stats or custom time ranges
- **Manual trigger endpoint** - Test monitoring without waiting for cron
- **D1 database** - Persistent health check history for analysis
- **2xx status code support** - Accepts any 200-299 status by default
- **Multiple notification channels** - Console logging + optional SMTP (easily
  extensible)

### Grace Period Behavior

The monitor tracks consecutive failures and only alerts after reaching the grace
period threshold:

1. **First failure** (10:00) → consecutiveFailures=1, no alert
2. **Second failure** (10:01) → consecutiveFailures=2, no alert
3. **Third failure** (10:02) → consecutiveFailures=3, **DOWN notification sent**
   (if GRACE_PERIOD_FAILURES=3)
4. **Fourth failure** (10:03) → consecutiveFailures=4, no additional alert
5. **Success** (10:04) → consecutiveFailures=0, **UP notification sent**

**Key behavior**: UP notifications are only sent if a DOWN notification was
previously sent. This means short outages that self-recover before reaching the
grace period threshold are completely ignored (no notifications at all).

### Stats

The `/stats` endpoint provides detailed health check statistics over a specified
time range (default: last 24 hours). The reported incidents also incluse the
outages that where shorter than the grace period and did not trigger
notifications. See documentation below for full details.

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

```

## Environment Variables

### Required

- `TARGET_URL` - URL to monitor (e.g., `https://example.com`)
- `API_BEARER_TOKEN` - Security token for API access

### Monitoring Configuration (optional, with defaults)

- `SERVICE_NAME` - Display name (default: `"Service"`)
- `HTTP_METHOD` - HTTP method (default: `"GET"`, also supports `"POST"`)
- `PING_TIMEOUT` - Timeout in milliseconds (default: `10000`, range: 1-60000)
- `GRACE_PERIOD_FAILURES` - Consecutive failures before alert (default: `3`,
  range: 1-10)
- `EXPECTED_CODES` - Accepted status codes (default: `"200-299"`, also supports
  comma-separated like `"200,301,302"`)
- `CHECK_INTERVAL_SECONDS` - Cron interval in seconds (default: `60`, range:
  1-3600)
- `HTTP_HEADERS` - Custom headers as JSON (optional, e.g.,
  `'{"Authorization":"Bearer token"}'`)
- `HTTP_BODY` - Request body for POST requests (optional)

### SMTP Configuration (optional, for email notifications)

Email notifications are **completely optional**. The monitor works without SMTP
configuration and will only log to console.

When you want to enable email notifications, configure all of these variables:

- `SMTP_HOST` - SMTP server hostname (e.g., `smtp.gmail.com`)
- `SMTP_USER` - SMTP username (usually your email address)
- `SMTP_PASS` - SMTP password or app-specific password
- `NOTIFICATION_EMAIL` - Email address to receive alerts
- `SMTP_PORT` - SMTP server port (optional, default: `587`)
- `NOTIFICATION_EMAIL_FROM` - From email address (optional, defaults to
  `SMTP_USER`)

**Important**: All SMTP fields except `SMTP_PORT` and `NOTIFICATION_EMAIL_FROM`
are required when `SMTP_HOST` is set.

#### SMTP Configuration Examples

**Gmail with App Password**:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Generate at https://myaccount.google.com/apppasswords
NOTIFICATION_EMAIL=alerts@example.com
NOTIFICATION_EMAIL_FROM=monitoring@yourdomain.com
```

**Mailtrap (for testing)**:

```bash
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-user
SMTP_PASS=your-mailtrap-pass
NOTIFICATION_EMAIL=test@example.com
```

#### Email Notification Behavior

- **DOWN Notification**: Sent when consecutive failures reach
  `GRACE_PERIOD_FAILURES`
  - Subject: `[DOWN] Service Name is DOWN`
  - Includes: Service name, consecutive failure count, error message
- **UP Notification**: Sent when service recovers after being DOWN
  - Subject: `[UP] Service Name is UP`
  - Includes: Service name, number of failed checks during downtime
- **Email Format**: Both plain text and HTML versions
  - HTML emails include styled formatting with colors (red for DOWN, green for
    UP)
  - Plain text fallback for compatibility
- **Console Logging**: Always enabled alongside SMTP (for debugging)

#### SMTP Troubleshooting

**Problem: "SMTP configuration incomplete" error**

- Ensure `SMTP_USER`, `SMTP_PASS`, and `NOTIFICATION_EMAIL` are all set when
  `SMTP_HOST` is provided

**Problem: "SMTP_PORT invalid**

- Verify `SMTP_PORT` is a valid number
- Common ports: 587 (STARTTLS), 465 (TLS), 25 (unencrypted, not recommended)

## Worker API Endpoints

**All endpoints require bearer token authentication via
`Authorization: Bearer <token>` header.**

### `GET /`

Service status endpoint. Returns monitor information and current status.

**Response:**

```json
{
  "service": "Test Service",
  "target": "http://localhost:1337/",
  "status": "up",
  "lastCheck": 1704672000
}
```

### `GET /stats`

Get health check statistics. Defaults to 24-hour window.

**Query Parameters:**

- `start` (optional): Unix timestamp for start of time range
- `end` (optional): Unix timestamp for end of time range

**Response:**

```json
{
  "totalChecks": 100,
  "successfulChecks": 98,
  "failedChecks": 2,
  "uptimePercentage": 98.0,
  "averageResponseTime": 45,
  "currentStatus": "up",
  "lastCheckTime": 1704672000,
  "incidents": [
    {
      "startTime": 1704670000,
      "endTime": 1704670120,
      "duration": 2,
      "errorMessage": "Timeout after 5000ms"
    }
  ]
}
```

### `POST /trigger-check`

Manually trigger a health check (useful for testing without waiting for cron).

**Response:**

```json
{
  "success": true,
  "result": {
    "up": true,
    "ping": 42,
    "err": null,
    "statusCode": 200,
    "consecutiveFailures": 0
  },
  "message": "Check completed. Status: UP"
}
```

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
├── src/                      # Worker code
│   ├── index.ts              # Entry point (scheduled + fetch handlers)
│   ├── monitor.ts            # HTTP ping logic
│   ├── config.ts             # Environment variable parser
│   ├── types.ts              # TypeScript interfaces
│   ├── config.test.ts        # Unit tests for config parsing
│   └── db/
│       ├── schema.ts         # Drizzle schema definitions
│       └── queries.ts        # Database query functions
├── test/                     # Integration tests
│   ├── deploy.ts             # Test deployment (monitor + mock target)
│   ├── integration.test.ts   # Comprehensive test suite
│   └── fixtures/
│       └── mock-target.ts    # Controllable test fixture worker
├── deployments/              # Production monitor deployments (empty until Stage 4)
├── migrations/               # Database migrations (generated by drizzle)
├── package.json
├── tsconfig.json
├── drizzle.config.ts
└── README.md
```

## Development

### Available Scripts

- `bun run types` - Run TypeScript type checking
- `bun test` - Run all tests (unit + integration)
- `bun run test:unit` - Run unit tests only (config parsing)
- `bun run test:integration` - Run integration tests only
- `bun run db:generate` - Generate Drizzle migrations
- `bun run db:studio` - Open Drizzle Studio (database GUI)

### Alchemy-Managed Migrations (Development/Test/Production)

Alchemy provides built-in support for applying Drizzle migrations automatically:

```typescript
// In deploy.ts
const db = await D1Database('db', {
  name: 'monitor_test_d1',
  migrationsDir: join(projectRoot, 'migrations'),
})
```

When you specify `migrationsDir`, Alchemy will:

- Automatically apply all SQL migrations from the directory
- Track applied migrations in Cloudflare's `d1_migrations` table
- Work seamlessly in both local mode (`local: true`) and production deployments

**References**:

- [Alchemy D1 Database Documentation](https://alchemy.run/providers/cloudflare/d1-database/)
- [Cloudflare D1 Local Development](https://developers.cloudflare.com/d1/build-with-d1/local-development/)

### Testing

#### Unit Tests

```bash
bun run test:unit
```

Tests core business logic like configuration parsing, service, repository

#### Integration Tests

```bash
bun run test:integration
```

Comprehensive test suite to simulate real-world scenarios against a local test
target.

The mock target worker (`test/fixtures/mock-target.ts`) supports:

- **Configuration mode**: `POST /configure` with `{status, delay, message}` to
  set persistent behavior
- **Query parameter overrides**: One-time control via `?status=X&delay=Y`

#### Running Tests

1. **Type checking**:

   ```bash
   bun run types
   ```

2. **Run all tests** (requires Cloudflare credentials):

   ```bash
   # Configure Cloudflare credentials first
   alchemy login cloudflare

   # Run all tests
   bun test
   ```

3. **Manual testing** with local deployment:

   ```bash
   cd test
   bun run deploy.ts
   ```

   Then test endpoints (bearer token required):

   ```bash
   # Service info
   curl -H "Authorization: Bearer test-token-12345" http://localhost:1338/

   # Get 24h statistics
   curl -H "Authorization: Bearer test-token-12345" http://localhost:1338/stats

   # Custom time range (last hour)
   START=$(($(date +%s) - 3600))000
   END=$(date +%s)000
   curl -H "Authorization: Bearer test-token-12345" \
     "http://localhost:1338/stats?start=$START&end=$END"

   # Manual health check
   curl -X POST -H "Authorization: Bearer test-token-12345" \
     http://localhost:1338/trigger-check

   # Test without auth (should return 401)
   curl http://localhost:1338/
   ```

## License

MIT License - see [LICENSE](LICENSE) file for details
