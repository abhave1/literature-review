import type { Metadata } from 'next';
import Link from 'next/link';
import FlowStage from './FlowStage';
import styles from './home.module.css';

export const metadata: Metadata = {
  title: 'Research Bot — Literature review, instrumented',
  description: 'Screen metadata and analyze full-text papers against the rubric you define.',
};

export default function HomePage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/home" className={styles.brand}><span aria-hidden="true" />Research Bot</Link>
      <Link href="/bots" className={styles.signIn}>Sign in</Link>
    </header>
    <main>
      <FlowStage />
    </main>
    <footer className={styles.footer}>
      <span>Research Bot</span>
      <span>PDFs parse in your browser · Access granted per bot · 5 papers in parallel</span>
    </footer>
  </div>;
}
