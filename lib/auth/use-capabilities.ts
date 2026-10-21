'use client';
import { useEffect, useState } from 'react';
import type { BotId } from './access';
const NONE = { canManagePrompts: false, canUpload: false };
export function useCapabilities(bot: BotId) {
  const [capabilities, setCapabilities] = useState(NONE);
  useEffect(() => {
    const controller = new AbortController();
    setCapabilities(NONE);
    fetch(`/api/capabilities?bot=${encodeURIComponent(bot)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Access unavailable'); return response.json(); })
      .then(data => setCapabilities({ canManagePrompts: data.canManagePrompts === true, canUpload: data.canUpload === true }))
      .catch(() => { if (!controller.signal.aborted) setCapabilities(NONE); });
    return () => controller.abort();
  }, [bot]);
  return capabilities;
}
