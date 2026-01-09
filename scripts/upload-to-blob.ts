import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

// Configuration
const MAX_CONCURRENT = 20; // Number of parallel uploads
const DEFAULT_BLOB_FOLDER = 'mxml-pdfs'; // Default destination folder

async function uploadToBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const LOCAL_FOLDER_PATH = process.argv[2];
  const BLOB_FOLDER = (process.argv[3] || DEFAULT_BLOB_FOLDER).replace(/\/$/, ''); // Remove trailing slash
  const concurrency = parseInt(process.argv[4]) || MAX_CONCURRENT;

  if (!LOCAL_FOLDER_PATH) {
    console.error('Usage: npx tsx scripts/upload-to-blob.ts <local-folder> [blob-folder] [concurrency]');
    console.error('');
    console.error('Arguments:');
    console.error('  <local-folder>   Path to folder containing PDFs');
    console.error('  [blob-folder]    Destination folder in blob storage (default: mxml-pdfs)');
    console.error('  [concurrency]    Number of parallel uploads (default: 20)');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs mxml-pdfs/2024');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs project-a/papers 10');
    process.exit(1);
  }

  if (!fs.existsSync(LOCAL_FOLDER_PATH)) {
    console.error(`Error: Folder not found: ${LOCAL_FOLDER_PATH}`);
    process.exit(1);
  }

  const files = fs.readdirSync(LOCAL_FOLDER_PATH)
    .filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log(`Found ${files.length} PDFs to upload`);
  console.log(`  Source: ${LOCAL_FOLDER_PATH}`);
  console.log(`  Destination: ${BLOB_FOLDER}/`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log('');

  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;
  const startTime = Date.now();

  // Upload a single file
  const uploadFile = async (fileName: string): Promise<boolean> => {
    const filePath = path.join(LOCAL_FOLDER_PATH, fileName);
    const fileBuffer = fs.readFileSync(filePath);

    try {
      await put(`${BLOB_FOLDER}/${fileName}`, fileBuffer, {
        access: 'public',
        token: token,
        contentType: 'application/pdf'
      });
      return true;
    } catch (err) {
      console.error(`✗ Failed: ${fileName} - ${err}`);
      return false;
    }
  };

  // Process files in parallel batches
  const processInParallel = async () => {
    const queue = [...files];
    const inProgress = new Set<string>();

    const updateProgress = () => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (completedCount / parseFloat(elapsed)).toFixed(1);
      process.stdout.write(
        `\r[${completedCount}/${files.length}] ✓ ${successCount} ✗ ${failCount} | ${elapsed}s | ${rate}/s | Active: ${inProgress.size}`
      );
    };

    const runNext = async (): Promise<void> => {
      if (queue.length === 0) return;

      const fileName = queue.shift()!;
      inProgress.add(fileName);
      updateProgress();

      const success = await uploadFile(fileName);

      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      completedCount++;
      inProgress.delete(fileName);
      updateProgress();

      // Process next file
      await runNext();
    };

    // Start concurrent workers
    const workers = Array(Math.min(concurrency, files.length))
      .fill(null)
      .map(() => runNext());

    await Promise.all(workers);
  };

  await processInParallel();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n');
  console.log('-------------------');
  console.log(`Upload Complete in ${totalTime}s`);
  console.log(`✓ Success: ${successCount}`);
  console.log(`✗ Failed: ${failCount}`);
  console.log(`Rate: ${(successCount / parseFloat(totalTime)).toFixed(1)} files/sec`);
}

uploadToBlob().catch(console.error);
