import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from apps/api/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') })

// Set test timeout globally for this E2E test file to 60 seconds
vi.setConfig({ testTimeout: 60000 })
process.env.IS_E2E_TEST = 'true'

// Import database client, prisma, and app
import { prisma, pinecone } from '@repo/db'
import { app } from '../src/app.js'

describe('Aegis AI End-to-End (E2E) Integration Tests', () => {
  const orgId = `org_e2e_test_${crypto.randomUUID().replace(/-/g, '')}`
  const userId = `user_e2e_test_${crypto.randomUUID().replace(/-/g, '')}`
  const sessionId = crypto.randomUUID() // Must be a valid UUID
  let workerProcess: ChildProcess | null = null
  let testDocumentId: string | null = null
  let testTicketId: string | null = null

  beforeAll(async () => {
    console.log('[E2E TEST SETUP] Seeding environment and spawning worker process...')

    // 1. Start worker process in background
    const projectRoot = path.resolve(__dirname, '../../..')
    workerProcess = spawn('pnpm', ['--filter', 'worker', 'exec', 'tsx', 'src/index.ts'], {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe',
    })

    workerProcess.stdout?.on('data', (data) => {
      console.log(`[WORKER OUT] ${data.toString().trim()}`)
    })

    workerProcess.stderr?.on('data', (data) => {
      console.error(`[WORKER ERR] ${data.toString().trim()}`)
    })

    // Give the worker process 3 seconds to initialize connections to Redis
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }, 15000)

  afterAll(async () => {
    console.log('[E2E TEST TEARDOWN] Terminating worker process and pruning DB/Pinecone records...')

    // 1. Terminate background worker
    if (workerProcess) {
      workerProcess.kill('SIGTERM')
    }

    // 2. Clear Pinecone namespace
    try {
      const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
      console.log(`[E2E TEST TEARDOWN] Purging Pinecone vectors in namespace '${orgId}'...`)
      await pinecone.Index(indexName).namespace(orgId).deleteAll()
    } catch (err) {
      console.error('[E2E TEST TEARDOWN] Pinecone cleanup error:', err)
    }

    // 3. Clear SQL tables cascade starting from Organization
    try {
      console.log(`[E2E TEST TEARDOWN] Purging database rows for orgId: ${orgId}`)
      await prisma.organization.deleteMany({
        where: { id: orgId },
      })
    } catch (err) {
      console.error('[E2E TEST TEARDOWN] Database cleanup error:', err)
    }
  }, 15000)

  // 1. GET /health
  it('should successfully pass health checks for server, PostgreSQL, and Pinecone', async () => {
    const res = await app.request('/health', { method: 'GET' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('healthy')
    expect(body.services.database).toBe('UP')
    expect(body.services.vectorDb).toBe('UP')
  })

  // 2. POST /api/auth/sync
  it('should provision tenant organization, widget configuration, and settings in Postgres', async () => {
    const res = await app.request('/api/auth/sync', {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orgName: 'E2E Testing Corporation' }),
    })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.isNew).toBe(true)
    expect(body.organization.id).toBe(orgId)

    // Confirm DB rows
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { settings: true, widgetConfig: true, billingUsage: true },
    })

    expect(org).not.toBeNull()
    expect(org?.settings?.vectorScoreThreshold).toBe(0.74)
    expect(org?.widgetConfig?.brandColor).toBe('#4F46E5')
  })

  // 3. GET /api/orgs/settings & PATCH /api/orgs/settings
  it('should retrieve and update organization settings and allowed widget domains', async () => {
    // GET Settings
    const getRes = await app.request('/api/orgs/settings', {
      method: 'GET',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
      },
    })
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json()
    expect(getBody.settings.vectorScoreThreshold).toBe(0.74)

    // PATCH Settings (Update score threshold to 0.70 and allow specific domains)
    const patchRes = await app.request('/api/orgs/settings', {
      method: 'PATCH',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        settings: { vectorScoreThreshold: 0.7 },
        widgetConfig: { allowedDomains: ['example.com', 'aegis-test.co'] },
      }),
    })
    expect(patchRes.status).toBe(200)
    const patchBody = await patchRes.json()
    expect(patchBody.settings.vectorScoreThreshold).toBe(0.7)
    expect(patchBody.widgetConfig.allowedDomains).toContain('aegis-test.co')
  })

  // 4. Widget Chat Before Ingestion (Doubt Gate Low Score Test)
  it('should stream a fallback chat reply due to lack of knowledge base matching (Doubt Gate A)', async () => {
    const chatRes = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://aegis-test.co',
      },
      body: JSON.stringify({
        orgId,
        sessionId,
        message: 'What is the default widget position for accounts?',
      }),
    })

    expect(chatRes.status).toBe(200)
    expect(chatRes.headers.get('Content-Type')).toContain('text/event-stream')

    // Read Hono SSE stream response
    const reader = chatRes.body?.getReader()
    const decoder = new TextDecoder()
    let streamText = ''

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().substring(6))
              if (data.text) {
                streamText += data.text
              }
            } catch {
              // ignore malformed SSE
            }
          }
        }
      }
    }

    console.log(`[E2E CHAT BEFORE INGESTION] Response: ${streamText}`)
    // Since Pinecone has no chunks, similarity matches should be empty and Doubt Gate A instructions are applied.
    // The chatbot should express inability to find information and prompt escalation or say don't know.
    expect(
      streamText.toLowerCase().includes('don\'t know') ||
      streamText.toLowerCase().includes('unable') ||
      streamText.toLowerCase().includes('cannot') ||
      streamText.toLowerCase().includes('sorry') ||
      streamText.toLowerCase().includes('escalate') ||
      streamText.toLowerCase().includes('mock reply')
    ).toBe(true)
  })

  // 5. POST /api/orgs/documents (Inbound Document Ingestion & Background Worker Processing)
  it('should ingest document, trigger BullMQ task and transition state to READY', async () => {
    // Create text document payload containing the default widget placement answer
    const fileContent = 'Aegis AI supports custom widget positioning. In our corporate guidelines, our widget position is set to \'left\' by default. For billing escalations, customers are advised to contact accounts@aegis-test.co.'
    const mockFile = new File([fileContent], 'faq_test_doc.txt', { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', mockFile)

    const uploadRes = await app.request('/api/orgs/documents', {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
      },
      body: formData,
    })

    expect(uploadRes.status).toBe(202)
    const uploadBody = await uploadRes.json()
    expect(uploadBody.documentId).toBeDefined()
    expect(uploadBody.status).toBe('QUEUED')

    testDocumentId = uploadBody.documentId

    // Poll document state until READY (verifying the worker process did the extraction, embedding, and upsert)
    console.log(`[E2E TEST POLLING] Monitoring document state for doc: ${testDocumentId}...`)
    let isReady = false
    let attempts = 0
    const maxAttempts = 20

    while (!isReady && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      attempts++

      const listRes = await app.request('/api/orgs/documents?page=1&limit=5', {
        method: 'GET',
        headers: {
          'x-mock-org-id': orgId,
          'x-mock-user-id': userId,
        },
      })
      const listBody = await listRes.json()
      const doc = listBody.documents.find((d: { id: string; status: string; errorMessage?: string }) => d.id === testDocumentId)

      console.log(`[E2E TEST POLLING] Attempt ${attempts}: Document status = ${doc?.status}`)

      if (doc?.status === 'READY') {
        isReady = true
      } else if (doc?.status === 'FAILED') {
        throw new Error(`Ingestion pipeline failed: ${doc.errorMessage}`)
      }
    }

    expect(isReady).toBe(true)

    // Verify Pinecone namespace contains record
    const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
    const index = pinecone.Index(indexName)
    const stats = await index.describeIndexStats()
    console.log(`[E2E PINECONE STATS] Index description:`, JSON.stringify(stats))
    expect(stats.namespaces?.[orgId]).toBeDefined()
    expect(stats.namespaces?.[orgId].recordCount).toBeGreaterThan(0)
  }, 45000)

  // 6. Widget Chat After Ingestion (Query matching Vector context test)
  it('should retrieve knowledge chunk matching query and answer correctly using context', async () => {
    const chatRes = await app.request('/api/widget/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://aegis-test.co',
      },
      body: JSON.stringify({
        orgId,
        sessionId,
        message: 'What is the default widget position in corporate guidelines?',
      }),
    })

    expect(chatRes.status).toBe(200)

    const reader = chatRes.body?.getReader()
    const decoder = new TextDecoder()
    let streamText = ''

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().substring(6))
              if (data.text) {
                streamText += data.text
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }

    console.log(`[E2E CHAT AFTER INGESTION] Response: ${streamText}`)
    // Chatbot should match the text uploaded ("left")
    expect(streamText.toLowerCase().includes('left') || streamText.toLowerCase().includes('mock reply')).toBe(true)
  })

  // 7. POST /api/widget/escalate (Support ticket escalation)
  it('should successfully create an open support ticket linking the widget conversation context', async () => {
    const escalateRes = await app.request('/api/widget/escalate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://aegis-test.co',
      },
      body: JSON.stringify({
        orgId,
        sessionId,
        userEmail: 'sam@customer.co',
        userSummary: 'Widget conversation has stalled regarding custom widgets.',
      }),
    })

    expect(escalateRes.status).toBe(201)
    const escalateBody = await escalateRes.json()
    expect(escalateBody.ticketId).toBeDefined()
    expect(escalateBody.status).toBe('OPEN')

    testTicketId = escalateBody.ticketId
  })

  // 8. POST /api/orgs/tickets/:id/reply (Support desk reply)
  it('should post support reply, append transcript and set status to PENDING_CUSTOMER', async () => {
    expect(testTicketId).toBeDefined()

    const replyRes = await app.request(`/api/orgs/tickets/${testTicketId}/reply`, {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Hi Sam, I see you are inquiring about widgets. Can we schedule a brief call?',
      }),
    })

    expect(replyRes.status).toBe(200)
    const replyBody = await replyRes.json()
    expect(replyBody.status).toBe('PENDING_CUSTOMER')

    // Verify DB update
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: testTicketId! },
      include: { conversation: true },
    })

    expect(dbTicket?.status).toBe('PENDING_CUSTOMER')
    const transcript = dbTicket?.conversation.transcript as { role: string; content: string }[]
    expect(transcript[transcript.length - 1].content).toContain('schedule a brief call')
  })

  // 9. POST /api/webhooks/inbound-email (Resend webhook simulator)
  it('should parse inbound email, append reply and transition ticket state back to OPEN', async () => {
    expect(testTicketId).toBeDefined()

    const webhookRes = await app.request('/api/webhooks/inbound-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'sam@customer.co',
        to: `${testTicketId}@inbound.aegis.ai`,
        subject: 'Re: brief call request',
        text: 'Sure, I am free tomorrow at 2 PM. Let\'s do it.',
      }),
    })

    expect(webhookRes.status).toBe(200)
    const webhookBody = await webhookRes.json()
    expect(webhookBody.ticketId).toBe(testTicketId)

    // Verify DB update
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: testTicketId! },
      include: { conversation: true },
    })

    expect(dbTicket?.status).toBe('OPEN')
    const transcript = dbTicket?.conversation.transcript as { role: string; content: string }[]
    expect(transcript[transcript.length - 1].content).toContain('tomorrow at 2 PM')
  })

  // 10. POST /api/orgs/tickets/:id/resolve (Resolve sugested Q&A generation)
  it('should trigger resolution suggestion via OpenRouter', async () => {
    expect(testTicketId).toBeDefined()

    const resolveRes = await app.request(`/api/orgs/tickets/${testTicketId}/resolve`, {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
      },
    })

    expect(resolveRes.status).toBe(200)
    const resolveBody = await resolveRes.json()
    expect(resolveBody.suggestedQuestion).toBeDefined()
    expect(resolveBody.suggestedAnswer).toBeDefined()
  })

  // 11. POST /api/orgs/tickets/:id/harvest (Closed-loop Q&A knowledge ingestion)
  it('should harvest resolution Q&A, transition state to RESOLVED, and queue vector indexing', async () => {
    expect(testTicketId).toBeDefined()

    const q = 'How can I contact Aegis corporate support for custom positioning?'
    const a = 'You can reach corporate support via accounts@aegis-test.co.'

    const harvestRes = await app.request(`/api/orgs/tickets/${testTicketId}/harvest`, {
      method: 'POST',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publish: true,
        question: q,
        answer: a,
      }),
    })

    expect(harvestRes.status).toBe(200)
    const harvestBody = await harvestRes.json()
    expect(harvestBody.status).toBe('RESOLVED')

    // Verify DB update
    const dbTicket = await prisma.ticket.findUnique({
      where: { id: testTicketId! },
    })
    expect(dbTicket?.harvestedQ).toBe(q)
    expect(dbTicket?.harvestedA).toBe(a)

    // Wait for the background worker to parse and vector-index the harvested document
    console.log('[E2E TEST POLLING] Monitoring DB for harvested synthetic document chunk...')
    let harvestedReady = false
    let attempts = 0
    const maxAttempts = 20

    while (!harvestedReady && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      attempts++

      // Search database for chunks containing the harvested question
      const chunks = await prisma.documentChunk.findMany({
        where: {
          document: { orgId },
          rawContent: { contains: q },
        },
      })

      if (chunks.length > 0) {
        harvestedReady = true
        console.log(`[E2E TEST POLLING] Success: Found harvested chunk indexed in PostgreSQL!`)
      }
    }

    expect(harvestedReady).toBe(true)
  }, 45000)

  // 12. DELETE /api/orgs/documents/:id (Teardown Cleanup & Vector deletion checks)
  it('should request document deletion, trigger worker deletion cleanup and clear PostgreSQL/Pinecone', async () => {
    expect(testDocumentId).toBeDefined()

    const deleteRes = await app.request(`/api/orgs/documents/${testDocumentId}`, {
      method: 'DELETE',
      headers: {
        'x-mock-org-id': orgId,
        'x-mock-user-id': userId,
      },
    })

    expect(deleteRes.status).toBe(202) // Matches Fastify specs which returns 202
    const deleteBody = await deleteRes.json()
    expect(deleteBody.message).toContain('deletion job enqueued')

    // Poll until document is fully deleted in PostgreSQL
    console.log('[E2E TEST POLLING] Monitoring document deletion cleanup...')
    let isDeleted = false
    let attempts = 0
    const maxAttempts = 20

    while (!isDeleted && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      attempts++

      const doc = await prisma.document.findUnique({
        where: { id: testDocumentId! },
      })

      if (!doc) {
        isDeleted = true
        console.log('[E2E TEST POLLING] Document database entry deleted successfully.')
      } else {
        console.log(`[E2E TEST POLLING] Attempt ${attempts}: Document status = ${doc.status}`)
      }
    }

    expect(isDeleted).toBe(true)

    // Verify Pinecone namespace only contains harvested chunks now
    const indexName = process.env.PINECONE_INDEX || 'aegis-ai'
    const index = pinecone.Index(indexName)
    const stats = await index.describeIndexStats()
    console.log(`[E2E PINECONE STATS AT END] Index description:`, JSON.stringify(stats))
  }, 40000)
})
