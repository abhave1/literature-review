'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import styles from './admin.module.css';

export default function UserDetailTabs({ access, usage, dirty, busy, initialTab = 'access' }: {
  access: ReactNode; usage: ReactNode; dirty: boolean; busy: boolean; initialTab?: 'access' | 'costs';
}) {
  const [tab, setTab] = useState<'access' | 'costs'>(initialTab);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return <>
    <div role="tablist" aria-label="Selected user details" className={styles.userTabs}>
      {(['access', 'costs'] as const).map((name, index) => <button key={name} type="button" role="tab"
        ref={element => { buttons.current[index] = element; }}
        id={`${id}-${name}-tab`} aria-controls={`${id}-${name}-panel`} aria-selected={tab === name}
        tabIndex={tab === name ? 0 : -1} disabled={busy} onClick={() => setTab(name)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
          setTab(next === 0 ? 'access' : 'costs');
          buttons.current[next]?.focus();
        }}>
        {name === 'access' ? 'Access' : 'Costs'}{name === 'access' && dirty && <span>Unsaved</span>}
      </button>)}
    </div>
    {/* Keep access mounted so checking usage never discards permission drafts. */}
    <div role="tabpanel" id={`${id}-access-panel`} aria-labelledby={`${id}-access-tab`} hidden={tab !== 'access'} tabIndex={0}>{access}</div>
    <div role="tabpanel" id={`${id}-costs-panel`} aria-labelledby={`${id}-costs-tab`} hidden={tab !== 'costs'} tabIndex={0}>
      {tab === 'costs' && usage}
    </div>
  </>;
}
