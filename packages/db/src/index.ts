import { PrismaClient } from '@prisma/client'
import { Pinecone } from '@pinecone-database/pinecone'
import { Redis } from 'ioredis'

// Ensure singletons are used in development to prevent hot-reloading from opening too many connections.
const globalForDb = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pinecone: Pinecone | undefined
  redis: Redis | undefined
}

// 1. Prisma Client Initialization
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL environment variable is required in production.')
  } else {
    console.warn('DATABASE_URL environment variable is missing. Prisma Client may not connect properly.')
  }
}

export const prisma =
  globalForDb.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.prisma = prisma
}

// 2. Pinecone Client Initialization
const getPineconeClient = (): Pinecone => {
  const apiKey = process.env.PINECONE_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PINECONE_API_KEY environment variable is required in production.')
    } else {
      console.warn('PINECONE_API_KEY environment variable is missing. Pinecone initialization will fail if queries are made.')
      // Return a dummy client or throw error on call, but returning an instance with empty key will fail during initialization.
      // We throw a clear error to make sure it's resolved during development.
      throw new Error('PINECONE_API_KEY environment variable is not defined.')
    }
  }
  return new Pinecone({ apiKey })
}

export const pinecone = globalForDb.pinecone ?? getPineconeClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pinecone = pinecone
}

// 3. Redis Client Initialization (Required for BullMQ queues/workers)
const getRedisClient = (): Redis => {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ queue operations
    connectTimeout: 5000,
  })
}

export const redisConnection = globalForDb.redis ?? getRedisClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.redis = redisConnection
}

// Export database client types and schema definitions
export * from '@prisma/client'
