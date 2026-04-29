import type { Incident } from '../data/incidents';

/**
 * Create a lightweight description HTMLElement for an incident.
 * Returned element is absolutely positioned relative to its marker parent.
 */
export function makeDescription(incident: Incident): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'incident-description';
  wrapper.setAttribute('role', 'dialog');
  wrapper.style.cssText = [
    'position: absolute;',
    'bottom: 100%;',
    'left: 50%;',
    'transform: translateX(-50%) translateY(-8px);',
    'min-width: 160px;',
    'max-width: 260px;',
    'background: var(--bg2);',
    'color: var(--text);',
    'border: 1px solid var(--border);',
    'padding: 8px 10px;',
    'border-radius: 8px;',
    'box-shadow: 0 10px 30px rgba(0,0,0,0.6);',
    'font-size: 12px;',
    'line-height: 1.3;',
    'z-index: 1000;',
    'pointer-events: auto;',
  ].join('');

  wrapper.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
      <div style="font-size:18px;line-height:1">${incident.icon}</div>
      <div style="min-width:0">
        <div style="font-weight:700;font-size:13px;color:var(--text);">${incident.type}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">${incident.time} · ${incident.conf.toUpperCase()}</div>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text);">${escapeHtml(incident.desc)}</div>
  `;

  // little diamond tail
  const tail = document.createElement('div');
  tail.style.cssText = [
    'position:absolute;',
    'left:50%;',
    'top:100%;',
    'width:10px;',
    'height:10px;',
    'transform: translateX(-50%) rotate(45deg);',
    'background: var(--bg2);',
    'border-left:1px solid var(--border);',
    'border-bottom:1px solid var(--border);',
  ].join('');

  wrapper.appendChild(tail);

  return wrapper;
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
