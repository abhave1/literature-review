'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { AdminSnapshot } from '@/lib/auth/admin-types';
import { normalizeBotCatalog } from '@/lib/auth/bot-catalog';
import styles from './admin.module.css';
import AddUserDialog from './AddUserDialog';

type User = AdminSnapshot['users'][number];
type Project = AdminSnapshot['projects'][number];
type ProjectFeature = AdminSnapshot['projectFeatures'][number] & Pick<AdminSnapshot['features'][number], 'code' | 'name' | 'description'>;
function projectFeatures(data: AdminSnapshot): ProjectFeature[] {
  return data.projectFeatures.flatMap(assignment => {
    const feature = data.features.find(item => item.id === assignment.feature_id);
    return feature ? [{ ...assignment, code: feature.code, name: feature.name, description: feature.description }] : [];
  });
}
type Save = (payload: object) => Promise<void>;
const flip = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
const same = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));
const roleLabel = (role: string | null) => role === 'admin' ? 'Admin' : role === 'external' ? 'External' : 'Unassigned';

function Icon({ name }: { name: 'people' | 'projects' | 'search' | 'lock' | 'back' | 'check' }) {
  const paths = {
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    projects: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    back: <path d="m12 5-7 7 7 7M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
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
  const [view, setView] = useState<'users' | 'projects'>('users');
  const [userId, setUserId] = useState(initial.users[0]?.id ?? '');
  const [projectId, setProjectId] = useState(initial.projects.find(project => project.name === 'MxML')?.id ?? initial.projects[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const user = data.users.find(item => item.id === userId);
  const project = data.projects.find(item => item.id === projectId);
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
  async function save(payload: object) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save changes.');
      const refreshed = await fetch('/api/admin/access', { cache: 'no-store' });
      if (!refreshed.ok) throw new Error('Changes saved, but the view could not refresh. Reload before editing again.');
      setData(normalizeBotCatalog(await refreshed.json())); setRevision(value => value + 1); setDirty(false);
      setNotice('Changes saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save changes.'); }
    finally { setBusy(false); }
  }
  return <main className={styles.shell}>
    <aside className={styles.navigation}>
      <div className={styles.navTitle}><span className={styles.brandMark}>R</span><div>Research Bot<small>Administration</small></div></div>
      <nav aria-label="Administration">
        <button className={styles.navItem} data-active={view === 'users'} aria-current={view === 'users' ? 'page' : undefined} disabled={busy} onClick={() => {if (view !== 'users') navigate(() => setView('users'));}}><Icon name="people"/>People & access<span>{data.users.length}</span></button>
        <button className={styles.navItem} data-active={view === 'projects'} aria-current={view === 'projects' ? 'page' : undefined} disabled={busy} onClick={() => {if (view !== 'projects') navigate(() => setView('projects'));}}><Icon name="projects"/>Project features</button>
      </nav>
      <div className={styles.navBottom}><Link href="/bots" onClick={event => {if (dirty && !window.confirm('Discard your unsaved permission changes?')) event.preventDefault();}}><Icon name="back"/>Back to workspace</Link><p>CAT Research · ASU</p></div>
    </aside>
    <div className={styles.content}>
      <header className={styles.heading}><div><h1>{view === 'users' ? 'People & access' : 'Project features'}</h1><p>{view === 'users' ? 'Manage who can use each project, bot, and feature.' : 'Choose which features are available across each research project.'}</p></div><div className={styles.headerActions}><Badge tone="blue"><Icon name="lock"/>Admin workspace</Badge>{view === 'users' && <button className={styles.primary} disabled={busy} onClick={() => navigate(() => {setRevision(value => value + 1);setAddingUser(true);})}>+ Add user</button>}</div></header>
      {notice && <div className={styles.notice} role="status"><Icon name="check"/>{notice}</div>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {view === 'users' ? <div className={styles.workspace}>
        <section className={styles.people} aria-label="People">
          <div className={styles.peopleHeader}><h2>People <span>{data.users.length}</span></h2><label className={styles.search}><Icon name="search"/><input aria-label="Search people by email" placeholder="Search by email" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Filter people by role" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All roles</option><option value="admin">Admins</option><option value="external">External users</option><option value="unassigned">Unassigned</option></select></div>
          <div className={styles.peopleList}>{visibleUsers.map(person => <button key={person.id} disabled={busy} className={styles.person} data-selected={userId === person.id} aria-pressed={userId === person.id} onClick={() => {if (userId !== person.id) navigate(() => setUserId(person.id));}}><span className={styles.avatar}>{(person.email ?? '?')[0].toUpperCase()}</span><span className={styles.personText}><strong>{person.email ?? 'Email unavailable'}</strong><small>{roleLabel(person.role)}{person.role === 'admin' ? ' · All projects' : ` · ${data.memberships.filter(item => item.user_id === person.id).length} projects`}</small></span></button>)}{!visibleUsers.length && <div className={styles.empty}>No matching users.<button onClick={() => {setQuery('');setFilter('all');}}>Clear filters</button></div>}</div>
          <div className={styles.listHelp}><Icon name="people"/><p>Add a user by email, then choose their projects and bots. Users who sign in also appear here.</p></div>
        </section>
        <section className={styles.details} aria-label="Selected user permissions">
          {user ? <><div className={styles.userHeader}><span className={`${styles.avatar} ${styles.largeAvatar}`}>{(user.email ?? '?')[0].toUpperCase()}</span><div><h2>{user.email ?? 'Email unavailable'}</h2><p>{user.role === 'admin' ? 'Access to all projects and bots' : user.role === 'external' ? 'Access is limited to your assignments' : 'No access assigned yet'}</p></div><Badge tone={user.role === 'admin' ? 'blue' : ''}>{roleLabel(user.role)}</Badge></div>
            <div className={styles.projectTabs} role="tablist" aria-label="User projects">{data.projects.map(item => <button key={item.id} role="tab" aria-selected={projectId === item.id} aria-controls="project-permissions" id={`project-tab-${item.id}`} disabled={busy} onClick={() => {if (projectId !== item.id) navigate(() => setProjectId(item.id));}}>{item.name}<span>{user.role === 'admin' ? data.bots.filter(bot => bot.project_id === item.id).length : data.grants.filter(grant => grant.user_id === user.id && grant.project_id === item.id).length}</span></button>)}</div>
            {project && <ProjectAccess key={`${userId}:${projectId}:${revision}`} data={data} user={user} project={project} busy={busy} save={save} onDirty={setDirty}/>}
          </> : <div className={styles.empty}>Users will appear after signing in with Google.</div>}
        </section>
      </div> : <div className={styles.settingsWorkspace}>
        <div className={styles.settingsIntro}><Icon name="projects"/><p>A project-wide switch controls availability for everyone. External users also need permission on their own account. Prompts are always restricted to admins.</p></div>
        {data.projects.map(item => <section className={styles.projectSettings} key={item.id}><div className={styles.projectHeading}><div className={styles.projectMark}>{item.name === 'MxML' ? 'Mx' : item.name.slice(0,2)}</div><div><h2>{item.name}</h2><p>{data.bots.filter(bot => bot.project_id === item.id).length} bots</p></div></div><div>{projectFeatures(data).filter(setting => setting.project_id === item.id).map(setting => <SettingRow key={`${setting.id}:${revision}`} setting={setting} project={item} busy={busy} save={save}/>)}</div></section>)}
      </div>}
    </div>
    {addingUser && <AddUserDialog onClose={() => setAddingUser(false)} onAdded={userAdded}/>}
  </main>;
}

function ProjectAccess({data,user,project,busy,save,onDirty}: {data:AdminSnapshot;user:User;project:Project;busy:boolean;save:Save;onDirty:(dirty:boolean)=>void}) {
  const admin = user.role === 'admin';
  const originalMember = data.memberships.some(item => item.user_id === user.id && item.project_id === project.id);
  const originalBots = data.grants.filter(item => item.user_id === user.id && item.project_id === project.id).map(item => item.bot_id);
  const originalPermissions = data.permissions.filter(item => item.user_id === user.id && item.project_id === project.id && item.allowed).map(item => item.project_feature_id);
  const [member,setMember] = useState(originalMember);
  const [bots,setBots] = useState(originalBots);
  const [permissions,setPermissions] = useState(originalPermissions);
  const projectBots = data.bots.filter(item => item.project_id === project.id);
  const settings = projectFeatures(data).filter(item => item.project_id === project.id);
  const hasMembership = admin || member;
  const visibleBots = projectBots.filter(bot => hasMembership && (admin || bots.includes(bot.id)));
  const visibleFeatures = settings.filter(feature => feature.enabled && hasMembership &&
    (admin || (feature.code !== 'prompt_access' && permissions.includes(feature.id))));
  const dirty = !admin && (member !== originalMember || !same(bots,originalBots) || !same(permissions,originalPermissions));
  useEffect(() => {onDirty(dirty);}, [dirty,onDirty]);
  function reset() {setMember(originalMember);setBots(originalBots);setPermissions(originalPermissions);}
  return <div id="project-permissions" role="tabpanel" aria-labelledby={`project-tab-${project.id}`}>
    <section className={styles.accessSummary} aria-label={`${project.name} access summary`}>
      <div className={styles.summaryHeading}><h3>Access summary</h3><span>{dirty ? 'Preview · not saved' : 'Saved access'}</span></div>
      <dl className={styles.tagRows}>
        <div><dt>Role</dt><dd><Badge tone={admin ? 'blue' : ''}>{roleLabel(user.role ?? (member ? 'external' : null))}</Badge></dd></div>
        <div><dt>Project</dt><dd>{hasMembership ? <Badge>{project.name}</Badge> : <span className={styles.muted}>No access</span>}</dd></div>
        <div><dt>Bots</dt><dd>{visibleBots.length ? visibleBots.map(bot => <Badge key={bot.id}>{bot.name}</Badge>) : <span className={styles.muted}>None assigned</span>}</dd></div>
        <div><dt>Features</dt><dd>{visibleFeatures.length ? visibleFeatures.map(feature => <Badge key={feature.id} tone="green">{feature.name}</Badge>) : <span className={styles.muted}>None enabled for this user</span>}</dd></div>
      </dl>
      <p>Feature permissions apply across this user’s assigned bots in {project.name}, wherever supported. Use the controls below to edit access.</p>
    </section>
    <div className={styles.membership}><div><h3>{project.name} access</h3><p>{admin ? 'Included with the admin role. Individual grants are not needed.' : 'Enable this project, then select the bots this user can use.'}</p></div>{admin ? <Badge tone="green"><Icon name="check"/>Full access</Badge> : <Switch checked={member} onChange={()=>setMember(!member)} disabled={busy} label={`Allow ${project.name} access`}/>}</div>
    <div className={styles.sectionHeading}><h3>Bots <span>{admin ? projectBots.length : member ? bots.length : 0} of {projectBots.length} allowed</span></h3>{!admin && <button disabled={!member || busy} onClick={()=>setBots(bots.length === projectBots.length ? [] : projectBots.map(bot=>bot.id))}>{bots.length === projectBots.length ? 'Deselect all' : 'Select all'}</button>}</div>
    <div className={styles.botTable}><div className={styles.tableHeading}><span>Bot</span><span>Access</span></div>{projectBots.map(bot => <div key={bot.id} className={styles.botRow}><span className={styles.botName}><span className={styles.botGlyph}><Icon name="projects"/></span>{bot.name}</span>{admin ? <span className={styles.allowed}><Icon name="check"/>Allowed</span> : <Switch checked={member && bots.includes(bot.id)} onChange={()=>setBots(flip(bots,bot.id))} disabled={!member || busy} label={`Allow ${bot.name}`}/>}</div>)}</div>
    <div className={styles.sectionHeading}><h3>Feature permissions for {project.name}</h3></div>
    <div className={styles.features}>{settings.map(setting => {
      const prompt = setting.code === 'prompt_access';
      const allowed = setting.enabled && (admin || (!prompt && member && permissions.includes(setting.id)));
      return <div className={styles.featureRow} key={setting.id}><div><strong>{setting.name}</strong><p>{!setting.enabled ? 'Disabled in project features.' : setting.description}</p></div>{admin ? <span className={allowed ? styles.allowed : styles.muted}>{allowed ? <><Icon name="check"/>Allowed</> : 'Disabled'}</span> : prompt ? <span className={styles.locked}><Icon name="lock"/>Admin only</span> : <Switch checked={allowed} onChange={()=>setPermissions(flip(permissions,setting.id))} disabled={!member || !setting.enabled || busy} label={`Allow ${setting.name} for ${project.name}`}/>}</div>;
    })}</div>
    <footer className={styles.saveBar}>{admin ? <span><Icon name="lock"/>Admin permissions are inherited across all projects.</span> : <><span>{dirty ? !member && originalMember ? 'Saving removes access to this project and its bots.' : 'You have unsaved changes.' : 'All changes saved.'}</span><div><button className={styles.secondary} disabled={!dirty || busy} onClick={reset}>Discard</button><button className={styles.primary} disabled={!dirty || busy} onClick={()=>save({action:'membership',userId:user.id,projectId:project.id,member,botIds:member?bots:[],projectFeatureIds:member?permissions.filter(id=>settings.some(setting=>setting.id===id&&setting.enabled&&setting.code!=='prompt_access')):[]})}>{busy ? 'Saving…' : 'Save access'}</button></div></>}</footer>
  </div>;
}

function SettingRow({setting,project,busy,save}: {setting:ProjectFeature;project:Project;busy:boolean;save:Save}) {
  return <div className={styles.globalSetting}><div><h3>{setting.name}</h3><p>{setting.description}</p></div><span className={styles.settingState}>{setting.enabled ? 'Enabled' : 'Disabled'}</span><Switch checked={setting.enabled} onChange={()=>save({action:'project-feature',projectFeatureId:setting.id,enabled:!setting.enabled})} disabled={busy} label={`${setting.enabled ? 'Disable' : 'Enable'} ${setting.name} for ${project.name}`}/></div>;
}
