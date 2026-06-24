import './load-env.js'
import { Worker } from 'bullmq'
import { redisConnection } from '@repo/db'
import { IngestionService } from './services/ingestion.js'

console.log('[WORKER] Starting Aegis AI background ingestion processor...')

// 1. Initialize BullMQ Worker polling the document-ingestion queue
const worker = new Worker(
  'document-ingestion',
  async (job) => {
    console.log(`[WORKER] Received job ${job.id} (name: ${job.name}): Processing document ${job.data.documentId}`)
    if (job.name === 'delete-doc') {
      await IngestionService.processDeletion(job.data)
    } else {
      await IngestionService.processJob(job.data)
    }
  },
  {
    connection: redisConnection as any,
    concurrency: 5, // Process up to 5 documents concurrently
  }
)

// 2. Register operational hooks for diagnostics and monitoring
worker.on('active', (job) => {
  console.log(`[WORKER] Job ${job.id} is now processing.`)
})

worker.on('completed', (job) => {
  console.log(`[WORKER] Job ${job.id} has completed successfully.`)
})

worker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job?.id} failed:`, err.message || err)
})

// 3. Graceful shutdown operations
process.on('SIGTERM', async () => {
  console.log('[WORKER] SIGTERM received. Gracefully closing queue connections...')
  await worker.close()
  process.exit(0)
})
