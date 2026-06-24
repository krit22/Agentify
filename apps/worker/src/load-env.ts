import dotenv from 'dotenv'
import path from 'path'

// Resolve environment variables BEFORE loading other packages to prevent ESM lifecycle race conditions
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
