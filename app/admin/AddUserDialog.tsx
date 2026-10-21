'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './admin.module.css';

export default function AddUserDialog({ onClose, onAdded }: {onClose:()=>void;onAdded:(userId:string,existing:boolean)=>Promise<void>}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [email,setEmail] = useState('');
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  useEffect(() => {dialog.current?.showModal();}, []);
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
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="add-user-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={submit}>
      <div className={styles.dialogHeader}><div><h2 id="add-user-title">Add a user</h2><p>Create an account, then choose their access.</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close add user">×</button></div>
      <label className={styles.emailField}>Google account email<input autoFocus type="email" autoComplete="off" placeholder="name@university.edu" required maxLength={254} value={email} disabled={busy} onChange={event=>setEmail(event.target.value)}/></label>
      <p className={styles.dialogHelp}>They’ll sign in with Google using this email. No invitation email is sent. Projects and bots stay blocked until you assign them.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.dialogActions}><button type="button" disabled={busy} className={styles.secondary} onClick={onClose}>Cancel</button><button type="submit" disabled={busy} className={styles.primary}>{busy ? 'Adding user…' : 'Add user'}</button></div>
    </form>
  </dialog>;
}
