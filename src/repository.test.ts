import { describe, test } from 'bun:test'
import {
  createHealthCheckInMemoryRepository,
  testCleanRepository,
} from './repository'

describe('In Memory Repository', () => {
  test('run predefined self test', async () => {
    const repo = createHealthCheckInMemoryRepository()
    await testCleanRepository(repo)
  })
})
