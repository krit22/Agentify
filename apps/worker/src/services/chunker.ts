import type { UnstructuredElement } from './parser.js'

export interface DocumentChunkInput {
  pageNumber: number | null
  sectionHeader: string | null
  rawContent: string
}

/**
 * Smart Text Splitting Service
 * Enforces layout-aware dividing, preserving table structural scopes and section titles.
 */
export class ChunkerService {
  /**
   * Groups document elements into semantic layouts, keeping tables intact and splitting on header bounds.
   */
  public static chunkElements(elements: UnstructuredElement[]): DocumentChunkInput[] {
    const chunks: DocumentChunkInput[] = []
    
    let currentHeader: string | null = null
    let currentPage: number | null = null
    let currentSectionText: string[] = []
    let currentSectionLength = 0

    // Approximate token values based on standard 4-characters-per-token model
    const CHUNK_CHAR_LIMIT = 2000 // ~500 tokens
    const OVERLAP_CHAR_SIZE = 200 // ~50 tokens
    const TABLE_CHAR_LIMIT = 2800 // ~700 tokens

    const flushCurrentSection = () => {
      if (currentSectionText.length === 0) return
      
      const fullText = currentSectionText.join('\n\n')
      
      // If the heading section fits in one chunk, save it directly
      if (fullText.length <= CHUNK_CHAR_LIMIT) {
        chunks.push({
          pageNumber: currentPage,
          sectionHeader: currentHeader,
          rawContent: fullText,
        })
      } else {
        // Slice section using character-based sliding window splitter with overlaps
        let start = 0
        while (start < fullText.length) {
          const end = Math.min(start + CHUNK_CHAR_LIMIT, fullText.length)
          const slice = fullText.slice(start, end)
          chunks.push({
            pageNumber: currentPage,
            sectionHeader: currentHeader,
            rawContent: slice,
          })
          
          start += CHUNK_CHAR_LIMIT - OVERLAP_CHAR_SIZE
          if (start >= fullText.length || end === fullText.length) break
        }
      }
      
      currentSectionText = []
      currentSectionLength = 0
    }

    for (const element of elements) {
      // 1. Keep track of current page
      if (element.metadata.page_number) {
        currentPage = element.metadata.page_number
      }

      // 2. Tables are processed as atomic chunks
      if (element.type === 'Table') {
        flushCurrentSection()

        const tableHtml = element.metadata.text_as_html
        let tableContent = element.text || ''
        
        if (tableHtml) {
          const markdownTable = this.convertHtmlTableToMarkdown(tableHtml)
          if (markdownTable) {
            tableContent = markdownTable
          }
        }

        if (tableContent.length <= TABLE_CHAR_LIMIT) {
          // Keep table whole as a single chunk
          chunks.push({
            pageNumber: currentPage,
            sectionHeader: currentHeader,
            rawContent: tableContent,
          })
        } else {
          // Slide window split large tables
          let start = 0
          while (start < tableContent.length) {
            const end = Math.min(start + CHUNK_CHAR_LIMIT, tableContent.length)
            chunks.push({
              pageNumber: currentPage,
              sectionHeader: currentHeader,
              rawContent: tableContent.slice(start, end),
            })
            start += CHUNK_CHAR_LIMIT - OVERLAP_CHAR_SIZE
            if (start >= tableContent.length || end === tableContent.length) break
          }
        }
        continue
      }

      // 3. Header titles identify major section divisions
      const isHeader =
        element.type === 'Title' ||
        element.type === 'Header' ||
        element.type === 'Heading'
      
      if (isHeader) {
        flushCurrentSection()
        currentHeader = element.text
      }

      // 4. Combine standard paragraphs/narratives under same header context
      const cleanText = element.text ? element.text.trim() : ''
      if (!cleanText) continue

      // If adding this text causes overflow, flush the section and start a new one
      if (currentSectionLength + cleanText.length > CHUNK_CHAR_LIMIT && currentSectionLength > 0) {
        flushCurrentSection()
      }

      currentSectionText.push(cleanText)
      currentSectionLength += cleanText.length
    }

    // Flush any leftover elements
    flushCurrentSection()

    return chunks
  }

  /**
   * Helper utility converting HTML tables into clean Markdown tables.
   */
  private static convertHtmlTableToMarkdown(html: string): string {
    try {
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi

      const rows: string[][] = []
      let rowMatch
      while ((rowMatch = rowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1]
        const cells: string[] = []
        let cellMatch
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim()
          cells.push(cellText)
        }
        if (cells.length > 0) {
          rows.push(cells)
        }
      }

      if (rows.length === 0) return ''

      const markdownRows: string[] = []
      const header = rows[0]
      markdownRows.push('| ' + header.join(' | ') + ' |')
      markdownRows.push('| ' + header.map(() => '---').join(' | ') + ' |')

      for (let i = 1; i < rows.length; i++) {
        markdownRows.push('| ' + rows[i].join(' | ') + ' |')
      }

      return markdownRows.join('\n')
    } catch (e) {
      console.warn('[CHUNKER] Table HTML parsing failed, returning raw string', e)
      return ''
    }
  }
}
