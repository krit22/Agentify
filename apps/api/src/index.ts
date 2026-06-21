import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { clerkMiddleware } from '@clerk/hono'
import dotenv from 'dotenv'
import path from 'path'

// Load environment configurations
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

// Import routers
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import type { AppEnv } from './types/index.js'

const app = new Hono<AppEnv>()

// 1. Safe CORS Middleware
app.use(
  '/api/*',
  cors({
    origin: '*', // In production, restrict to configured domains (WidgetConfig allowedDomains)
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'x-mock-org-id',
      'x-mock-user-id',
      'x-mock-role',
    ],
  })
)

// 2. Load Clerk JWT Authentication parser on API endpoints.
// We only load Clerk if keys are configured; otherwise, we rely on mock auth headers in development.
if (process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.startsWith('sk_test_...')) {
  app.use('/api/*', clerkMiddleware())
} else {
  console.warn('[SECURITY WARNING] Clerk credentials are not configured. Standard Clerk JWT validation is inactive.')
}

// 3. Mount Route Domains
app.route('/health', healthRouter)
app.route('/api/auth', authRouter)

app.get('/', (c) => {
  return c.text('Aegis AI Support Platform API (Hono Server)')
})

// 4. Secure Global Exception Boundary (Fail-Closed & Prevents stack trace leakages)
app.onError((err, c) => {
  console.error('[CRITICAL UNHANDLED ERROR]', err)
  c.status(500)
  return c.json({ error: 'An unexpected internal server error occurred.' })
})

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`)
  }
)
