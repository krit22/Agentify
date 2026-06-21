import { serve } from '@hono/node-server'
import { app } from './app.js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment configurations
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

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
