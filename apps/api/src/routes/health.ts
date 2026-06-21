import { Hono } from 'hono'
import { HealthController } from '../controllers/health.js'

const healthRouter = new Hono()

// Maps to GET /health
healthRouter.get('/', HealthController.getHealth)

export default healthRouter
