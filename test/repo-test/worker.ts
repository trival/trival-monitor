import { createDb } from '../../src/db/db'
import { healthCheckSchema } from '../../src/db/schema'
import {
  createHealthCheckD1Repository,
  testCleanRepository,
} from '../../src/repository'
import { Env } from '../../src/types'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = createDb(env.DB)

    await db.delete(healthCheckSchema).run()

    const repo = createHealthCheckD1Repository(db)

    try {
      await testCleanRepository(repo)
    } catch (error: any) {
      return new Response(`Error cleaning repository: ${error.message}`, {
        status: 500,
      })
    }

    return new Response('Repo Test Working')
  },
}
