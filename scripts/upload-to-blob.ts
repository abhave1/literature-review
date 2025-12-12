import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

// You must set this environment variable!
// BLOB_READ_WRITE_TOKEN=...

async function uploadToBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  // CHANGE THIS PATH to your local folder with 152 PDFs
  // Example: '/Users/jdoe/Google Drive/MxML PDFs'
  const LOCAL_FOLDER_PATH = process.argv[2];

  if (!LOCAL_FOLDER_PATH) {
    console.error('Usage: ts-node scripts/upload-to-blob.ts <path-to-pdf-folder>');
    process.exit(1);
  }

  if (!fs.existsSync(LOCAL_FOLDER_PATH)) {
    console.error(`Error: Folder not found: ${LOCAL_FOLDER_PATH}`);
    process.exit(1);
  }

  const files = fs.readdirSync(LOCAL_FOLDER_PATH)
    .filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log(`Found ${files.length} PDFs to upload...`);

  let successCount = 0;
  let failCount = 0;

  for (const [index, fileName] of files.entries()) {
    const filePath = path.join(LOCAL_FOLDER_PATH, fileName);
    const fileBuffer = fs.readFileSync(filePath);

    try {
      console.log(`[${index + 1}/${files.length}] Uploading ${fileName}...`);
      
      const blob = await put(`mxml-pdfs/${fileName}`, fileBuffer, {
        access: 'public',
        token: token,
        contentType: 'application/pdf' // Explicitly set content type
      });

      console.log(`  -> Success: ${blob.url}`);
      successCount++;
    } catch (err) {
      console.error(`  -> Failed to upload ${fileName}:`, err);
      failCount++;
    }
  }

  console.log('-------------------');
  console.log(`Upload Complete.`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

uploadToBlob().catch(console.error);
