import 'server-only';
import { list } from '@vercel/blob';
import { DEFAULT_RUBRICS, type ScreeningRubrics } from './default-rubrics';
import { DEFAULT_SCREENING_PROMPT_TEMPLATE } from './prompts';
export async function loadScreeningConfig() {
  const defaults = { rubrics: DEFAULT_RUBRICS, promptTemplate: DEFAULT_SCREENING_PROMPT_TEMPLATE, isDefault: true, updatedAt: undefined as string | undefined };
  const token = process.env.BLOB_MXML_READ_WRITE_TOKEN;
  if (!token) return defaults;
  const { blobs } = await list({ prefix: 'config/', token });
  const blob = blobs.find(item => item.pathname === 'config/screening-rubrics.json');
  if (!blob) return defaults;
  const response = await fetch(blob.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load screening configuration');
  const saved: { rubrics?: ScreeningRubrics; promptTemplate?: string; updatedAt?: string } = await response.json();
  return { rubrics: saved.rubrics ?? DEFAULT_RUBRICS, promptTemplate: saved.promptTemplate || DEFAULT_SCREENING_PROMPT_TEMPLATE, isDefault: false, updatedAt: saved.updatedAt };
}
