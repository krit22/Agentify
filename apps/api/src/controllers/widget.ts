import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { prisma } from '@repo/db'
import { WidgetService } from '../services/widget.js'
import type { WidgetChatRequest, TicketEscalationInput } from '@repo/schemas'
import { promises as fs } from 'fs'
import path from 'path'

export class WidgetController {
  /**
   * Public script resolver serving the compiled Preact widget script dynamically with caching headers.
   */
  public static async script(c: Context) {
    try {
      const scriptPath = path.resolve(process.cwd(), '../widget/dist/widget.js')
      const scriptContent = await fs.readFile(scriptPath, 'utf-8')
      
      return c.text(scriptContent, 200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600', // Cache script for 1 hour
      })
    } catch (err) {
      console.error('Failed to read widget script bundle:', err)
      c.status(404)
      return c.json({ error: 'Widget script is not compiled or missing.' })
    }
  }

  /**
   * Public configuration resolver verifying Origin and returning widget configuration properties.
   */
  public static async config(c: Context) {
    try {
      const orgId = c.req.query('orgId')
      if (!orgId) {
        c.status(400)
        return c.json({ error: 'Bad Request: Missing orgId parameter.' })
      }

      // 1. Verify Origin
      const origin = c.req.header('Origin')
      const referer = c.req.header('Referer')
      
      // Handle verifyOrigin catching errors if orgId doesn't exist
      let originOk = false
      try {
        originOk = await WidgetService.verifyOrigin(orgId, origin, referer)
      } catch {
        c.status(404)
        return c.json({ error: 'Not Found: Organization context not found.' })
      }

      if (!originOk) {
        c.status(403)
        return c.json({ error: 'Forbidden: Origin is not permitted.' })
      }

      // 2. Fetch branding configurations and settings
      const settings = await prisma.organization.findUnique({
        where: { id: orgId },
        include: {
          settings: true,
          widgetConfig: true,
        },
      })

      if (!settings) {
        c.status(404)
        return c.json({ error: 'Not Found: Organization context not found.' })
      }

      c.status(200)
      return c.json({
        brandColor: settings.widgetConfig?.brandColor || '#18181b',
        greetingMessage: settings.widgetConfig?.greetingMessage || 'Hello! How can we help you today?',
        escalationSLAHours: settings.settings?.escalationSLAHours || 24,
      })
    } catch (err) {
      console.error('Widget config endpoint error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * SSE Stream powering live AI support responses with Score-based Doubt Gate checking.
   */
  public static async chat(c: Context) {
    try {
      const body = c.req.valid('json' as never) as WidgetChatRequest
      const { orgId, sessionId, message } = body

      // 1. Verify Origin
      const origin = c.req.header('Origin')
      const referer = c.req.header('Referer')
      const originOk = await WidgetService.verifyOrigin(orgId, origin, referer)
      if (!originOk) {
        c.status(403)
        return c.json({ error: 'Forbidden: Origin is not permitted.' })
      }

      // 2. Redis Rate Limiting
      const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
      const rateLimitOk = await WidgetService.checkRateLimit(ip)
      if (!rateLimitOk) {
        c.status(429)
        return c.json({ error: 'Too Many Requests: Rate limit exceeded.' })
      }

      // 3. Settings vector threshold query
      const settings = await prisma.orgSettings.findUnique({
        where: { orgId }
      })
      const threshold = settings?.vectorScoreThreshold ?? 0.74

      // 4. Retrieve conversation transcript history
      let conversation = await prisma.conversation.findFirst({
        where: { orgId, sessionId }
      })
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { orgId, sessionId, transcript: [] }
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let transcript: any[] = []
      if (conversation.transcript && typeof conversation.transcript === 'object') {
        if (Array.isArray(conversation.transcript)) {
          transcript = conversation.transcript
        }
      } else if (typeof conversation.transcript === 'string') {
        try {
          transcript = JSON.parse(conversation.transcript)
        } catch {
          transcript = []
        }
      }

      console.log('\n┌────────────────────────────────────────────────────────┐')
      console.log('│ 💬 [WIDGET CHAT] New User Message Received            │')
      console.log(`│ Message:       "${message}"`)
      console.log(`│ Session ID:    ${sessionId}`)
      console.log(`│ Org ID:        ${orgId}`)
      console.log('└────────────────────────────────────────────────────────┘')

      console.log('⚙️  [RAG STEP 1/6] Running Intent Routing...')
      const s1Start = performance.now()
      console.log(`   ├─ [CALL OUT] Sending query intent request to 'poolside/laguna-m.1:free'`)
      console.log(`   ├─ [PAYLOAD ] Message: "${message}"`)
      const needsRetrieval = await WidgetService.routeIntent(message)
      const s1Dur = performance.now() - s1Start
      console.log(`   ├─ [RECEIVE ] Response received in ${s1Dur.toFixed(2)} ms`)
      console.log(`   └─ [RESULT  ] Needs Knowledge Base Retrieval: ${needsRetrieval ? '🔍 YES' : '⚡ NO (Bypassing RAG)'}`)

      let matches: any[] = []
      let escalateForced = false
      let topScore = 0

      let s3Dur = 0
      let s4Dur = 0
      let s5Dur = 0

      if (needsRetrieval) {
        console.log('📡 [RAG STEP 2/4] Running Parallel Search (Dense Vector + Lexical FTS)...')
        const s3Start = performance.now()
        console.log(`   ├─ [CALL OUT] Querying Postgres FTS and Pinecone index parallel namespaces...`)
        const [denseMatches, lexicalMatches] = await Promise.all([
          WidgetService.queryPineconeBatched(orgId, [message]),
          WidgetService.queryPostgresFTS(orgId, [message]),
        ])
        s3Dur = performance.now() - s3Start
        console.log(`   ├─ [RECEIVE ] Database and Vector search results received in ${s3Dur.toFixed(2)} ms`)
        console.log(`   ├─ [RESULT  ] Dense Pinecone matches:  ${denseMatches.length} candidates`)
        console.log(`   └─ [RESULT  ] Lexical Postgres matches: ${lexicalMatches.length} candidates`)

        console.log('🔀 [RAG STEP 3/4] Fusing matches with Reciprocal Rank Fusion (RRF)...')
        const s4Start = performance.now()
        const fusedCandidates = WidgetService.applyRRF(denseMatches, lexicalMatches)
        s4Dur = performance.now() - s4Start
        console.log(`   ├─ [COMPUTE ] In-memory RRF fusion computed in ${s4Dur.toFixed(2)} ms`)
        console.log(`   └─ [RESULT  ] Total Fused candidates: ${fusedCandidates.length} chunks`)

        console.log('🧠 [RAG STEP 4/4] Reranking top candidates with Cross-Encoder...')
        const s5Start = performance.now()
        console.log(`   ├─ [CALL OUT] Submitting ${fusedCandidates.length} chunks to 'nvidia/llama-nemotron-rerank-vl-1b-v2:free'`)
        matches = await WidgetService.rerankCandidates(message, fusedCandidates, 5)
        s5Dur = performance.now() - s5Start
        console.log(`   ├─ [RECEIVE ] Reranker responses received in ${s5Dur.toFixed(2)} ms`)
        console.log('   ├─ [RESULT  ] Top Reranked Matches:')
        matches.forEach((m, idx) => {
          console.log(`      [Match ${idx + 1}] ID: ${m.id} | Score: ${m.score.toFixed(4)} | Preview: "${m.content.slice(0, 65).replace(/\n/g, ' ')}..."`)
        })

        topScore = matches[0]?.score || 0
        escalateForced = (topScore < threshold)

        console.log(`🛡️  Doubt Gate Evaluation:`)
        console.log(`   ├─ Top Match Score:    ${topScore.toFixed(4)}`)
        console.log(`   ├─ Config Threshold:   ${threshold.toFixed(4)}`)
        console.log(`   └─ Escalation Forced:  ${escalateForced ? '🔴 YES' : '🟢 NO'}`)
        
        console.log('\n⏱️  RAG Execution Timing Breakdown:')
        console.log(`   ├─ [RAG STEP 1] Intent Routing:       ${s1Dur.toFixed(2)} ms`)
        console.log(`   ├─ [RAG STEP 2] Parallel Search:      ${s3Dur.toFixed(2)} ms`)
        console.log(`   ├─ [RAG STEP 3] RRF Fusion:           ${s4Dur.toFixed(2)} ms`)
        console.log(`   ├─ [RAG STEP 4] Cross-Rerank:         ${s5Dur.toFixed(2)} ms`)
        console.log(`   └─ [TOTAL TIME] Pipeline Duration:   ${(s1Dur + s3Dur + s4Dur + s5Dur).toFixed(2)} ms`)
        console.log('──────────────────────────────────────────────────────────\n')
      } else {
        console.log('🟢 Doubt Gate Evaluation: Bypassed RAG for small talk / greetings. Escalation Forced: 🟢 NO')
        console.log('\n⏱️  RAG Execution Timing Breakdown:')
        console.log(`   ├─ [RAG STEP 1] Intent Routing:       ${s1Dur.toFixed(2)} ms`)
        console.log(`   ├─ [RAG STEP 2-4] Search & Rerank:   Bypassed`)
        console.log(`   └─ [TOTAL TIME] Pipeline Duration:   ${s1Dur.toFixed(2)} ms`)
        console.log('──────────────────────────────────────────────────────────\n')
        matches = []
        escalateForced = false
      }

      // Compile system instructions & messages list
      const systemPrompt = `You are Aegis AI, the automated support agent for this organization.
Use the provided knowledge base context to answer the user query accurately and concisely.

${escalateForced 
  ? "CRITICAL: The knowledge base match score is too low. You DO NOT have enough trusted information to answer this request. You MUST politely state that you don't know the answer or can't find it in the knowledge base, and politely ask if they would like to escalate the conversation to a human support agent." 
  : "If the provided context does not contain the answer, or if you are unsure, politely explain that you do not have that information and ask the user if they would like to escalate the conversation to a human support agent."
}

Context Chunks:
${matches.length > 0 
  ? matches.map((m, i) => `[Chunk ${i+1}] (Score: ${m.score.toFixed(3)}, Header: ${m.sectionHeader || 'General'}):\n${m.content}`).join('\n\n')
  : 'No context matches found.'
}`

      const messages = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...transcript.map((t: any) => ({ role: t.role, content: t.content })),
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]

      const apiKey = process.env.OPENROUTER_API_KEY

      // Pre-save user message to transcript (outside transaction)
      const updatedUserTranscript = [...transcript, { role: 'user', content: message }]
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { transcript: updatedUserTranscript }
      })

      // Return SSE response stream
      return streamSSE(c, async (stream) => {
        let fullReply = ''

        const isE2e = process.env.IS_E2E_TEST === 'true'
        if (!apiKey || isE2e) {
          // Stream a mock response if API Key is not configured or we are in E2E test mode
          const mockText = `[MOCK REPLY] Top score: ${topScore.toFixed(3)} (threshold: ${threshold}). Forced escalation: ${escalateForced ? 'YES' : 'NO'}. Matches found: ${matches.length}.`
          const words = mockText.split(' ')
          for (const word of words) {
            fullReply += word + ' '
            await stream.writeSSE({
              data: JSON.stringify({ text: word + ' ' }),
              event: 'message',
            })
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
        } else {
          try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://aegis.ai',
                'X-Title': 'Aegis AI',
              },
              body: JSON.stringify({
                model: process.env.OPENROUTER_MODEL || 'poolside/laguna-m.1:free',
                messages,
                stream: true,
                max_tokens: 2048,
              }),
            })

            if (!response.ok) {
              const errText = await response.text()
              console.error('OpenRouter stream request failed:', errText)
              await stream.writeSSE({
                data: JSON.stringify({ error: 'Failed to retrieve response from AI backend.' }),
                event: 'error',
              })
            } else {
              const reader = response.body?.getReader()
              const decoder = new TextDecoder()
              let buffer = ''

              if (reader) {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break

                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split('\n')
                  buffer = lines.pop() || ''

                  for (const line of lines) {
                    const cleanLine = line.trim()
                    if (!cleanLine) continue
                    if (cleanLine === 'data: [DONE]') break

                    if (cleanLine.startsWith('data: ')) {
                      try {
                        const parsed = JSON.parse(cleanLine.slice(6))
                        const content = parsed.choices?.[0]?.delta?.content || ''
                        if (content) {
                          fullReply += content
                          await stream.writeSSE({
                            data: JSON.stringify({ text: content }),
                            event: 'message',
                          })
                        }
                      } catch {
                        // ignore malformed SSE lines
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('SSE streaming error:', e)
            await stream.writeSSE({
              data: JSON.stringify({ error: 'SSE stream connection lost.' }),
              event: 'error',
            })
          }
        }

        // Finalize transcript recording
        if (fullReply) {
          const finalTranscript = [...updatedUserTranscript, { role: 'assistant', content: fullReply }]
          await prisma.conversation.update({
            where: { id: conversation!.id },
            data: { transcript: finalTranscript }
          })
        }
      })
    } catch (err) {
      console.error('Widget chat endpoint error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred.' })
    }
  }

  /**
   * Public widget escalation endpoint converting low-score conversations to open rep support tickets.
   */
  public static async escalate(c: Context) {
    try {
      const body = c.req.valid('json' as never) as TicketEscalationInput
      const { orgId, sessionId, userEmail, userSummary } = body

      // 1. Verify Origin
      const origin = c.req.header('Origin')
      const referer = c.req.header('Referer')
      const originOk = await WidgetService.verifyOrigin(orgId, origin, referer)
      if (!originOk) {
        c.status(403)
        return c.json({ error: 'Forbidden: Origin is not permitted.' })
      }

      // 2. Perform escalation database transactions
      const ticket = await WidgetService.escalateConversation({
        orgId,
        sessionId,
        userEmail,
        userSummary,
      })

      c.status(201)
      return c.json({
        message: 'Support ticket escalated and logged successfully.',
        ticketId: ticket.id,
        status: ticket.status,
      })
    } catch (err) {
      console.error('Widget escalate endpoint error:', err)
      c.status(500)
      return c.json({ error: 'An unexpected internal server error occurred during escalation.' })
    }
  }
}
