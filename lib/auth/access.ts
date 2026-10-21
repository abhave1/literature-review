// Page variants are routes, not separate database bot identities.
export const BOT_ROUTES = [
  { id: 'icap', path: '/', name: 'ICAP — external' },
  { id: 'icap-internal', path: '/internal', name: 'ICAP — internal' },
  { id: 'mxml1', path: '/mxml1', name: 'MxML1' },
  { id: 'screening', path: '/screening', name: 'MxML screening' },
  { id: 'mxml4', path: '/mxml4', name: 'MxML4 Yes/No — external' },
  { id: 'mxml4-internal', path: '/internal/mxml4', name: 'MxML4 Yes/No — internal' },
  { id: 'mxml4-open', path: '/mxml4-open', name: 'MxML4 open-ended — external' },
  { id: 'mxml4-open-internal', path: '/internal/mxml4-open', name: 'MxML4 open-ended — internal' },
  { id: 'cscl-screening', path: '/metadata-screening-cscl-prototype', name: 'CSCL screening' },
  { id: 'cscl-close', path: '/fulltext-analysis-close-ended-cscl-prototype', name: 'CSCL close-ended' },
  { id: 'cscl-open', path: '/fulltext-analysis-open-ended-cscl-prototype', name: 'CSCL open-ended' },
] as const;

// Existing API modes use route IDs to select the correct page variant.
export type BotId = typeof BOT_ROUTES[number]['id'];
export const BOTS = [
  { id: 'icap', path: '/', name: 'ICAP analysis' },
  { id: 'mxml1', path: '/mxml1', name: 'MxML1 analysis' },
  { id: 'screening', path: '/screening', name: 'Metadata screening' },
  { id: 'mxml4', path: '/mxml4', name: 'MxML4 Yes/No' },
  { id: 'mxml4-open', path: '/mxml4-open', name: 'MxML4 Open-ended' },
  { id: 'cscl-screening', path: '/metadata-screening-cscl-prototype', name: 'CSCL screening' },
  { id: 'cscl-close', path: '/fulltext-analysis-close-ended-cscl-prototype', name: 'CSCL closed-ended' },
  { id: 'cscl-open', path: '/fulltext-analysis-open-ended-cscl-prototype', name: 'CSCL open-ended' },
] as const;
export type CanonicalBotId = typeof BOTS[number]['id'];
const INTERNAL_ROUTES = {
  'icap-internal': 'icap',
  'mxml4-internal': 'mxml4',
  'mxml4-open-internal': 'mxml4-open',
} as const;
export function isInternalRoute(id: string): id is keyof typeof INTERNAL_ROUTES {
  return Object.hasOwn(INTERNAL_ROUTES, id);
}
export function canonicalBotId(id: BotId): CanonicalBotId {
  return isInternalRoute(id) ? INTERNAL_ROUTES[id] : id;
}
export function allowedRoutes(botKeys: readonly string[], isAdmin: boolean): string[] {
  return BOT_ROUTES.filter(route => botKeys.includes(canonicalBotId(route.id)) &&
    (!isInternalRoute(route.id) || isAdmin)).map(route => route.id);
}

export function botForPath(path: string): BotId | undefined {
  const normalized = path.replace(/\/+$/, '') || '/';
  if (normalized === '/mxml') return 'mxml1';
  return BOT_ROUTES.find(bot => bot.path === normalized)?.id;
}

export function safeNext(value: unknown): string {
  // Only known app pages are valid post-login destinations; no open redirects.
  return typeof value === 'string' && (value === '/bots' || value === '/admin' || botForPath(value))
    ? value : '/bots';
}

export function hasAccess(grants: readonly string[], bots: readonly BotId[]): boolean {
  return bots.some(bot => grants.includes(bot));
}

export function promptReaders(mode: string): BotId[] {
  if (mode === 'icap') return ['icap', 'icap-internal'];
  if (mode === 'mxml') return ['mxml1'];
  return BOT_ROUTES.some(bot => bot.id === mode) ? [mode as BotId] : [];
}

export function promptWriters(mode: string): BotId[] {
  return promptReaders(mode);
}

export function projectForBot(bot: string): string {
  if (bot.startsWith('icap')) return 'ICAP';
  if (bot.startsWith('cscl')) return 'CSCL';
  return 'MxML';
}

export function folderReaders(folder: string): BotId[] {
  switch (folder) {
    case 'icap': return ['icap', 'icap-internal'];
    case 'mxml': return ['mxml1'];
    case 'mxml4-measurement':
    case 'mxml4-nonmeasurement':
      return ['mxml4', 'mxml4-open', 'mxml4-internal', 'mxml4-open-internal'];
    case 'cscl-lab': return ['cscl-close', 'cscl-open'];
    default: return [];
  }
}

export function uploadWriters(prefix: string): BotId[] {
  switch (prefix) {
    case 'mxml-pdfs/': return ['mxml1'];
    case 'mxml4-measurement/':
    case 'mxml4-nonmeasurement/': return ['mxml4', 'mxml4-open', 'mxml4-internal', 'mxml4-open-internal'];
    case 'CSCL-lab/': return ['cscl-close', 'cscl-open'];
    default: return [];
  }
}
