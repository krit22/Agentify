import axios from 'axios'
import FormData from 'form-data'

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

    if (!apiKey) {
      throw new Error('UNSTRUCTURED_API_KEY is not defined in the environment.')
    }

    // 1. Download target file from Supabase Storage
    console.log(`[PARSER] Downloading document asset: ${fileName}`)
    const fileResponse = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 15000 // 15 seconds socket timeout limit
    })
    const fileBuffer = Buffer.from(fileResponse.data)

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
