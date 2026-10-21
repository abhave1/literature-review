import { BOTS, isInternalRoute } from './access';
import type { AdminSnapshot } from './admin-types';

const byText = <T,>(text: (item: T) => string) => (items: T[] | undefined) =>
  items && [...items].sort((a, b) => text(a).localeCompare(text(b), 'en', { sensitivity: 'base' }));
const byName = byText<{ name: string }>(item => item.name);

// Works before and after migration 010, so the local UI can be reviewed first.
// UUID assignments stay unchanged; internal routes are controlled by role.
// Lists are sorted here so the admin UI never depends on database row order.
export function normalizeBotCatalog(snapshot: AdminSnapshot): AdminSnapshot {
  return {
    ...snapshot,
    users: byText<AdminSnapshot['users'][number]>(user => user.email ?? user.id)(snapshot.users)!,
    projects: byName(snapshot.projects) as AdminSnapshot['projects'],
    features: byName(snapshot.features) as AdminSnapshot['features'],
    bots: byName(snapshot.bots?.filter(bot => !isInternalRoute(bot.key)).map(bot => ({
      ...bot,
      name: BOTS.find(definition => definition.id === bot.key)?.name ?? bot.name,
    }))) as AdminSnapshot['bots'],
  };
}
