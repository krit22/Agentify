import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../api/.env') })

import { prisma } from '@repo/db'
import { IngestionService } from './src/services/ingestion.js'
import { createClient } from '@supabase/supabase-js'

async function runTest() {
  console.log('[INTEGRATION TEST] Starting end-to-end ingestion worker test...')

  const orgId = 'test-org-uuid-9999'
  const documentId = 'test-doc-uuid-9999'
  const title = 'worker_test_doc.txt'
  const fileContent = 'Aegis AI supports automated ticket harvesting. This synthetic doc is created to verify that the parsing, chunking, and embedding stages work properly.'

  // 1. Ensure the test organization exists
  console.log('[INTEGRATION TEST] Pre-seeding test organization...')
  await prisma.organization.upsert({
    where: { id: orgId },
    create: {
      id: orgId,
      name: 'Integration Test Org',
      settings: {
        create: {
          vectorScoreThreshold: 0.75,
          defaultTicketUrgency: 'med',
        },
      },
      billingUsage: {
        create: {
          tier: 'FREE',
          billingCycleEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days out
        },
      },
    },
    update: {},
  })

  // 2. Upload sample file to Supabase Storage
  console.log('[INTEGRATION TEST] Uploading text payload to Supabase Storage...')
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseBucket = process.env.SUPABASE_BUCKET || 'files'

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role key is not defined in env.')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const buffer = Buffer.from(fileContent, 'utf-8')
  
  const { error: uploadError } = await supabase.storage
    .from(supabaseBucket)
    .upload(`${documentId}.txt`, buffer, {
      contentType: 'text/plain',
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Failed to upload sample doc to Supabase: ${uploadError.message}`)
  }

  // Generate a signed retrieval URL
  const { data: signedData, error: signError } = await supabase.storage
    .from(supabaseBucket)
    .createSignedUrl(`${documentId}.txt`, 60 * 10) // 10 minutes validation

  if (signError || !signedData) {
    throw new Error(`Failed to sign sample retrieval URL: ${signError?.message}`)
  }

  const fileUrl = signedData.signedUrl
  console.log(`[INTEGRATION TEST] Uploaded file signed retrieval URL: ${fileUrl}`)

  // 3. Register document row in PostgreSQL
  console.log('[INTEGRATION TEST] Pre-seeding Document row in QUEUED state...')
  // Cleanup any old test runs
  await prisma.document.deleteMany({
    where: { id: documentId },
  })

  await prisma.document.create({
    data: {
      id: documentId,
      orgId,
      title,
      sourceUrl: fileUrl,
      status: 'QUEUED',
      fileSize: buffer.byteLength,
      version: 1,
    },
  })

  // 4. Run the Ingestion worker pipeline processJob directly
  console.log('[INTEGRATION TEST] Triggering worker processJob...')
  await IngestionService.processJob({
    documentId,
    orgId,
    fileUrl,
    fileName: title,
  })

  // 5. Verify database states
  console.log('[INTEGRATION TEST] Verifying database records...')
  const docResult = await prisma.document.findUnique({
    where: { id: documentId },
    include: { chunks: true },
  })

  if (!docResult) {
    throw new Error('[INTEGRATION TEST] FAILED: Document not found after run.')
  }

  console.log(`[INTEGRATION TEST] Document Ingestion Status: ${docResult.status}`)
  console.log(`[INTEGRATION TEST] Created ${docResult.chunks.length} DocumentChunks in PostgreSQL.`)

  if (docResult.status !== 'READY') {
    throw new Error(`[INTEGRATION TEST] FAILED: Expected READY status, got ${docResult.status}. Error: ${docResult.errorMessage}`)
  }

  // 6. Verify Pinecone namespace query
  console.log('[INTEGRATION TEST] Verifying vectors in Pinecone namespace...')
  const { pinecone } = await import('@repo/db')
  const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
  const index = pinecone.Index(indexName)
  const pineconeStats = await index.describeIndexStats()
  console.log('[INTEGRATION TEST] Index statistics:', JSON.stringify(pineconeStats))

  // Run cleanup deletion
  console.log('[INTEGRATION TEST] Running cleanup processDeletion...')
  await IngestionService.processDeletion({
    documentId,
    orgId,
  })

  // Confirm document is deleted in PostgreSQL
  const docAfterDelete = await prisma.document.findUnique({
    where: { id: documentId },
  })

  if (docAfterDelete) {
    throw new Error('[INTEGRATION TEST] FAILED: Document was not deleted after processDeletion.')
  }
  console.log('[INTEGRATION TEST] Document metadata cleaned up in PostgreSQL.')

  console.log('[INTEGRATION TEST] SUCCESS: End-to-end ingestion integration test run completed successfully!')
}

runTest()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error('[INTEGRATION TEST FAILED]', err)
    process.exit(1)
  })
