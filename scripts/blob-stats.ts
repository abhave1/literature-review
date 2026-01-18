import { list } from '@vercel/blob';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function blobStats() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const prefix = process.argv[2] || undefined;
  const showFiles = process.argv.includes('--files');

  console.log('Blob Storage Stats');
  console.log('==================');
  if (prefix) console.log(`Prefix filter: ${prefix}`);
  console.log('');

  console.log('Fetching files...');

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

  // Group by folder
  const folders = new Map<string, { count: number; size: number }>();

  for (const blob of allBlobs) {
    const parts = blob.pathname.split('/');
    const folder = parts.length > 1 ? parts[0] + '/' : '(root)';

    if (!folders.has(folder)) {
      folders.set(folder, { count: 0, size: 0 });
    }
    const f = folders.get(folder)!;
    f.count++;
    f.size += blob.size;
  }

  const totalSize = allBlobs.reduce((sum, b) => sum + b.size, 0);

  console.log(`\nTotal: ${allBlobs.length} files | ${formatSize(totalSize)}\n`);

  // Sort folders by size descending
  const sortedFolders = [...folders.entries()].sort((a, b) => b[1].size - a[1].size);

  console.log('By folder:');
  console.log('-'.repeat(50));
  for (const [folder, stats] of sortedFolders) {
    const pct = ((stats.size / totalSize) * 100).toFixed(1);
    console.log(`  ${folder.padEnd(25)} ${String(stats.count).padStart(5)} files | ${formatSize(stats.size).padStart(10)} (${pct}%)`);
  }

  if (showFiles) {
    console.log('\n\nAll files:');
    console.log('-'.repeat(70));

    // Sort by size descending
    allBlobs.sort((a, b) => b.size - a.size);

    for (const blob of allBlobs) {
      console.log(`  ${formatSize(blob.size).padStart(10)}  ${blob.pathname}`);
    }
  } else {
    console.log('\n(Add --files to see individual files)');
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

blobStats().catch(console.error);
