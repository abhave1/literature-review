'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './home.module.css';

// Illustrative simulation of the review pipeline. Records stream left to right,
// pass the screening gate and the full-text gate, and what survives converges
// into the evidence lane. Rejected records sink and fade.
type Particle = { x: number; y: number; v: number; vy: number; lane: number; state: 0 | 1 | 2 | 3; a: number };
const GATE_SCREEN = 0.44, GATE_READ = 0.68, EVIDENCE = 0.88;
const PASS_SCREEN = 0.45, PASS_READ = 0.62;

export default function FlowStage() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tally = useRef({ records: 0, screened: 0, evidence: 0 });
  const [counts, setCounts] = useState({ records: 0, screened: 0, evidence: 0 });

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, frame = 0, top = 0.42, bottom = 0.84;
    let field: Particle[] = [];
    const mid = () => (top + bottom) / 2;
    const spawn = (x = -0.02): Particle => ({ x, y: top + Math.random() * (bottom - top), v: 0.0009 + Math.random() * 0.0011, vy: 0, lane: 0, state: 0, a: 1 });
    const pass = (p: Particle, to: 1 | 2) => {
      p.state = to;
      p.lane = to === 1 ? mid() + (p.y - mid()) * 0.45 : mid() + (Math.random() - 0.5) * (bottom - top) * 0.1;
    };

    const populate = () => {
      const n = Math.round(Math.min(340, Math.max(130, w / 4.5)));
      field = Array.from({ length: n }, () => {
        const p = spawn(Math.random());
        if (p.x > GATE_SCREEN && Math.random() < PASS_SCREEN) {
          pass(p, 1); p.y = p.lane;
          if (p.x > GATE_READ && Math.random() < PASS_READ) { pass(p, 2); p.y = p.lane; }
          else if (p.x > GATE_READ) p.x = Math.random() * GATE_READ;
        } else if (p.x > GATE_SCREEN) p.x = Math.random() * GATE_SCREEN;
        return p;
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.clientWidth; h = el.clientHeight;
      el.width = w * dpr; el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      [top, bottom] = w < 760 ? [0.68, 0.88] : [0.53, 0.86];
      populate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el); resize();

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const lane = (bottom - top) * h;
      // Evidence lane.
      const ex = EVIDENCE * w, ey = mid() * h;
      const glow = ctx.createLinearGradient(GATE_READ * w, 0, w, 0);
      glow.addColorStop(0, 'rgba(182, 234, 60, 0)'); glow.addColorStop(1, 'rgba(182, 234, 60, 0.28)');
      ctx.fillStyle = glow; ctx.fillRect(GATE_READ * w, ey - lane * 0.09, w - GATE_READ * w, lane * 0.18);
      ctx.strokeStyle = '#3f5f06'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ex, ey - lane * 0.16); ctx.lineTo(ex, ey + lane * 0.16); ctx.stroke();
      // Gates.
      ctx.strokeStyle = '#0e1013'; ctx.setLineDash([3, 5]);
      for (const g of [GATE_SCREEN, GATE_READ]) {
        ctx.beginPath(); ctx.moveTo(g * w, (top - 0.01) * h); ctx.lineTo(g * w, (bottom + 0.05) * h); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const p of field) {
        const px = p.x * w, py = p.y * h;
        if (p.state === 0) { ctx.fillStyle = 'rgba(14, 16, 19, 0.5)'; ctx.fillRect(px - 1.5, py - 1.5, 3, 3); }
        else if (p.state === 1) { ctx.fillStyle = 'rgba(63, 95, 6, 0.75)'; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill(); }
        else if (p.state === 2) {
          ctx.fillStyle = '#7fb10f'; ctx.beginPath(); ctx.arc(px, py, 2.8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(127, 177, 15, 0.35)'; ctx.beginPath(); ctx.arc(px, py, p.x > EVIDENCE ? 7 : 5.5, 0, Math.PI * 2); ctx.stroke();
        } else { ctx.fillStyle = `rgba(154, 160, 166, ${p.a * 0.7})`; ctx.fillRect(px - 1.4, py - 1.4, 2.8, 2.8); }
      }
    };

    const step = () => {
      for (let i = 0; i < field.length; i++) {
        const p = field[i];
        p.x += p.v;
        if (p.state === 0 && p.x >= GATE_SCREEN) {
          tally.current.records++;
          if (Math.random() < PASS_SCREEN) { pass(p, 1); tally.current.screened++; } else p.state = 3;
        } else if (p.state === 1 && p.x >= GATE_READ) {
          if (Math.random() < PASS_READ) { pass(p, 2); tally.current.evidence++; } else p.state = 3;
        }
        if (p.state === 1 || p.state === 2) p.y += (p.lane - p.y) * (p.state === 2 ? 0.05 : 0.03);
        if (p.state === 2 && p.x > EVIDENCE) p.v *= 1.012;
        if (p.state === 3) { p.vy += 0.00004; p.y += p.vy; p.v *= 0.985; p.a -= 0.009; }
        if (p.x > 1.03 || p.a <= 0) field[i] = spawn();
      }
    };

    const loop = () => { step(); draw(); frame = requestAnimationFrame(loop); };
    let ticker: ReturnType<typeof setInterval> | undefined;
    if (still) draw();
    else {
      frame = requestAnimationFrame(loop);
      ticker = setInterval(() => setCounts({ ...tally.current }), 200);
    }
    return () => { cancelAnimationFrame(frame); clearInterval(ticker); observer.disconnect(); };
  }, []);

  return <section className={styles.stage} aria-labelledby="home-title">
    <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />

    <div className={styles.copy}>
      <p className={styles.eyebrow}>Literature review instrument</p>
      <h1 id="home-title">Systematic review,{' '}<br />at instrument precision.</h1>
      <div className={styles.side}>
        <p className={styles.lede}>Research Bot screens records against your inclusion rules and reads full-text papers against the questions you define — in parallel, with every decision exportable.</p>
        <Link href="/bots" className={styles.primary}>Enter workspace <span aria-hidden="true">→</span></Link>
      </div>
    </div>

    <div className={styles.inLabel} aria-hidden="true">
      <span className={styles.tag}>Records in</span>
      <p>Scopus / WoS CSV · PDF</p>
    </div>
    <div className={`${styles.annotation} ${styles.gate}`} style={{ left: `${GATE_SCREEN * 100}%` }}>
      <span className={styles.tag}><b>01</b><i>Screen</i></span>
      <p>Metadata vs. your inclusion rules.</p>
    </div>
    <div className={`${styles.annotation} ${styles.gate}`} style={{ left: `${GATE_READ * 100}%` }}>
      <span className={styles.tag}><b>02</b><i>Read</i></span>
      <p>Full text vs. your rated aspects.</p>
    </div>
    <div className={`${styles.annotation} ${styles.evidence}`} style={{ left: `${EVIDENCE * 100}%` }}>
      <span className={`${styles.tag} ${styles.tagLime}`}><b>03</b><i>Evidence</i></span>
      <p>Excel & CSV, row per decision.</p>
    </div>

    <dl className={styles.readout}>
      <div><dt>Records</dt><dd>{counts.records.toLocaleString()}</dd></div>
      <div><dt>Screened in</dt><dd>{counts.screened.toLocaleString()}</dd></div>
      <div><dt>Evidence</dt><dd className={styles.kept}>{counts.evidence.toLocaleString()}</dd></div>
      <div className={styles.sim}><dt>Mode</dt><dd><span className={styles.live}>Simulation</span></dd></div>
    </dl>
  </section>;
}
