// Injected into the page before every navigation. Draws a fake cursor,
// a click ripple, and a caption bar. Everything here runs in the browser.
(() => {
  if (window.__demo) return;
  const state = { x: window.innerWidth / 2, y: window.innerHeight / 2, ready: false };

  function ensure() {
    if (state.ready && document.getElementById('__demo_cursor')) return;
    const root = document.body || document.documentElement;

    if (!document.getElementById('__demo_style')) {
      const st = document.createElement('style');
      st.id = '__demo_style';
      st.textContent = `
        #__demo_cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;will-change:left,top}
        #__demo_cursor svg{display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
        #__demo_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;border-radius:50%;border:2px solid rgba(59,130,246,.95);left:-999px;top:-999px}
        #__demo_ripple.go{animation:__demoR .5s ease-out}
        @keyframes __demoR{0%{opacity:.9;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(2.6)}}
        #__demo_caption{position:fixed;left:50%;bottom:7%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;max-width:78%;background:rgba(17,24,39,.92);color:#fff;font:500 18px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 20px;border-radius:12px;opacity:0;transition:opacity .3s ease;box-shadow:0 10px 34px rgba(0,0,0,.4)}
        #__demo_caption.show{opacity:1}
        .__demo_hl{outline:3px solid rgba(59,130,246,.95)!important;outline-offset:2px;border-radius:6px}
      `;
      (document.head || root).appendChild(st);
    }

    if (!document.getElementById('__demo_cursor')) {
      const cur = document.createElement('div');
      cur.id = '__demo_cursor';
      cur.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" stroke="#000" stroke-width="1.2"><path d="M4 2 L4 20 L9 15 L12.5 22 L15 21 L11.5 14 L18 14 Z"/></svg>';
      root.appendChild(cur);
    }
    if (!document.getElementById('__demo_ripple')) {
      const rip = document.createElement('div'); rip.id = '__demo_ripple'; root.appendChild(rip);
    }
    if (!document.getElementById('__demo_caption')) {
      const cap = document.createElement('div'); cap.id = '__demo_caption'; root.appendChild(cap);
    }
    state.ready = true;
    place(state.x, state.y);
  }

  function place(x, y) {
    const c = document.getElementById('__demo_cursor');
    if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; }
    state.x = x; state.y = y;
  }

  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  window.__demo = {
    pos() { return { x: state.x, y: state.y }; },
    moveTo(x, y, ms) {
      ensure();
      return new Promise(res => {
        const sx = state.x, sy = state.y, dur = Math.max(ms || 800, 1), t0 = performance.now();
        function step(now) {
          const p = Math.min((now - t0) / dur, 1), e = ease(p);
          place(sx + (x - sx) * e, sy + (y - sy) * e);
          if (p < 1) requestAnimationFrame(step); else res();
        }
        requestAnimationFrame(step);
      });
    },
    clickPulse(x, y) {
      ensure();
      const rip = document.getElementById('__demo_ripple');
      rip.style.left = x + 'px'; rip.style.top = y + 'px';
      rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go');
    },
    caption(text) {
      ensure();
      const cap = document.getElementById('__demo_caption');
      if (!text) { cap.classList.remove('show'); return; }
      cap.textContent = text; cap.classList.add('show');
    }
  };
})();
