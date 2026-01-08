import alchemy from 'alchemy'
import { Worker } from 'alchemy/cloudflare'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'path'

describe('Mock Target Worker', () => {
  let mockTargetUrl: string

  beforeAll(async () => {
    // Enable local mode for testing
    const app = await alchemy('mock-target-test', {
      local: true,
    })

    const mockTarget = await Worker('mock-target', {
      name: 'mock-target-test',
      entrypoint: join(import.meta.dir, './mock-target.ts'),
      compatibilityDate: '2025-01-05',
    })

    await app.finalize()

    mockTargetUrl = mockTarget.url!
  })

  beforeEach(async () => {
    // Reset to default
    await fetch(`${mockTargetUrl}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 200, message: 'OK' }),
    })
  })

  test('mock target responds to status code control via query params', async () => {
    // Test 200
    const res200 = await fetch(`${mockTargetUrl}?status=200`)
    expect(res200.status).toBe(200)

    // Test 500
    const res500 = await fetch(`${mockTargetUrl}?status=500`)
    expect(res500.status).toBe(500)

    // Test 404
    const res404 = await fetch(`${mockTargetUrl}?status=404`)
    expect(res404.status).toBe(404)
  })

  test('mock target responds to delay control', async () => {
    const start = Date.now()
    await fetch(`${mockTargetUrl}?delay=1000`)
    const duration = Date.now() - start

    expect(duration).toBeGreaterThanOrEqual(1000)
    expect(duration).toBeLessThan(1500) // Allow some overhead
  })

  test('respects message query parameter', async () => {
    const response = await fetch(`${mockTargetUrl}?message=CustomMessage`)
    expect(await response.text()).toBe('CustomMessage')
  })

  test('mock target can be configured persistently', async () => {
    // Configure mock to return 201
    await fetch(`${mockTargetUrl}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 201 }),
    })

    // Verify configuration persists
    const res = await fetch(mockTargetUrl)
    expect(res.status).toBe(201)
  })

  describe('POST /configure', () => {
    test('sets persistent configuration', async () => {
      const configResponse = await fetch(`${mockTargetUrl}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 503, message: 'Service Test Failure' }),
      })

      expect(configResponse.status).toBe(200)
      const configResult = await configResponse.json()
      expect(configResult.success).toBe(true)
      expect(configResult.config.status).toBe(503)

      // Verify configuration persists
      const testResponse = await fetch(mockTargetUrl)
      expect(testResponse.status).toBe(503)
      expect(await testResponse.text()).toBe('Service Test Failure')
    })

    test('returns 400 for invalid JSON', async () => {
      const response = await fetch(`${mockTargetUrl}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      })

      expect(response.status).toBe(400)
    })
  })
})
