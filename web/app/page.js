'use client';

import { useState } from 'react';
import { PLAYER_ENGINE_SOURCE } from '../lib/playerEngine';

const inputStyle = {
  width: '100%', background: '#1f2937', color: '#f3f4f6', border: '1px solid #374151',
  borderRadius: 8, padding: '8px 10px', font: '13px/1.4 ui-monospace, Menlo, Consolas, monospace',
  boxSizing: 'border-box'
};
const labelStyle = { display: 'block', fontSize: 12.5, color: '#9ca3af', margin: '10px 0 4px' };
const sectionStyle = { background: '#111827', border: '1px solid #1f2937', borderRadius: 12, padding: '18px 20px', marginBottom: 16 };
const h2Style = { fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: '#93c5fd', margin: '0 0 12px' };
const btnPrimary = { background: '#3b82f6', color: '#fff', border: 0, borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnGhost = { background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' };

function buildSnippet(flow) {
  return PLAYER_ENGINE_SOURCE + '\n__demoPlayerRun(' + JSON.stringify(flow) + ');';
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

export default function Home() {
  const [name, setName] = useState('my-demo');
  const [baseUrl, setBaseUrl] = useState('');
  const [description, setDescription] = useState('');
  const [flow, setFlow] = useState(null);
  const [problems, setProblems] = useState([]);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState('');
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!description.trim()) { setStatus('Describe the flow first.'); setStatusKind('error'); return; }
    setLoading(true);
    setStatus('Generating…');
    setStatusKind('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, baseUrl, description })
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Generation failed.');
        setStatusKind('error');
        return;
      }
      setFlow(data.flow);
      setProblems(data.problems || []);
      setStatus(data.problems?.length
        ? 'Generated, but check: ' + data.problems.join('; ')
        : 'Generated ' + data.flow.steps.length + ' steps. Scroll down for your play script.');
      setStatusKind(data.problems?.length ? 'error' : 'ok');
    } catch (e) {
      setStatus('Failed: ' + e.message);
      setStatusKind('error');
    } finally {
      setLoading(false);
    }
  }

  async function copySnippet() {
    const ok = await copyText(buildSnippet(flow));
    setStatus(ok ? 'Copied. Paste it into the console on your target tab.' : 'Copy failed — select the text manually.');
    setStatusKind(ok ? 'ok' : 'error');
  }

  async function copyJson() {
    const ok = await copyText(JSON.stringify(flow, null, 2));
    setStatus(ok ? 'Flow JSON copied.' : 'Copy failed — select the text manually.');
    setStatusKind(ok ? 'ok' : 'error');
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '28px 20px 60px' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>Demo Director</h1>
      <p style={{ color: '#9ca3af', margin: '0 0 24px', fontSize: 13 }}>
        Describe a demo in plain English. Get a script that plays it out live, right in your
        own browser tab, with an animated cursor and captions — so you can screen-record it.
        No sign-up, no API key, nothing to install.
      </p>

      <section style={sectionStyle}>
        <h2 style={h2Style}>1 · The app</h2>
        <label style={labelStyle} htmlFor="name">Name</label>
        <input id="name" style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
        <label style={labelStyle} htmlFor="baseUrl">Base URL (informational — you'll already be on the page when you play it)</label>
        <input id="baseUrl" style={inputStyle} placeholder="https://your-app-address-here"
          value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2 · The flow, in plain English</h2>
        <label style={labelStyle} htmlFor="description">
          Mention button/link labels and field names as they actually appear on screen —
          that wording becomes the selectors.
        </label>
        <textarea id="description" style={{ ...inputStyle, height: 130, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder='Example: Click the "New lead" button. Type "Acme Distribution Ltd" into the company name field. Click "Save". Wait for the "Enriched" status to appear and highlight it.'
          value={description} onChange={e => setDescription(e.target.value)} />
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button style={btnPrimary} onClick={generate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate demo script'}
          </button>
        </div>
        {status && <div style={{ marginTop: 10, fontSize: 12.5, color: statusKind === 'error' ? '#f87171' : statusKind === 'ok' ? '#34d399' : '#9ca3af' }}>{status}</div>}
      </section>

      {flow && (
        <section style={sectionStyle}>
          <h2 style={h2Style}>3 · Play it</h2>
          <ol style={{ color: '#d1d5db', fontSize: 13.5, paddingLeft: 20, margin: '0 0 14px' }}>
            <li>Open <strong>{baseUrl || 'your app'}</strong> in this browser and get to the screen where the flow starts.</li>
            <li>Start your screen recording.</li>
            <li>Open DevTools (F12, or Cmd+Option+I on Mac) → the <strong>Console</strong> tab.</li>
            <li>Click "Copy play script" below, paste it into the console, press Enter.</li>
          </ol>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <button style={btnPrimary} onClick={copySnippet}>Copy play script</button>
            <button style={btnGhost} onClick={copyJson}>Copy flow JSON</button>
          </div>
          <label style={labelStyle} htmlFor="output">Generated flow</label>
          <textarea id="output" readOnly style={{ ...inputStyle, height: 220, fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 12 }}
            value={JSON.stringify(flow, null, 2)} />
          <p style={{ color: '#6b7280', fontSize: 11.5, marginTop: 8 }}>
            The play script runs entirely in your tab — nothing is sent anywhere while it plays.
            If a step can't find its element within its timeout, it stops and shows a red error
            caption naming the step, so you never end up with a half-finished take.
          </p>
        </section>
      )}
    </main>
  );
}
