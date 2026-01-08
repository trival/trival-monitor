import alchemy from 'alchemy'
import { D1Database, Worker } from 'alchemy/cloudflare'
import { beforeAll, describe, expect, test } from 'bun:test'
import { join } from 'path'

describe('Db Repo in Worker', () => {
  let workerUrl: string

  beforeAll(async () => {
    // Enable local mode for testing
    const app = await alchemy('db-repo-test', {
      local: true,
    })

    // Resolve paths
    const projectRoot = join(import.meta.dir, '../..')
    const migrationsDir = join(projectRoot, 'migrations')

    // Create D1 database with migrations
    const db = await D1Database('repo_test_db', {
      name: 'repo_test_db',
      migrationsDir: migrationsDir,
    })

    const mockTarget = await Worker('repo-test-worker', {
      name: 'repo-test-worker',
      entrypoint: join(import.meta.dir, './worker.ts'),
      compatibilityDate: '2025-01-05',

      bindings: {
        DB: db,
      },
    })

    await app.finalize()

    workerUrl = mockTarget.url!
  })

  test('repo worker test successfull', async () => {
    // Test 200
    const res200 = await fetch(workerUrl)
    const response = await res200.text()
    console.log('Response from repo test worker:', response, res200.status)
    expect(res200.status).toBe(200)
    expect(response).toBe('Repo Test Working')
  })
})
