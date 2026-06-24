import dotenv from 'dotenv'
import path from 'path'

// Load environment configurations dynamically based on the current process working directory
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
