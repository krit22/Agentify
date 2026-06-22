import { createClient } from '@supabase/supabase-js'
import path from 'path'

let supabaseClient: any = null

/**
 * Lazily instantiates the Supabase client to avoid module-load environment race conditions.
 */
function getSupabaseClient() {
  if (supabaseClient) return supabaseClient

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your env.'
    )
  }

  supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  })
  return supabaseClient
}

/**
 * Storage Management Service
 * Handles uploading raw assets to Supabase Storage and generating download links.
 */
export class StorageService {
  /**
   * Uploads a file stream directly to Supabase Storage bucket and returns a signed retrieval URL.
   */
  public static async saveFile(
    file: File,
    documentId: string
  ): Promise<{ fileUrl: string; fileSize: number; extension: string }> {
    // 1. Resolve environment configuration states dynamically
    const client = getSupabaseClient()
    const supabaseBucket = process.env.SUPABASE_BUCKET || 'documents'

    // 2. Enforce file size check limit (10MB limit)
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_SIZE) {
      throw new Error('File size exceeds the 10MB limit.')
    }

    // 3. Validate file extension against approved whitelist
    const originalName = path.basename(file.name)
    const ext = path.extname(originalName).toLowerCase()
    const allowedExtensions = ['.pdf', '.docx', '.md', '.txt']
    if (!allowedExtensions.includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}`)
    }

    // 4. Generate secure storage path based on PostgreSQL documentId
    const secureFilename = `${documentId}${ext}`

    // Convert file representation to array buffer for Supabase REST engine
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 5. Upload file directly to Supabase Storage bucket bypassing local disk caches
    const { error } = await client.storage
      .from(supabaseBucket)
      .upload(secureFilename, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (error) {
      console.error('[SUPABASE STORAGE ERROR]', error)
      throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`)
    }

    // 6. Generate a signed retrieval URL pointer (valid for 24 hours) for background worker queue download
    const { data: signedData, error: signError } = await client.storage
      .from(supabaseBucket)
      .createSignedUrl(secureFilename, 60 * 60 * 24)

    if (signError || !signedData) {
      console.error('[SUPABASE SIGN URL ERROR]', signError)
      throw new Error(`Failed to generate signed download URL: ${signError?.message || 'unknown error'}`)
    }

    console.log(`[STORAGE] Uploaded file to Supabase bucket '${supabaseBucket}': ${secureFilename} (${file.size} bytes)`)

    return {
      fileUrl: signedData.signedUrl,
      fileSize: file.size,
      extension: ext,
    }
  }
}
