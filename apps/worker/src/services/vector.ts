import axios from 'axios'
import crypto from 'crypto'
import { pinecone } from '@repo/db'

export interface VectorChunkResult {
  id: string
  vectorId: string
  pageNumber: number | null
  sectionHeader: string | null
  rawContent: string
}

/**
 * Vector Generation & Indexing Service
 * Coordinates embeddings generation and upserting vectors to isolated Pinecone spaces.
 */
export class VectorService {
  /**
   * Generates embeddings vectors for an array of texts in a single batch using OpenRouter.
   */
  public static async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not defined in the environment variables.')
    }

    console.log(`[VECTOR] Requesting embeddings for ${texts.length} chunk blocks via OpenRouter...`)
    
    const response = await axios.post(
      'https://openrouter.ai/api/v1/embeddings',
      {
        model: 'nvidia/llama-nemotron-embed-vl-1b-v2:free',
        input: texts,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds HTTP socket limit
      }
    )

    if (!response.data?.data || !Array.isArray(response.data.data)) {
      console.error('[VECTOR ERROR] Invalid embedding response format:', response.data)
      throw new Error('Failed to generate embeddings from OpenRouter: Invalid response format.')
    }

    console.log(`[VECTOR] Embedding generation successful. Vectorized ${response.data.data.length} texts.`)
    return response.data.data.map((item: any) => item.embedding)
  }

  /**
   * Generates embeddings, structures metadata, and upserts vectors to Pinecone Index under tenant namespace isolation.
   */
  public static async upsertChunks(
    orgId: string,
    documentId: string,
    chunks: Array<{
      pageNumber: number | null
      sectionHeader: string | null
      rawContent: string
    }>
  ): Promise<VectorChunkResult[]> {
    const indexName = process.env.PINECONE_INDEX || 'aegis-ai'

    if (chunks.length === 0) {
      console.log('[VECTOR] Warning: Received 0 chunks to index.')
      return []
    }

    // 1. Bulk generate embeddings for all text chunks
    const texts = chunks.map((c) => c.rawContent)
    const embeddings = await this.generateEmbeddings(texts)

    if (embeddings.length !== chunks.length) {
      throw new Error('Mismatched count of generated embeddings and target chunks.')
    }

    const vectorsToUpsert: any[] = []
    const processedChunks: VectorChunkResult[] = []

    // 2. Map embeddings and chunks to Pinecone schema structure
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const embedding = embeddings[i]
      const chunkId = crypto.randomUUID()
      const vectorId = `chunk_${chunkId}`

      vectorsToUpsert.push({
        id: vectorId,
        values: embedding,
        metadata: {
          documentId,
          orgId,
          pageNumber: chunk.pageNumber || 0,
          sectionHeader: chunk.sectionHeader || '',
          rawContent: chunk.rawContent,
        },
      })

      processedChunks.push({
        id: chunkId,
        vectorId,
        pageNumber: chunk.pageNumber,
        sectionHeader: chunk.sectionHeader,
        rawContent: chunk.rawContent,
      })
    }

    // 3. Upsert to Pinecone strictly binding to target organization namespace
    console.log(`[VECTOR] Upserting ${vectorsToUpsert.length} vectors to Pinecone Index '${indexName}' (namespace: '${orgId}')`)
    const index = pinecone.Index(indexName)
    await index.namespace(orgId).upsert(vectorsToUpsert)

    console.log('[VECTOR] Pinecone index upsert successful.')
    return processedChunks
  }
}
