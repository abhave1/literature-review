'use client';

// Replaces the root layout, so it can't rely on globals.css or the app fonts.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return <html lang="en">
    <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: '#f3f4f1', color: '#0e1013', fontFamily: 'ui-sans-serif, system-ui, sans-serif', colorScheme: 'light' }}>
      <title>Something went wrong · Research Bot</title>
      <main style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #e1e4de', borderRadius: 10, boxShadow: '0 20px 48px -20px rgb(14 16 19 / .28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 28px', borderBottom: '1px solid #e1e4de', fontSize: 14, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, background: '#b6ea3c' }} />Research Bot
        </div>
        <div style={{ padding: 28 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.03em' }}>Something went wrong</h1>
          <p style={{ margin: '12px 0 28px', color: '#5d636c', lineHeight: 1.6 }}>The app couldn’t load. Try again in a moment.</p>
          <button onClick={() => retry()} style={{ width: '100%', padding: '12px 20px', border: 0, borderRadius: 6, background: '#0e1013', color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>Try again</button>
        </div>
      </main>
    </body>
  </html>;
}
