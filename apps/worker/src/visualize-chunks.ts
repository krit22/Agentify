import fs from 'fs'
import path from 'path'
import axios from 'axios'
import FormData from 'form-data'
import dotenv from 'dotenv'
import { ChunkerService } from './services/chunker.js'
import type { UnstructuredElement } from './services/parser.js'

// Load environment variables from apps/api/.env or current worker directory
dotenv.config({ path: path.resolve(process.cwd(), '../api/.env') })
dotenv.config()

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Error: Please provide the path to a local document file (e.g. PDF, TXT, MD, DOCX).')
    console.log('Usage: pnpm --filter worker exec tsx src/visualize-chunks.ts <file-path>')
    process.exit(1)
  }

  const filePath = path.resolve(args[0])
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File does not exist at ${filePath}`)
    process.exit(1)
  }

  const fileName = path.basename(filePath)
  console.log(`\n📖 [VISUALIZER] Processing local file: ${fileName}`)
  const fileBuffer = fs.readFileSync(filePath)

  let elements: UnstructuredElement[] = []

  const lowercaseName = fileName.toLowerCase()
  if (lowercaseName.endsWith('.txt') || lowercaseName.endsWith('.md')) {
    console.log(`[PARSER] Local bypass: Segmenting plain text/markdown file.`)
    const textContent = fileBuffer.toString('utf-8')
    elements = [
      {
        type: 'NarrativeText',
        text: textContent,
        element_id: 'local-id',
        metadata: {
          page_number: 1,
          section_header: 'General',
        },
      },
    ]
  } else {
    const apiUrl = process.env.UNSTRUCTURED_API_URL || 'https://api.unstructured.io/general/v0/general'
    const apiKey = process.env.UNSTRUCTURED_API_KEY

    if (!apiKey) {
      console.error('Error: UNSTRUCTURED_API_KEY is not defined in your environment/env files.')
      process.exit(1)
    }

    console.log(`[PARSER] Submitting raw binary to Unstructured.io API at: ${apiUrl}`)
    const form = new FormData()
    form.append('files', fileBuffer, {
      filename: fileName,
      contentType: lowercaseName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
    })
    form.append('strategy', 'hi_res')

    try {
      const response = await axios.post<UnstructuredElement[]>(apiUrl, form, {
        headers: {
          'unstructured-api-key': apiKey,
          ...form.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000,
      })
      elements = response.data
      console.log(`[PARSER] Unstructured.io returned ${elements.length} structural elements.`)
    } catch (err: any) {
      console.error('Failed to parse document via Unstructured API:', err.message)
      if (err.response) {
        console.error('API Response Error:', err.response.data?.toString())
      }
      process.exit(1)
    }
  }

  console.log('\n--- 1. UNSTRUCTURED.IO EXTRACTED ELEMENTS ---')
  elements.forEach((el, idx) => {
    console.log(`[Element ${idx + 1}] Type: ${el.type.padEnd(15)} | Page: ${(el.metadata.page_number || 1).toString().padEnd(2)} | Text: "${el.text.trim().slice(0, 80).replace(/\n/g, ' ')}${el.text.length > 80 ? '...' : ''}"`)
  })

  console.log('\n--- 2. CHUNKER SEMANTIC SEGMENTS (Preserving Headings) ---')
  const chunks = ChunkerService.chunkElements(elements)
  chunks.forEach((c, idx) => {
    console.log(`\n======================================================`)
    console.log(`📦 CHUNK #${idx + 1}`)
    console.log(`------------------------------------------------------`)
    console.log(`📄 Page Number:    ${c.pageNumber || 'N/A'}`)
    console.log(`🏷️  Section Header:  ${c.sectionHeader || 'None'}`)
    console.log(`📏 Content Size:   ${c.rawContent.length} characters`)
    console.log(`------------------------------------------------------`)
    console.log(c.rawContent.trim().slice(0, 400))
    if (c.rawContent.length > 400) {
      console.log('\n... [Content Truncated in Visualization] ...')
    }
    console.log(`======================================================`)
  })
}

main().catch((err) => {
  console.error('Visualizer crash:', err)
})
