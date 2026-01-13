import { list, del } from '@vercel/blob';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MAX_CONCURRENT = 20;
const ALLOWED_YEARS = [2024, 2025, 2026];

function extractYear(filename: string): number | null {
  // Try multiple patterns to extract year from filename

  // Pattern 0: 3-digit year at start (e.g., "025_paper.pdf" -> 2025)
  const shortYearMatch = filename.match(/^(0\d{2})[_\-]/);
  if (shortYearMatch) {
    return parseInt('2' + shortYearMatch[1]); // Prepend "2" to make 2024, 2025, 2026
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

async function filterByYear() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const listOnly = process.argv.includes('--list');
  const prefix = process.argv.find((_, i, arr) => arr[i - 1] === '--prefix') || 'icap-papers/';

  console.log('Filter by Year Script');
  console.log('=====================');
  console.log(`Allowed years: ${ALLOWED_YEARS.join(', ')}`);
  console.log(`Prefix: ${prefix}`);
  console.log(`Mode: ${listOnly ? 'LIST ONLY' : dryRun ? 'DRY RUN' : 'DELETE'}`);
  console.log('');

  // Fetch all files
  console.log('Fetching files from blob storage...');
  const allFiles = await listAllBlobs(token, prefix);
  console.log(`Found ${allFiles.length} total files\n`);

  // Categorize files
  const toKeep: { file: any; year: number }[] = [];
  const toDelete: { file: any; year: number | null }[] = [];
  const noYear: { file: any }[] = [];

  for (const file of allFiles) {
    const filename = file.pathname.split('/').pop() || '';
    const year = extractYear(filename);

    if (year === null) {
      noYear.push({ file });
      toDelete.push({ file, year: null });
    } else if (ALLOWED_YEARS.includes(year)) {
      toKeep.push({ file, year });
    } else {
      toDelete.push({ file, year });
    }
  }

  // Summary
  console.log('=== Summary ===');
  console.log(`Files to KEEP (${ALLOWED_YEARS.join('/')}): ${toKeep.length}`);
  console.log(`Files to DELETE: ${toDelete.length}`);
  if (noYear.length > 0) {
    console.log(`  - No year detected: ${noYear.length}`);
  }
  console.log('');

  // Year breakdown for files to keep
  const keepByYear: Record<number, number> = {};
  for (const { year } of toKeep) {
    keepByYear[year] = (keepByYear[year] || 0) + 1;
  }
  console.log('Files to keep by year:');
  for (const year of ALLOWED_YEARS) {
    console.log(`  ${year}: ${keepByYear[year] || 0}`);
  }
  console.log('');

  // Year breakdown for files to delete
  const deleteByYear: Record<string, number> = {};
  for (const { year } of toDelete) {
    const key = year === null ? 'unknown' : year.toString();
    deleteByYear[key] = (deleteByYear[key] || 0) + 1;
  }
  console.log('Files to delete by year:');
  for (const [year, count] of Object.entries(deleteByYear).sort()) {
    console.log(`  ${year}: ${count}`);
  }
  console.log('');

  if (listOnly) {
    console.log('=== Files to DELETE ===');
    toDelete.forEach(({ file, year }, i) => {
      const filename = file.pathname.split('/').pop();
      console.log(`${i + 1}. [${year ?? 'no year'}] ${filename}`);
    });
    console.log('\n[LIST ONLY] No files were deleted.');
    return;
  }

  if (toDelete.length === 0) {
    console.log('No files to delete. All files are from allowed years.');
    return;
  }

  if (!dryRun) {
    console.log('\n⚠️  WARNING: This will permanently delete files!');
    console.log(`About to delete ${toDelete.length} files.`);
    console.log('Run with --dry-run first to see what will be deleted.\n');
    console.log('To confirm, type "DELETE" and press Enter:');

    const readline = await import('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const answer = await new Promise<string>(resolve => {
      rl.question('> ', resolve);
    });
    rl.close();

    if (answer !== 'DELETE') {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Delete files
  await deleteFiles(toDelete.map(d => d.file), token, dryRun);
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

  const queue = [...files];

  const deleteOne = async (file: any): Promise<boolean> => {
    try {
      await del(file.url, { token });
      return true;
    } catch (err) {
      console.error(`\n✗ Failed to delete ${file.pathname}: ${err}`);
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

filterByYear().catch(console.error);
