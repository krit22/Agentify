import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { clerkMiddleware } from '@clerk/hono'
import type { AppEnv } from './types/index.js'

// Import routers
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import documentRouter from './routes/document.js'
import ticketRouter from './routes/ticket.js'
import settingsRouter from './routes/settings.js'
import webhookRouter from './routes/webhook.js'
import widgetRouter from './routes/widget.js'

export const app = new Hono<AppEnv>()

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
if (process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.startsWith('sk_test_...')) {
  app.use('/api/*', clerkMiddleware())
} else {
  console.warn('[SECURITY WARNING] Clerk credentials are not configured. Standard Clerk JWT validation is inactive.')
}

// 3. Mount Route Domains
app.route('/health', healthRouter)
app.route('/api/auth', authRouter)
app.route('/api/orgs/documents', documentRouter)
app.route('/api/orgs/tickets', ticketRouter)
app.route('/api/orgs/settings', settingsRouter)
app.route('/api/webhooks', webhookRouter)
app.route('/api/widget', widgetRouter)

app.get('/', (c) => {
  return c.text('Aegis AI Support Platform API (Hono Server)')
})

// 4. Secure Global Exception Boundary (Fail-Closed & Prevents stack trace leakages)
app.onError((err, c) => {
  console.error('[CRITICAL UNHANDLED ERROR]', err)
  c.status(500)
  return c.json({ error: 'An unexpected internal server error occurred.' })
})
