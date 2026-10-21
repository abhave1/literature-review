import 'server-only';
import { list } from '@vercel/blob';
import { DEFAULT_MXML_SYSTEM_PROMPT, DEFAULT_ASPECTS, DEFAULT_ICAP_SYSTEM_PROMPT, DEFAULT_MXML_OPEN_SYSTEM_PROMPT, DEFAULT_OPEN_ASPECTS, DEFAULT_CSCL_CLOSE_SYSTEM_PROMPT, DEFAULT_CSCL_OPEN_SYSTEM_PROMPT } from '@/lib/prompts/default-mxml-prompt';
// Blob paths for storing prompt configs
const PROMPT_BLOB_PATH = 'config/mxml-prompt.json';
const ICAP_PROMPT_BLOB_PATH = 'config/icap-prompt.json';

export function getConfigForMode(mode: string) {
  if (mode === 'mxml4-internal') {
    return { blobPath: 'config/mxml4-internal-prompt.json', defaultPrompt: DEFAULT_MXML_SYSTEM_PROMPT, defaultAspects: DEFAULT_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
  }
  if (mode === 'mxml4-open-internal') {
    return { blobPath: 'config/mxml4-open-internal-prompt.json', defaultPrompt: DEFAULT_MXML_OPEN_SYSTEM_PROMPT, defaultAspects: DEFAULT_OPEN_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
  }
  // MxML modes use BLOB_MXML_READ_WRITE_TOKEN (mxml-store)
  // ICAP mode uses BLOB_READ_WRITE_TOKEN (icap store)
  if (mode === 'icap') {
    return { blobPath: ICAP_PROMPT_BLOB_PATH, defaultPrompt: DEFAULT_ICAP_SYSTEM_PROMPT, defaultAspects: '', token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  if (mode === 'mxml4') {
    return { blobPath: 'config/mxml4-prompt.json', defaultPrompt: DEFAULT_MXML_SYSTEM_PROMPT, defaultAspects: DEFAULT_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
  }
  if (mode === 'mxml4-open') {
    return { blobPath: 'config/mxml4-open-prompt.json', defaultPrompt: DEFAULT_MXML_OPEN_SYSTEM_PROMPT, defaultAspects: DEFAULT_OPEN_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
  }
  if (mode === 'cscl-close') {
    return { blobPath: 'config/cscl-close-prompt.json', defaultPrompt: DEFAULT_CSCL_CLOSE_SYSTEM_PROMPT, defaultAspects: DEFAULT_OPEN_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
  }
  if (mode === 'cscl-open') {
    return { blobPath: 'config/cscl-open-prompt.json', defaultPrompt: DEFAULT_CSCL_OPEN_SYSTEM_PROMPT, defaultAspects: DEFAULT_OPEN_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
  }
  return { blobPath: PROMPT_BLOB_PATH, defaultPrompt: DEFAULT_MXML_SYSTEM_PROMPT, defaultAspects: DEFAULT_ASPECTS, token: process.env.BLOB_MXML_READ_WRITE_TOKEN };
}

export interface SavedPrompt {
  systemPrompt: string;
  ratedAspects: string;
  updatedAt: string;
}


export async function loadPrompt(mode: string) {
  const { blobPath, defaultPrompt, defaultAspects, token } = getConfigForMode(mode);
  const defaults = { systemPrompt: defaultPrompt, ratedAspects: defaultAspects, isDefault: true, updatedAt: undefined as string | undefined };
  if (!token) return defaults;
  const { blobs } = await list({ prefix: 'config/', token });
  const blob = blobs.find(item => item.pathname === blobPath) ??
    (mode.endsWith('-internal') ? blobs.find(item => item.pathname === getConfigForMode(mode.replace(/-internal$/, '')).blobPath) : undefined);
  if (!blob) return defaults;
  const response = await fetch(blob.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load prompt configuration');
  const saved: SavedPrompt = await response.json();
  return { systemPrompt: saved.systemPrompt || defaultPrompt, ratedAspects: saved.ratedAspects ?? defaultAspects, isDefault: false, updatedAt: saved.updatedAt };
}
