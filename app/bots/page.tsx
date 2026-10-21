import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BOTS, BOT_ROUTES, canonicalBotId, isInternalRoute, projectForBot, type CanonicalBotId } from '@/lib/auth/access';
import { getAccount, canUseFeature } from '@/lib/auth/server';
import styles from './workspace.module.css';

export const dynamic = 'force-dynamic';

const projectDescriptions: Record<string, string> = {
  MxML: 'Machine learning in measurement',
  ICAP: 'Cognitive engagement research',
  CSCL: 'Computer-supported collaborative learning',
};
const botDetails: Record<CanonicalBotId, { title: string; description: string }> = {
  icap: { title: 'ICAP analysis', description: 'Review papers using the ICAP framework.' },
  mxml1: { title: 'MxML1 analysis', description: 'Analyze papers in the first phase of the MxML review.' },
  screening: { title: 'Metadata screening', description: 'Screen paper metadata against your review criteria.' },
  mxml4: { title: 'MxML4 · Yes/No', description: 'Evaluate full-text papers with yes/no responses for each rated aspect.' },
  'mxml4-open': { title: 'MxML4 · Open-ended', description: 'Explore full-text papers with open-ended responses for each rated aspect.' },
  'cscl-screening': { title: 'Metadata screening', description: 'Screen paper metadata against your CSCL review criteria.' },
  'cscl-close': { title: 'Closed-ended analysis', description: 'Evaluate full-text papers using structured review questions.' },
  'cscl-open': { title: 'Open-ended analysis', description: 'Explore full-text papers using open-ended review questions.' },
};
const pad = (n: number) => String(n).padStart(2, '0');

export default async function BotsPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const [account, { denied }] = await Promise.all([getAccount(), searchParams]);
  if (!account) redirect('/login');
  const bots = BOTS.filter(bot => account.grants.includes(bot.id));
  const projects = ['MxML', 'ICAP', 'CSCL'].map(name => ({
    name, bots: bots.filter(bot => projectForBot(bot.id) === name),
  })).filter(project => project.bots.length > 0);
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <header className={styles.hero}>
          <div>
            <p className={`${styles.eyebrow} ${styles.mono}`}>Workspace</p>
            <h1>Research bots</h1>
          </div>
          <div className={styles.operator}>
            <span className={`${styles.status} ${styles.mono}`}>{account.user.email}</span>
            {account.isAdmin && <Link className={styles.admin} href="/admin">Manage users & access</Link>}
          </div>
        </header>
        {denied && <p role="status" className={styles.notice}>That page isn’t part of your workspace, so we brought you back here. Ask an admin if you need access.</p>}
        <p className={`${styles.stats} ${styles.mono}`}>
          <span><b>{pad(projects.length)}</b> projects</span>
          <span><b>{pad(bots.length)}</b> bots</span>
          <span>Access <b>{account.isAdmin ? 'Admin' : 'Assigned only'}</b></span>
        </p>
        {projects.length ? projects.map((project, i) => <section className={styles.project} id={`project-${project.name}`} key={project.name} aria-labelledby={`title-${project.name}`}>
          <header className={styles.projectHeader}>
            <span className={`${styles.index} ${styles.mono}`} aria-hidden="true">{pad(i + 1)}</span>
            <h2 id={`title-${project.name}`}>{project.name}<span>{projectDescriptions[project.name]}</span></h2>
            <span className={`${styles.count} ${styles.mono}`}>{pad(project.bots.length)} {project.bots.length === 1 ? 'bot' : 'bots'}</span>
          </header>
          <div className={styles.permissions} aria-label={`Your ${project.name} feature permissions`}>
            <span>Your features</span>
            {canUseFeature(account, project.bots.map(bot => bot.id), 'prompt_access') && <span className={styles.permissionTag}>System prompts</span>}
            {canUseFeature(account, project.bots.map(bot => bot.id), 'permanent_upload') && <span className={styles.permissionTag}>Permanent PDF uploads</span>}
            {!canUseFeature(account, project.bots.map(bot => bot.id), 'prompt_access') && !canUseFeature(account, project.bots.map(bot => bot.id), 'permanent_upload') && <span>Bot access only</span>}
          </div>
          <div className={styles.botGrid}>{project.bots.map(bot => {
            const detail = botDetails[bot.id];
            const internal = BOT_ROUTES.find(route => isInternalRoute(route.id) && canonicalBotId(route.id) === bot.id && account.grants.includes(route.id));
            return <article className={styles.bot} key={bot.id}>
              <h3>{detail.title}</h3>
              <p>{detail.description}</p>
              <div className={styles.launchOptions}>
                <Link href={bot.path} className={`${styles.open} ${styles.mono}`}>Open bot <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></Link>
                {internal && <Link href={internal.path} className={`${styles.open} ${styles.mono}`}>Internal page <span className={styles.tag}>Admin</span></Link>}
              </div>
            </article>;
          })}</div>
        </section>) : <section className={styles.empty}><h2>No projects assigned yet</h2><p>You’re signed in. Your projects and bots will appear here once an admin assigns access.</p></section>}
      </main>
    </div>
  );
}
