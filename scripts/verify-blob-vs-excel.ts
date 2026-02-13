import { list } from '@vercel/blob';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

/**
 * Normalize a filename for comparison:
 * - trim, lowercase
 * - replace smart quotes / apostrophes / question marks with underscore
 * - collapse .pdf.pdf → .pdf
 * - ensure .pdf extension
 */
function normalizeFilename(filename: string): string {
  let n = filename.trim().toLowerCase();
  n = n.replace(/[\u2018\u2019\u201C\u201D'`?]/g, '_');
  n = n.replace(/\.pdf\.pdf$/i, '.pdf');
  if (!n.endsWith('.pdf')) n += '.pdf';
  return n;
}

/** Known aliases for the filename column */
const FILENAME_ALIASES = [
  'filename in ai bot',
  'filename',
  'file name',
  'file_name',
  'pdf filename',
  'pdf_filename',
  'pdf file',
];

async function listAllBlobs(token: string, prefix: string) {
  const blobs: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await list({ prefix, limit: 1000, cursor, token });
    blobs.push(...response.blobs);
    cursor = response.cursor;
  } while (cursor);
  return blobs;
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Error: BLOB_READ_WRITE_TOKEN not set in .env.local');
    process.exit(1);
  }

  const excelPath = process.argv[2] || path.join(__dirname, '..', 'data', 'ICAP papers with metrics.xlsx');
  const prefix = process.argv[3] || 'icap-papers/';

  if (!fs.existsSync(excelPath)) {
    console.error(`Error: Excel file not found at ${excelPath}`);
    process.exit(1);
  }

  console.log('Verify Blob vs Excel');
  console.log('====================');
  console.log(`Excel : ${excelPath}`);
  console.log(`Prefix: ${prefix}\n`);

  // --- 1. Read Excel ---
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, string>[];

  const headers = Object.keys(rows[0] || {});
  const fnCol = headers.find(h => FILENAME_ALIASES.includes(h.toLowerCase().trim()));

  if (!fnCol) {
    console.error(`Error: Could not find filename column. Headers: ${headers.join(', ')}`);
    process.exit(1);
  }
  console.log(`Filename column: "${fnCol}"\n`);

  const excelFilenames = rows
    .map(r => String(r[fnCol] || '').trim())
    .filter(Boolean);

  const excelNormalized = new Map<string, string>(); // normalized → original
  for (const name of excelFilenames) {
    excelNormalized.set(normalizeFilename(name), name);
  }

  // --- 2. List Blob ---
  console.log('Fetching blob storage...');
  const blobs = await listAllBlobs(token, prefix);
  const blobNormalized = new Map<string, string>(); // normalized → pathname
  for (const b of blobs) {
    const basename = b.pathname.split('/').pop() || '';
    blobNormalized.set(normalizeFilename(basename), b.pathname);
  }

  // --- 3. Compare ---
  const inExcelNotBlob: string[] = [];
  const inBothFromExcel: string[] = [];

  for (const [norm, orig] of excelNormalized) {
    if (blobNormalized.has(norm)) {
      inBothFromExcel.push(orig);
    } else {
      inExcelNotBlob.push(orig);
    }
  }

  const inBlobNotExcel: string[] = [];
  for (const [norm, pathname] of blobNormalized) {
    if (!excelNormalized.has(norm)) {
      inBlobNotExcel.push(pathname);
    }
  }

  // --- 4. Report ---
  console.log('\n========== RESULTS ==========\n');
  console.log(`Excel rows with filename : ${excelFilenames.length}`);
  console.log(`Unique Excel filenames   : ${excelNormalized.size}`);
  console.log(`Blob files (${prefix})   : ${blobNormalized.size}`);
  console.log(`Matched                  : ${inBothFromExcel.length}`);
  console.log('');

  if (inExcelNotBlob.length === 0 && inBlobNotExcel.length === 0) {
    console.log('✓ Perfect match — every Excel file is in blob and vice versa.\n');
    return;
  }

  if (inExcelNotBlob.length > 0) {
    console.log(`✗ In Excel but NOT in blob (${inExcelNotBlob.length}):`);
    inExcelNotBlob.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log('');
  }

  if (inBlobNotExcel.length > 0) {
    console.log(`✗ In blob but NOT in Excel (${inBlobNotExcel.length}):`);
    inBlobNotExcel.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log('');
  }
}

main().catch(console.error);
