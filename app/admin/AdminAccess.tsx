'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { AdminSnapshot } from '@/lib/auth/admin-types';
import { normalizeBotCatalog } from '@/lib/auth/bot-catalog';
import styles from './admin.module.css';
import AddUserDialog from './AddUserDialog';
import DeleteUserDialog from './DeleteUserDialog';
import Button from '@/components/ui/Button';

type User = AdminSnapshot['users'][number];
type Project = AdminSnapshot['projects'][number];
type ProjectFeature = AdminSnapshot['projectFeatures'][number] & Pick<AdminSnapshot['features'][number], 'code' | 'name' | 'description'>;
function projectFeatures(data: AdminSnapshot): ProjectFeature[] {
  return data.projectFeatures.flatMap(assignment => {
    const feature = data.features.find(item => item.id === assignment.feature_id);
    return feature ? [{ ...assignment, code: feature.code, name: feature.name, description: feature.description }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}
type Save = (payloads: object | object[]) => Promise<void>;
type Draft = { member: boolean; bots: string[]; permissions: string[] };
const flip = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
const same = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));
const roleLabel = (role: string | null) => role === 'admin' ? 'Admin' : role === 'external' ? 'External' : 'Unassigned';

function Icon({ name }: { name: 'people' | 'projects' | 'search' | 'lock' | 'back' | 'check' | 'trash' }) {
  const paths = {
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    projects: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    back: <path d="m12 5-7 7 7 7M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Switch({ checked, onChange, disabled, label }: {checked:boolean;onChange:()=>void;disabled?:boolean;label:string}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange} className={styles.switch} data-on={checked}><span/></button>;
}
function Badge({ children, tone = '' }: {children:ReactNode;tone?:string}) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}

export default function AdminAccess({ initial }: { initial: AdminSnapshot }) {
  const [data, setData] = useState(() => normalizeBotCatalog(initial));
  const [addingUser, setAddingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [view, setView] = useState<'users' | 'projects'>('users');
  const [userId, setUserId] = useState(initial.users[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const user = data.users.find(item => item.id === userId);
  const visibleUsers = data.users.filter(item => (item.email ?? item.id).toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (item.role ?? 'unassigned') === filter));
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  function navigate(action: () => void) {
    if (busy || (dirty && !window.confirm('Discard your unsaved permission changes?'))) return;
    setDirty(false); setError(''); setNotice(''); action();
  }
  async function userAdded(id: string, existing: boolean) {
    const response = await fetch('/api/admin/access', {cache:'no-store'});
    if (!response.ok) throw new Error('Refresh failed');
    setData(normalizeBotCatalog(await response.json())); setUserId(id); setQuery(''); setFilter('all');
    setRevision(value => value + 1); setDirty(false); setAddingUser(false);
    setNotice(existing ? 'This user already exists. Their current access is shown below.' : 'User added. Choose a project and assign their bot access.');
  }
  async function save(payloads: object | object[]) {
    setBusy(true); setError(''); setNotice('');
    let failure = '';
    // Saved one project at a time; stop at the first failure.
    for (const payload of ([] as object[]).concat(payloads)) {
      const response = await fetch('/api/admin/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null);
      if (!response?.ok) { failure = (await response?.json().catch(() => null))?.error || 'Could not save changes.'; break; }
    }
    // On failure keep the edits on screen so nothing is silently lost; saving again is safe
    // because each project save replaces that project's assignments.
    if (failure) { setError(`${failure.replace(/\.?$/, '.')} Your changes are still here; try saving again.`); setBusy(false); return; }
    try {
      const refreshed = await fetch('/api/admin/access', { cache: 'no-store' });
      if (!refreshed.ok) throw new Error();
      setData(normalizeBotCatalog(await refreshed.json())); setRevision(value => value + 1); setDirty(false);
      setNotice('Changes saved.');
    } catch { setError('Changes saved, but the view could not refresh. Reload before editing again.'); }
    setBusy(false);
  }
  function userDeleted(id: string) {
    setData(current => ({ ...current,
      users: current.users.filter(item => item.id !== id),
      memberships: current.memberships.filter(item => item.user_id !== id),
      grants: current.grants.filter(item => item.user_id !== id),
      permissions: current.permissions.filter(item => item.user_id !== id),
    }));
    setUserId(data.users.find(item => item.id !== id)?.id ?? '');
    setDeletingUser(null); setDirty(false); setError('');
    setRevision(value => value + 1); setNotice('User deleted. Their project, bot, and feature assignments have been removed.');
  }
  return <main className={styles.shell}>
    <aside className={styles.navigation}>
      <div className={styles.navTitle}><span className={styles.brandMark}>R</span><div>Research Bot<small>Administration</small></div></div>
      <nav aria-label="Administration">
        <button className={styles.navItem} data-active={view === 'users'} aria-current={view === 'users' ? 'page' : undefined} disabled={busy} onClick={() => {if (view !== 'users') navigate(() => setView('users'));}}><Icon name="people"/>People & access<span>{data.users.length}</span></button>
        <button className={styles.navItem} data-active={view === 'projects'} aria-current={view === 'projects' ? 'page' : undefined} disabled={busy} onClick={() => {if (view !== 'projects') navigate(() => setView('projects'));}}><Icon name="projects"/>Project features</button>
      </nav>
      <div className={styles.navBottom}><Link href="/bots" onClick={event => {if (dirty && !window.confirm('Discard your unsaved permission changes?')) event.preventDefault();}}><Icon name="back"/>Back to workspace</Link><p>Research Bot</p></div>
    </aside>
    <div className={styles.content}>
      <header className={styles.heading}><div><h1>{view === 'users' ? 'People & access' : 'Project features'}</h1><p>{view === 'users' ? 'Manage who can use each project, bot, and feature.' : 'Choose which features are available across each research project.'}</p></div><div className={styles.headerActions}><Badge tone="blue"><Icon name="lock"/>Admin workspace</Badge>{view === 'users' && <Button variant="primary" disabled={busy} onClick={() => navigate(() => {setRevision(value => value + 1);setAddingUser(true);})}>+ Add user</Button>}</div></header>
      {notice && <div className={styles.notice} role="status"><Icon name="check"/>{notice}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {view === 'users' ? <div className={styles.workspace}>
        <section className={styles.people} aria-label="People">
          <div className={styles.peopleHeader}><h2>People <span>{data.users.length}</span></h2><label className={styles.search}><Icon name="search"/><input aria-label="Search people by email" placeholder="Search by email" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter people by role" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All roles</option><option value="admin">Admins</option><option value="external">External users</option><option value="unassigned">Unassigned</option></select></div>
          <div className={styles.peopleList}>{visibleUsers.map(person => <button key={person.id} disabled={busy} className={styles.person} data-selected={userId === person.id} aria-pressed={userId === person.id} onClick={() => {if (userId !== person.id) navigate(() => setUserId(person.id));}}><span className={styles.avatar}>{(person.email ?? '?')[0].toUpperCase()}</span><span className={styles.personText}><strong>{person.email ?? 'Email unavailable'}</strong><small>{roleLabel(person.role)}{person.role === 'admin' ? ' · All projects' : ` · ${data.memberships.filter(item => item.user_id === person.id).length} projects`}</small></span></button>)}{!visibleUsers.length && <div className={styles.empty}>No matching users.<button onClick={() => {setQuery('');setFilter('all');}}>Clear filters</button></div>}</div>
          <div className={styles.listHelp}><Icon name="people"/><p>Add a user by email, then choose their projects and bots. Users who sign in also appear here.</p></div>
        </section>
        <section className={styles.details} aria-label="Selected user permissions">
          {user ? <><div className={styles.userHeader}><span className={`${styles.avatar} ${styles.largeAvatar}`}>{(user.email ?? '?')[0].toUpperCase()}</span><div><h2>{user.email ?? 'Email unavailable'}</h2><p>{user.role === 'admin' ? 'Access to all projects and bots' : user.role === 'external' ? 'Access is limited to your assignments' : 'No access assigned yet'}</p></div><div className={styles.userHeaderActions}><Badge tone={user.role === 'admin' ? 'blue' : ''}>{roleLabel(user.role)}</Badge>{user.role === 'admin'
              ? <span className={styles.protected} title="Admin accounts are protected from deletion."><Icon name="lock"/>Protected</span>
              : <Button size="sm" className="hover:enabled:border-red-300 hover:enabled:bg-red-50 hover:enabled:text-red-700" disabled={busy || !user.email} onClick={() => navigate(() => {setRevision(value => value + 1);setDeletingUser(user);})}><Icon name="trash"/>Delete user</Button>}</div></div>
            <UserAccess key={`${userId}:${revision}`} data={data} user={user} busy={busy} save={save} onDirty={setDirty}/>
          </> : <div className={styles.empty}>Users will appear after signing in with Google.</div>}
        </section>
      </div> : <div className={styles.settingsWorkspace}>
        <div className={styles.settingsIntro}><Icon name="projects"/><p>A project-wide switch controls availability for everyone. External users also need permission on their own account. Prompts are always restricted to admins.</p></div>
        {data.projects.map(item => <section className={styles.projectSettings} key={item.id}><div className={styles.projectHeading}><div className={styles.projectMark}>{item.name === 'MxML' ? 'Mx' : item.name.slice(0,2)}</div><div><h2>{item.name}</h2><p>{data.bots.filter(bot => bot.project_id === item.id).length} bots</p></div></div><AccessList bare rows={projectFeatures(data).filter(setting => setting.project_id === item.id).map(setting => ({id:`${setting.id}:${revision}`,title:setting.name,description:setting.description,
          control:<><span className={styles.settingState}>{setting.enabled ? 'Enabled' : 'Disabled'}</span><Switch checked={setting.enabled} onChange={()=>save({action:'project-feature',projectFeatureId:setting.id,enabled:!setting.enabled})} disabled={busy} label={`${setting.enabled ? 'Disable' : 'Enable'} ${setting.name} for ${item.name}`}/></>}))}/></section>)}
      </div>}
    </div>
    {addingUser && <AddUserDialog onClose={() => setAddingUser(false)} onAdded={userAdded}/>}
    {deletingUser && <DeleteUserDialog user={deletingUser} impact={{
      projects: data.memberships.filter(item => item.user_id === deletingUser.id).length,
      bots: data.grants.filter(item => item.user_id === deletingUser.id).length,
      features: data.permissions.filter(item => item.user_id === deletingUser.id && item.allowed).length,
    }} onClose={() => setDeletingUser(null)} onDeleted={userDeleted}/>}
  </main>;
}

// Every project for one user, all visible at once, with a single save for all edits.
function UserAccess({data,user,busy,save,onDirty}: {data:AdminSnapshot;user:User;busy:boolean;save:Save;onDirty:(dirty:boolean)=>void}) {
  const admin = user.role === 'admin';
  const features = projectFeatures(data);
  const saved = (projectId: string): Draft => ({
    member: data.memberships.some(row => row.user_id === user.id && row.project_id === projectId),
    bots: data.grants.filter(row => row.user_id === user.id && row.project_id === projectId).map(row => row.bot_id),
    permissions: data.permissions.filter(row => row.user_id === user.id && row.project_id === projectId && row.allowed).map(row => row.project_feature_id),
  });
  const savedAll = () => Object.fromEntries(data.projects.map(project => [project.id, saved(project.id)])) as Record<string, Draft>;
  const [drafts, setDrafts] = useState(savedAll);
  const isChanged = (id: string) => { const draft = drafts[id], original = saved(id); return draft.member !== original.member || !same(draft.bots, original.bots) || !same(draft.permissions, original.permissions); };
  const changed = admin ? [] : data.projects.filter(project => isChanged(project.id));
  const removing = changed.filter(project => !drafts[project.id].member && saved(project.id).member);
  useEffect(() => {onDirty(changed.length > 0);}, [changed.length, onDirty]);
  const update = (id: string, patch: Partial<Draft>) => setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  const payload = (project: Project) => {
    const draft = drafts[project.id];
    const settings = features.filter(setting => setting.project_id === project.id);
    return {action:'membership',userId:user.id,projectId:project.id,member:draft.member,botIds:draft.member?draft.bots:[],
      projectFeatureIds:draft.member?draft.permissions.filter(id=>settings.some(setting=>setting.id===id&&setting.enabled&&setting.code!=='prompt_access')):[]};
  };
  const names = (items: Project[]) => items.map(item => item.name).join(', ');
  return <>
    <div>{data.projects.map(project => {
      const draft = drafts[project.id];
      const member = admin || draft.member;
      const projectBots = data.bots.filter(bot => bot.project_id === project.id);
      const settings = features.filter(setting => setting.project_id === project.id);
      const botIds = admin ? projectBots.map(bot => bot.id) : draft.bots;
      const allBots = projectBots.every(bot => botIds.includes(bot.id));
      const featureCount = settings.filter(setting => setting.enabled && (admin || (setting.code !== 'prompt_access' && draft.permissions.includes(setting.id)))).length;
      return <section key={project.id} className={styles.projectSection} data-off={!member} aria-labelledby={`project-${project.id}`}>
        <header className={styles.projectSectionHead}>
          <div>
            <h3 id={`project-${project.id}`}>{project.name}{!admin && isChanged(project.id) && <em>Unsaved</em>}</h3>
            <p>{admin ? 'Included with the admin role' : member ? `${projectBots.filter(bot => botIds.includes(bot.id)).length} of ${projectBots.length} bots · ${featureCount} ${featureCount === 1 ? 'feature' : 'features'}` : 'No access'}</p>
          </div>
          {admin ? <Badge tone="blue"><Icon name="check"/>Full access</Badge> : <Switch checked={draft.member} onChange={() => update(project.id, {member: !draft.member})} disabled={busy} label={`Allow ${project.name} access`}/>}
        </header>
        {member && <div className={styles.projectSectionBody}>
          <div className={styles.listHeading}><span>Bots</span>{!admin && <button type="button" disabled={busy} onClick={() => update(project.id, {bots: allBots ? [] : projectBots.map(bot => bot.id)})}>{allBots ? 'Deselect all' : 'Select all'}</button>}</div>
          <AccessList rows={projectBots.map(bot => ({id:bot.id,title:bot.name,control:admin ? <span className={styles.allowed}><Icon name="check"/>Allowed</span> : <Switch checked={draft.bots.includes(bot.id)} onChange={() => update(project.id, {bots: flip(draft.bots, bot.id)})} disabled={busy} label={`Allow ${bot.name}`}/>}))}/>
          <div className={styles.listHeading}><span>Features</span><small>Apply across this user’s {project.name} bots</small></div>
          <AccessList rows={settings.map(setting => {
            const prompt = setting.code === 'prompt_access';
            const allowed = setting.enabled && (admin || (!prompt && draft.permissions.includes(setting.id)));
            return {id:setting.id,title:setting.name,description:!setting.enabled ? 'Disabled in project features.' : setting.description,
              control:admin ? <span className={allowed ? styles.allowed : styles.muted}>{allowed ? <><Icon name="check"/>Allowed</> : 'Disabled'}</span> : prompt ? <span className={styles.locked}><Icon name="lock"/>Admin only</span> : <Switch checked={allowed} onChange={() => update(project.id, {permissions: flip(draft.permissions, setting.id)})} disabled={!setting.enabled || busy} label={`Allow ${setting.name} for ${project.name}`}/>};
          })}/>
        </div>}
      </section>;
    })}</div>
    <footer className={styles.saveBar}>{admin ? <span><Icon name="lock"/>Admin permissions are inherited across all projects.</span> : <>
      <span>{removing.length ? `Saving removes access to ${names(removing)}.` : changed.length ? `Unsaved changes in ${names(changed)}.` : 'All changes saved.'}</span>
      <div><Button disabled={!changed.length || busy} onClick={() => setDrafts(savedAll())}>Discard</Button><Button variant="primary" disabled={!changed.length || busy} onClick={() => save(changed.map(payload))}>{busy ? 'Saving…' : 'Save changes'}</Button></div>
    </>}</footer>
  </>;
}

// One list for every access toggle: bots, per-user features, and project-wide features.
function AccessList({rows,bare=false}: {rows:{id:string;title:string;description?:string;control:ReactNode}[];bare?:boolean}) {
  return <ul className={styles.accessList} data-bare={bare}>{rows.map(row => <li key={row.id}><div><strong>{row.title}</strong>{row.description && <p>{row.description}</p>}</div><span className={styles.accessControl}>{row.control}</span></li>)}</ul>;
}
