import { describe, it, expect } from 'vitest'
import { WidgetService } from '../src/services/widget.js'
import type { VectorChunkMatch } from '../src/services/widget.js'
import type { LexicalChunkCandidate } from '../src/types/widget.js'

describe('Reciprocal Rank Fusion (RRF) algorithm tests', () => {
  it('should rank items properly based on reciprocal ranks', () => {
    const dense: VectorChunkMatch[] = [
      { id: '1', score: 0.9, content: 'Content 1', documentId: 'doc1', pageNumber: 1, sectionHeader: 'A' },
      { id: '2', score: 0.8, content: 'Content 2', documentId: 'doc1', pageNumber: 1, sectionHeader: 'B' },
      { id: '3', score: 0.7, content: 'Content 3', documentId: 'doc1', pageNumber: 1, sectionHeader: 'C' }
    ]

    const lexical: LexicalChunkCandidate[] = [
      { id: '2', rank: 1.0, rawContent: 'Content 2', documentId: 'doc1', pageNumber: 1, sectionHeader: 'B' },
      { id: '1', rank: 0.9, rawContent: 'Content 1', documentId: 'doc1', pageNumber: 1, sectionHeader: 'A' },
      { id: '4', rank: 0.8, rawContent: 'Content 4', documentId: 'doc1', pageNumber: 1, sectionHeader: 'D' }
    ]

    const fused = WidgetService.applyRRF(dense, lexical, 60)

    // Expected scores:
    // id '1': rank 1 in dense (1/61), rank 2 in lexical (1/62) = 0.016393 + 0.016129 = 0.032522
    // id '2': rank 2 in dense (1/62), rank 1 in lexical (1/61) = 0.016129 + 0.016393 = 0.032522
    // id '3': rank 3 in dense (1/63) = 0.015873
    // id '4': rank 3 in lexical (1/63) = 0.015873

    expect(fused.length).toBe(4)
    expect(['1', '2']).toContain(fused[0].id)
    expect(['1', '2']).toContain(fused[1].id)

    expect(fused[0].rrfScore).toBeCloseTo(0.03252, 5)
    expect(fused[1].rrfScore).toBeCloseTo(0.03252, 5)
    expect(fused[2].rrfScore).toBeCloseTo(0.01587, 5)
    expect(fused[3].rrfScore).toBeCloseTo(0.01587, 5)
  })
})
