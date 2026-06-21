import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { prisma, pinecone } from '@repo/db'


const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
