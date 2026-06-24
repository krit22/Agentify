import axios from 'axios'
import FormData from 'form-data'
import crypto from 'crypto'

export interface UnstructuredElement {
  type: string
  text: string
  element_id: string
  metadata: {
    page_number?: number
    section_header?: string
    text_as_html?: string
    [key: string]: any
  }
}

/**
 * Layout Parsing Service
 * Coordinates sending files to Unstructured.io for layout-aware partitioning.
 */
export class ParserService {
  /**
   * Fetches document binary from signed URL and partitions layout structures using Unstructured.io API.
   */
  public static async partitionFile(fileUrl: string, fileName: string): Promise<UnstructuredElement[]> {
    const apiUrl = process.env.UNSTRUCTURED_API_URL || 'https://api.unstructured.io/general/v0/general'
    const apiKey = process.env.UNSTRUCTURED_API_KEY

    // 1. Download target file from Supabase Storage
    console.log(`[PARSER] Downloading document asset: ${fileName}`)
    const fileResponse = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 15000 // 15 seconds socket timeout limit
    })
    const fileBuffer = Buffer.from(fileResponse.data)

    // Local bypass for plain text and markdown documents
    const lowercaseName = fileName.toLowerCase()
    if (lowercaseName.endsWith('.txt') || lowercaseName.endsWith('.md')) {
      console.log(`[PARSER] Plain text/markdown detected. Bypassing Unstructured API for local parsing: ${fileName}`)
      const textContent = fileBuffer.toString('utf-8')
      return [
        {
          type: 'NarrativeText',
          text: textContent,
          element_id: crypto.randomUUID(),
          metadata: {
            page_number: 1,
            section_header: 'General',
          },
        },
      ]
    }

    if (!apiKey) {
      throw new Error('UNSTRUCTURED_API_KEY is not defined in the environment.')
    }

    // 2. Wrap file buffer inside multipart request body
    const form = new FormData()
    form.append('files', fileBuffer, {
      filename: fileName,
      contentType: (fileResponse.headers['content-type'] as string) || 'application/octet-stream',
    })
    form.append('strategy', 'hi_res') // hi_res model is needed to extract tables and OCR

    console.log(`[PARSER] Submitting raw binary to Unstructured.io API at: ${apiUrl}`)
    
    const response = await axios.post<UnstructuredElement[]>(apiUrl, form, {
      headers: {
        'unstructured-api-key': apiKey,
        ...form.getHeaders(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000 // Allow up to 60 seconds for parsing layout complexes
    })

    if (!Array.isArray(response.data)) {
      throw new Error('Received unexpected non-array response from Unstructured API.')
    }

    console.log(`[PARSER] Extraction complete. Successfully segmented ${response.data.length} structural elements.`)
    return response.data
  }
}
