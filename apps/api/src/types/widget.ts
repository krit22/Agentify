import type { VectorChunkMatch } from '../services/widget.js'

export interface QueryExpansionResult {
  originalQuery: string
  variants: string[]
}

export interface LexicalChunkCandidate {
  id: string
  documentId: string
  pageNumber: number | null
  sectionHeader: string | null
  rawContent: string
  rank: number
}

export interface FusedChunk {
  id: string
  documentId: string
  pageNumber: number | null
  sectionHeader: string | null
  rawContent: string
  rrfScore: number
}

export interface RerankDocument {
  text: string
}

export interface RerankRequest {
  model: string
  query: string
  documents: (string | RerankDocument)[]
  top_n?: number
}

export interface RerankResultItem {
  index: number
  relevance_score: number
  document?: RerankDocument
}

export interface RerankResponse {
  id: string
  model: string
  results: RerankResultItem[]
}
