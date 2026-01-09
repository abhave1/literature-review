import { list, del } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

const MAX_CONCURRENT = 20;

async function deleteFromBlob() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const command = process.argv[2];

  if (!command) {
    console.log(`
Usage:
  npx tsx scripts/delete-from-blob.ts <command> [options]

Commands:
  --all                     Delete ALL files in mxml-pdfs/ (dangerous!)
  --prefix <prefix>         Delete files matching prefix (e.g., "mxml-pdfs/2024_")
  --files <file1,file2,...> Delete specific files by name
  --from-folder <path>      Delete blob files that match names in local folder
  --list                    List all files (no deletion)
  --dry-run                 Show what would be deleted without deleting

Examples:
  npx tsx scripts/delete-from-blob.ts --list
  npx tsx scripts/delete-from-blob.ts --prefix mxml-pdfs/ --dry-run
  npx tsx scripts/delete-from-blob.ts --prefix mxml-pdfs/old_
  npx tsx scripts/delete-from-blob.ts --files paper1.pdf,paper2.pdf
  npx tsx scripts/delete-from-blob.ts --from-folder ~/Downloads/to-delete/
  npx tsx scripts/delete-from-blob.ts --all
`);
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');

  // List all files
  if (command === '--list') {
    console.log('Fetching all files from blob storage...\n');
    const files = await listAllBlobs(token);
    console.log(`Found ${files.length} files:\n`);
    files.forEach((f, i) => {
      console.log(`${i + 1}. ${f.pathname} (${(f.size / 1024).toFixed(1)} KB)`);
    });
    return;
  }

  // Delete all
  if (command === '--all') {
    if (!dryRun) {
      console.log('\n⚠️  WARNING: This will delete ALL files in mxml-pdfs/');
      console.log('Run with --dry-run first to see what will be deleted.\n');
      console.log('To confirm, type "DELETE ALL" and press Enter:');

      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

      const answer = await new Promise<string>(resolve => {
        rl.question('> ', resolve);
      });
      rl.close();

      if (answer !== 'DELETE ALL') {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    const files = await listAllBlobs(token, 'mxml-pdfs/');
    await deleteFiles(files, token, dryRun);
    return;
  }

  // Delete by prefix
  if (command === '--prefix') {
    const prefix = process.argv[3];
    if (!prefix) {
      console.error('Error: Please provide a prefix');
      process.exit(1);
    }

    console.log(`Fetching files with prefix: ${prefix}`);
    const files = await listAllBlobs(token, prefix);
    await deleteFiles(files, token, dryRun);
    return;
  }

  // Delete specific files
  if (command === '--files') {
    const fileList = process.argv[3];
    if (!fileList) {
      console.error('Error: Please provide comma-separated file names');
      process.exit(1);
    }

    const fileNames = fileList.split(',').map(f => f.trim());
    console.log(`Looking for ${fileNames.length} specific files...`);

    const allFiles = await listAllBlobs(token, 'mxml-pdfs/');
    const filesToDelete = allFiles.filter(f =>
      fileNames.some(name => f.pathname.endsWith(name))
    );

    if (filesToDelete.length === 0) {
      console.log('No matching files found.');
      return;
    }

    await deleteFiles(filesToDelete, token, dryRun);
    return;
  }

  // Delete files matching local folder
  if (command === '--from-folder') {
    const folderPath = process.argv[3];
    if (!folderPath) {
      console.error('Error: Please provide a folder path');
      process.exit(1);
    }

    if (!fs.existsSync(folderPath)) {
      console.error(`Error: Folder not found: ${folderPath}`);
      process.exit(1);
    }

    const localFiles = fs.readdirSync(folderPath)
      .filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`Found ${localFiles.length} PDFs in local folder`);
    console.log('Matching against blob storage...');

    const allBlobs = await listAllBlobs(token, 'mxml-pdfs/');
    const filesToDelete = allBlobs.filter(blob =>
      localFiles.some(local => blob.pathname.endsWith(local))
    );

    if (filesToDelete.length === 0) {
      console.log('No matching files found in blob storage.');
      return;
    }

    await deleteFiles(filesToDelete, token, dryRun);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

async function listAllBlobs(token: string, prefix?: string) {
  const allBlobs: any[] = [];
  let cursor: string | undefined;

  do {
    const response = await list({
      prefix,
      limit: 1000,
      cursor,
      token,
    });

    allBlobs.push(...response.blobs);
    cursor = response.cursor;
  } while (cursor);

  return allBlobs;
}

async function deleteFiles(files: any[], token: string, dryRun: boolean) {
  console.log(`\n${dryRun ? '[DRY RUN] Would delete' : 'Deleting'} ${files.length} files...\n`);

  if (dryRun) {
    files.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.pathname}`);
    });
    console.log(`\n[DRY RUN] No files were deleted. Remove --dry-run to delete.`);
    return;
  }

  let deletedCount = 0;
  let failedCount = 0;
  const startTime = Date.now();

  // Process in parallel batches
  const queue = [...files];

  const deleteOne = async (file: any): Promise<boolean> => {
    try {
      await del(file.url, { token });
      return true;
    } catch (err) {
      console.error(`✗ Failed to delete ${file.pathname}: ${err}`);
      return false;
    }
  };

  const updateProgress = () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const completed = deletedCount + failedCount;
    process.stdout.write(
      `\r[${completed}/${files.length}] ✓ ${deletedCount} deleted, ✗ ${failedCount} failed | ${elapsed}s`
    );
  };

  // Worker function
  const runNext = async (): Promise<void> => {
    while (queue.length > 0) {
      const file = queue.shift()!;
      const success = await deleteOne(file);

      if (success) {
        deletedCount++;
      } else {
        failedCount++;
      }

      updateProgress();
    }
  };

  // Start concurrent workers
  const workers = Array(Math.min(MAX_CONCURRENT, files.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n\n-------------------');
  console.log(`Delete Complete in ${totalTime}s`);
  console.log(`✓ Deleted: ${deletedCount}`);
  console.log(`✗ Failed: ${failedCount}`);
}

deleteFromBlob().catch(console.error);
