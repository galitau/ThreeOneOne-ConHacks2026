import type { Incident } from '../data/incidents';

/**
 * Build a larger detailed description card for an incident.
 * The card includes a close button and some extra fields.
 */
export function makeDetailedDescription(incident: Incident) {
  const el = document.createElement('div');
  el.className = 'incident-detailed';
  el.style.cssText = [
    'position: absolute;',
    'min-width: 260px;',
    'max-width: 360px;',
    'background: var(--bg2);',
    'color: var(--text);',
    'border: 1px solid var(--border);',
    'padding: 12px 14px;',
    'border-radius: 10px;',
    'box-shadow: 0 18px 50px rgba(0,0,0,0.65);',
    'z-index: 2000;',
    'font-size: 13px;',
    'line-height: 1.4;',
    'pointer-events: auto;'
  ].join('');

  el.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <div style="display:flex;gap:10px;align-items:center;min-width:0;">
        <div style="font-size:22px">${incident.icon}</div>
        <div style="min-width:0">
          <div style="font-weight:800;font-size:15px;color:var(--text);">${incident.type}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">${incident.time} · ${incident.conf.toUpperCase()}</div>
        </div>
      </div>
      <button aria-label="Close" style="background:transparent;border:0;color:var(--text2);font-weight:700;cursor:pointer;font-size:14px">✕</button>
    </div>
    <div style="color:var(--text);margin-bottom:10px">${escapeHtml(incident.desc)}</div>
    <div style="display:flex;gap:8px;font-size:12px;color:var(--text3)">
      <div>📊 <strong style="color:var(--text)">${incident.reports}</strong> reports</div>
      <div>·</div>
      <div>🔢 <strong style="color:var(--accent)">${incident.score}%</strong></div>
    </div>
  `;

  const btn = el.querySelector('button');
  btn?.addEventListener('click', () => el.dispatchEvent(new CustomEvent('detail:close')));

  return el;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] as string));
}
