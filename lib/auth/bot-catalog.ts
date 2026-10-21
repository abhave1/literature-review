import { BOTS, isInternalRoute } from './access';
import type { AdminSnapshot } from './admin-types';

// Works before and after migration 010, so the local UI can be reviewed first.
// UUID assignments stay unchanged; internal routes are controlled by role.
export function normalizeBotCatalog(snapshot: AdminSnapshot): AdminSnapshot {
  return {
    ...snapshot,
    bots: snapshot.bots.filter(bot => !isInternalRoute(bot.key)).map(bot => ({
      ...bot,
      name: BOTS.find(definition => definition.id === bot.key)?.name ?? bot.name,
    })),
  };
}
