import { prisma } from './index.js'

async function runFtsMigration() {
  console.log('[DATABASE MIGRATION] Starting full-text search GIN index creation...')
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS document_chunk_raw_content_fts_idx 
      ON "DocumentChunk" USING gin(to_tsvector('english', "rawContent"));
    `)
    console.log('[DATABASE MIGRATION] GIN index on to_tsvector(\'english\', "rawContent") created successfully.')
  } catch (error) {
    console.error('[DATABASE MIGRATION ERROR] Failed to create GIN index:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

runFtsMigration()
