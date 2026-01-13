import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

// Configuration
const MAX_CONCURRENT = 20; // Number of parallel uploads
const DEFAULT_BLOB_FOLDER = 'icap-papers'; // Default destination folder
const ALLOWED_YEARS = [2024, 2025, 2026];

function extractYear(filename: string): number | null {
  // Pattern 0: 3-digit year at start (e.g., "025_paper.pdf" -> 2025)
  const shortYearMatch = filename.match(/^(0\d{2})[_\-]/);
  if (shortYearMatch) {
    return parseInt('2' + shortYearMatch[1]);
  }

  // Pattern 1: Year at the start (e.g., "2024_paper.pdf")
  const startMatch = filename.match(/^(\d{4})[_\-]/);
  if (startMatch) {
    return parseInt(startMatch[1]);
  }

  // Pattern 2: Year anywhere in filename (e.g., "paper_2024.pdf", "conference2024_paper.pdf")
  const anyMatch = filename.match(/[_\-\s](\d{4})[_\-\s\.]/);
  if (anyMatch) {
    return parseInt(anyMatch[1]);
  }

  // Pattern 3: Year at end before extension (e.g., "paper2024.pdf")
  const endMatch = filename.match(/(\d{4})\.pdf$/i);
  if (endMatch) {
    return parseInt(endMatch[1]);
  }

  // Pattern 4: Any 4-digit number that looks like a year (2000-2030 range)
  const yearMatch = filename.match(/(20[0-3]\d)/);
  if (yearMatch) {
    return parseInt(yearMatch[1]);
  }

  return null;
}

async function uploadToBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const LOCAL_FOLDER_PATH = process.argv[2];
  const BLOB_FOLDER = (process.argv[3] || DEFAULT_BLOB_FOLDER).replace(/\/$/, ''); // Remove trailing slash
  const concurrency = parseInt(process.argv[4]) || MAX_CONCURRENT;
  const noFilter = process.argv.includes('--no-filter');

  if (!LOCAL_FOLDER_PATH) {
    console.error('Usage: npx tsx scripts/upload-to-blob.ts <local-folder> [blob-folder] [concurrency] [--no-filter]');
    console.error('');
    console.error('Arguments:');
    console.error('  <local-folder>   Path to folder containing PDFs');
    console.error('  [blob-folder]    Destination folder in blob storage (default: icap-papers)');
    console.error('  [concurrency]    Number of parallel uploads (default: 20)');
    console.error('  --no-filter      Skip year filtering (upload all PDFs)');
    console.error('');
    console.error(`By default, only uploads files from years: ${ALLOWED_YEARS.join(', ')}`);
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs icap-papers');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs icap-papers 10');
    console.error('  npx tsx scripts/upload-to-blob.ts ~/Downloads/pdfs icap-papers 20 --no-filter');
    process.exit(1);
  }

  if (!fs.existsSync(LOCAL_FOLDER_PATH)) {
    console.error(`Error: Folder not found: ${LOCAL_FOLDER_PATH}`);
    process.exit(1);
  }

  const allPdfs = fs.readdirSync(LOCAL_FOLDER_PATH)
    .filter(f => f.toLowerCase().endsWith('.pdf'));

  // Filter by year unless --no-filter is passed
  let files: string[];
  let skippedFiles: { name: string; year: number | null }[] = [];

  if (noFilter) {
    files = allPdfs;
  } else {
    files = [];
    for (const f of allPdfs) {
      const year = extractYear(f);
      if (year !== null && ALLOWED_YEARS.includes(year)) {
        files.push(f);
      } else {
        skippedFiles.push({ name: f, year });
      }
    }
  }

  console.log('Upload to Blob Script');
  console.log('=====================');
  console.log(`  Source: ${LOCAL_FOLDER_PATH}`);
  console.log(`  Destination: ${BLOB_FOLDER}/`);
  console.log(`  Concurrency: ${concurrency}`);
  console.log(`  Year filter: ${noFilter ? 'DISABLED' : ALLOWED_YEARS.join(', ')}`);
  console.log('');
  console.log(`Found ${allPdfs.length} PDFs in folder`);
  if (!noFilter) {
    console.log(`  Uploading: ${files.length} (matching ${ALLOWED_YEARS.join('/')})`);
    console.log(`  Skipping: ${skippedFiles.length} (wrong year or no year)`);

    if (skippedFiles.length > 0 && skippedFiles.length <= 20) {
      console.log('\n  Skipped files:');
      skippedFiles.forEach(({ name, year }) => {
        console.log(`    - [${year ?? 'no year'}] ${name}`);
      });
    } else if (skippedFiles.length > 20) {
      console.log(`\n  (${skippedFiles.length} files skipped - too many to list)`);
    }
  }
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
