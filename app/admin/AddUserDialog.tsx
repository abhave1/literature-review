'use client';
import { useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import TextField from '@/components/ui/TextField';

export default function AddUserDialog({ onClose, onAdded }: {onClose:()=>void;onAdded:(userId:string,existing:boolean)=>Promise<void>}) {
  const [email,setEmail] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/users', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not add user.');
      try { await onAdded(result.userId,result.existing); }
      catch { throw new Error('The account is available, but the list could not refresh. Close this form and reload the page.'); }
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Could not add user.');setBusy(false);}
  }
  return <Modal title="Add a user" description="Create an account, then choose their access." busy={busy} onClose={onClose} onSubmit={submit}
    icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>}
    footer={<><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Adding user…' : 'Add user'}</Button></>}>
    <TextField label="Google account email" autoFocus type="email" autoComplete="off" placeholder="name@university.edu" required maxLength={254} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/>
    <p className="text-[13px] leading-relaxed text-gray-500">They’ll sign in with Google using this email. No invitation email is sent. Projects and bots stay blocked until you assign them.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">{error}</p>}
  </Modal>;
}
