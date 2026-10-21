'use client';
import { useState, type FormEvent } from 'react';
import type { AdminSnapshot } from '@/lib/auth/admin-types';
import Modal, { ModalFacts } from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DeleteUserDialog({ user, impact, onClose, onDeleted }: {
  user: AdminSnapshot['users'][number];
  impact: { projects: number; bots: number; features: number };
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmed = !!user.email && email.trim().toLowerCase() === user.email.toLowerCase();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, confirmEmail: email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete user.');
      onDeleted(user.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete user.');
      setBusy(false);
    }
  }
  return <Modal title="Delete this user?" description={user.email} tone="danger" busy={busy} onClose={onClose} onSubmit={submit}
    icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>}
    footer={<><Button autoFocus disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" disabled={!confirmed || busy}>{busy ? 'Deleting…' : 'Delete permanently'}</Button></>}>
    <ModalFacts label="This permanently removes" rows={[
      ['Account', '1'],
      ['Project access', plural(impact.projects, 'project')],
      ['Bot grants', plural(impact.bots, 'bot')],
      ['Feature permissions', plural(impact.features, 'feature')],
    ]} note="Shared research files stay. If they sign in again, they start with no access." />
    <TextField label={<>Type <code className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] font-medium">{user.email}</code> to confirm</>}
      valid={confirmed} type="email" autoComplete="off" spellCheck={false} required maxLength={254} value={email} disabled={busy}
      onChange={event => setEmail(event.target.value)} aria-invalid={email.length > 0 && !confirmed} />
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">{error}</p>}
  </Modal>;
}
