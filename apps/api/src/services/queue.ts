import { Queue } from 'bullmq'
import { redisConnection } from '@repo/db'

// Initialize the BullMQ Ingestion Queue using the shared Redis Connection
export const ingestionQueue = new Queue('document-ingestion', {
  connection: redisConnection as any,
})

/**
 * Queue Management Service
 * Coordinates pushing background asynchronous jobs to Redis via BullMQ.
 */
export class QueueService {
  /**
   * Enqueues a document ingestion task to layout parser workers.
   */
  public static async enqueueIngestion(data: {
    documentId: string
    orgId: string
    fileUrl: string
    fileName: string
  }): Promise<void> {
    console.log(`[QUEUE] Enqueuing ingestion task for document ${data.documentId} (org: ${data.orgId})`)
    
    // Add job to BullMQ queue with exponential retry backoff parameters
    await ingestionQueue.add('process-doc', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true, // Clean up Redis memory once job completes successfully
      removeOnFail: false,   // Keep failed jobs in Redis for logs and debugging desk context
    })
  }
}
