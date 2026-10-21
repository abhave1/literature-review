import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BOTS, BOT_ROUTES, canonicalBotId, isInternalRoute, projectForBot, type CanonicalBotId } from '@/lib/auth/access';
import { getAccount, canUseFeature } from '@/lib/auth/server';
import styles from './workspace.module.css';

export const dynamic = 'force-dynamic';

const projectDescriptions: Record<string, string> = {
  MxML: 'Explore machine learning and AI in measurement research papers.',
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

export default async function BotsPage() {
  const account = await getAccount();
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
        {projects.length ? projects.map(project => {
          const ids = project.bots.map(bot => bot.id);
          const features = [canUseFeature(account, ids, 'nonmeasurement_library') && 'Non-measurement Journals', canUseFeature(account, ids, 'permanent_upload') && 'PDF uploads', canUseFeature(account, ids, 'prompt_access') && 'System prompts'].filter(Boolean) as string[];
          return <section className={styles.project} id={`project-${project.name}`} key={project.name} aria-labelledby={`title-${project.name}`}>
          <header className={styles.projectHeader}>
            <h2 id={`title-${project.name}`}>{project.name === 'MxML' ? 'MxML+' : project.name}<span>{projectDescriptions[project.name]}</span></h2>
            {features.length > 0 && <ul className={styles.features} aria-label={`Your ${project.name} features`}>{features.map(feature => <li key={feature}>{feature}</li>)}</ul>}
          </header>
          <div className={styles.botGrid}>{project.bots.map(bot => {
            const detail = botDetails[bot.id];
            const internal = BOT_ROUTES.find(route => isInternalRoute(route.id) && canonicalBotId(route.id) === bot.id && account.grants.includes(route.id));
            return <article className={styles.bot} key={bot.id}>
              <h3>{detail.title}</h3>
              <p>{detail.description}</p>
              <div className={styles.launchOptions}>
                <Link href={bot.path} className={`${styles.open} ${styles.mono} ${styles.cardLink}`}>Open bot <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></Link>
                {internal && <Link href={internal.path} className={`${styles.open} ${styles.mono} ${styles.above}`}>Internal page <span className={styles.tag}>Admin</span></Link>}
              </div>
            </article>;
          })}</div>
        </section>;
        }) : <section className={styles.empty}><h2>No projects assigned yet</h2><p>You’re signed in. Your projects and bots will appear here once an admin assigns access.</p></section>}
      </main>
    </div>
  );
}
