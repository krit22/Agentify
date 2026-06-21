import { Context } from 'hono'
import { HealthService } from '../services/health.js'

/**
 * Health Check Controller
 * Formats system diagnostics response and returns standard HTTP statuses.
 */
export class HealthController {
  public static async getHealth(c: Context) {
    try {
      const health = await HealthService.checkSystemHealth()
      
      if (health.status === 'unhealthy') {
        c.status(503) // Service Unavailable
      } else {
        c.status(200)
      }

      return c.json(health)
    } catch (error) {
      console.error('Unhandled health check controller error:', error)
      c.status(500)
      return c.json({ status: 'unhealthy', error: 'An unexpected system error occurred.' })
    }
  }
}
