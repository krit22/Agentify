import { prisma, pinecone } from '@repo/db'

export interface HealthStatus {
  status: 'healthy' | 'unhealthy'
  uptime: number
  memoryUsage: NodeJS.MemoryUsage
  services: {
    database: 'UP' | 'DOWN'
    vectorDb: 'UP' | 'DOWN'
  }
}

/**
 * Health Check Service
 * Verifies system level metrics and external database connections.
 */
export class HealthService {
  public static async checkSystemHealth(): Promise<HealthStatus> {
    let dbStatus: 'UP' | 'DOWN' = 'DOWN'
    let vectorDbStatus: 'UP' | 'DOWN' = 'DOWN'

    // 1. Check Neon PostgreSQL via Prisma
    try {
      await prisma.$queryRaw`SELECT 1`
      dbStatus = 'UP'
    } catch (error) {
      console.error('Database health check failed:', error)
    }

    // 2. Check Pinecone connection
    try {
      await pinecone.listIndexes()
      vectorDbStatus = 'UP'
    } catch (error) {
      console.error('Pinecone health check failed:', error)
    }

    const overallHealthy = dbStatus === 'UP' && vectorDbStatus === 'UP'

    return {
      status: overallHealthy ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      services: {
        database: dbStatus,
        vectorDb: vectorDbStatus,
      },
    }
  }
}
