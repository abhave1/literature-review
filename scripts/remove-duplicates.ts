import { list, del } from '@vercel/blob';
import * as dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

const MAX_CONCURRENT = 20;

async function removeDuplicates() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const prefix = process.argv[2] || 'icap-papers/';
  const dryRun = process.argv.includes('--dry-run');

  console.log('Remove Duplicates Script');
  console.log('========================');
  console.log(`  Prefix: ${prefix}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log('');

  console.log('Fetching all files...');
  const allBlobs = await listAllBlobs(token, prefix);
  console.log(`Found ${allBlobs.length} total files\n`);

  // Group files by their base filename (without the random hash Vercel adds)
  // Vercel blob URLs look like: prefix/filename.pdf or prefix/filename-randomhash.pdf
  const fileGroups = new Map<string, typeof allBlobs>();

  for (const blob of allBlobs) {
    // Extract just the filename from the pathname
    const fullPath = blob.pathname;
    const fileName = fullPath.split('/').pop() || fullPath;

    // Try to extract base name - Vercel sometimes adds hashes
    // Pattern: "name.pdf" or "name-abc123.pdf" where abc123 is a hash
    // We'll group by the original filename if we can detect it

    // First, let's just group by exact filename to find exact duplicates
    if (!fileGroups.has(fileName)) {
      fileGroups.set(fileName, []);
    }
    fileGroups.get(fileName)!.push(blob);
  }

  // Find groups with duplicates (same exact filename uploaded multiple times)
  // These will have different URLs but same pathname
  const exactDuplicates: typeof allBlobs = [];

  // Also check for files that might be duplicates based on similar names
  // Group by normalized name (lowercase, remove common suffixes)
  const normalizedGroups = new Map<string, typeof allBlobs>();

  for (const blob of allBlobs) {
    const fileName = blob.pathname.split('/').pop() || blob.pathname;
    // Normalize: lowercase and remove potential duplicate markers like (1), _copy, etc.
    const normalized = fileName
      .toLowerCase()
      .replace(/[\s_-]?\(\d+\)\.pdf$/i, '.pdf')  // Remove (1), (2), etc.
      .replace(/[\s_-]?copy[\s_-]?\d*\.pdf$/i, '.pdf')  // Remove "copy", "copy 2", etc.
      .replace(/[\s_-]?\d+\.pdf$/i, '.pdf');  // Remove trailing numbers before .pdf

    if (!normalizedGroups.has(normalized)) {
      normalizedGroups.set(normalized, []);
    }
    normalizedGroups.get(normalized)!.push(blob);
  }

  // Find duplicates - keep the oldest (first uploaded) or largest file
  const toDelete: typeof allBlobs = [];
  const duplicateSets: { keep: any; delete: any[] }[] = [];

  for (const [normalizedName, blobs] of normalizedGroups) {
    if (blobs.length > 1) {
      // Sort by uploadedAt (oldest first) then by size (largest first)
      blobs.sort((a, b) => {
        const dateA = new Date(a.uploadedAt).getTime();
        const dateB = new Date(b.uploadedAt).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return b.size - a.size;
      });

      const keep = blobs[0];
      const dupes = blobs.slice(1);

      duplicateSets.push({ keep, delete: dupes });
      toDelete.push(...dupes);
    }
  }

  if (duplicateSets.length === 0) {
    console.log('No duplicates found!');
    return;
  }

  console.log(`Found ${duplicateSets.length} sets of duplicates (${toDelete.length} files to remove)\n`);

  // Show duplicate sets
  for (const set of duplicateSets) {
    console.log(`\n📁 Keeping: ${set.keep.pathname}`);
    console.log(`   Size: ${(set.keep.size / 1024).toFixed(1)} KB | Uploaded: ${set.keep.uploadedAt}`);
    for (const dupe of set.delete) {
      console.log(`   ❌ Delete: ${dupe.pathname}`);
      console.log(`      Size: ${(dupe.size / 1024).toFixed(1)} KB | Uploaded: ${dupe.uploadedAt}`);
    }
  }

  const totalSavings = toDelete.reduce((sum, f) => sum + f.size, 0);
  console.log(`\n💾 Total space to recover: ${(totalSavings / 1024 / 1024).toFixed(2)} MB`);

  if (dryRun) {
    console.log('\n[DRY RUN] No files were deleted. Remove --dry-run to delete.');
    return;
  }

  console.log('\nDeleting duplicates...');

  let deletedCount = 0;
  let failedCount = 0;
  const startTime = Date.now();

  const queue = [...toDelete];

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
      `\r[${completed}/${toDelete.length}] ✓ ${deletedCount} deleted, ✗ ${failedCount} failed | ${elapsed}s`
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

  const workers = Array(Math.min(MAX_CONCURRENT, toDelete.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n\n-------------------');
  console.log(`Delete Complete in ${totalTime}s`);
  console.log(`✓ Deleted: ${deletedCount}`);
  console.log(`✗ Failed: ${failedCount}`);
  console.log(`💾 Space recovered: ${(totalSavings / 1024 / 1024).toFixed(2)} MB`);
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

removeDuplicates().catch(console.error);
