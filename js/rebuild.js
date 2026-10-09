/* Rebuild configuration is intentionally local to this browser.
 * WARNING: A deploy hook and Vercel API token in localStorage are accessible to
 * scripts running on this origin. Prefer a server-side authenticated proxy in production.
 */
(() => {
  'use strict';
  const KEY = 'deckplan.rebuild.config';
  const defaults = { hookUrl: '', token: '', projectId: '', teamId: '', pollIntervalMs: 5000, maxPolls: 12, maxRetries: 5, requestTimeoutMs: 10000 };
  const button = document.getElementById('rebuildButton');
  const status = document.getElementById('rebuildStatus');
  const settings = document.getElementById('rebuildSettings');
  const form = document.getElementById('rebuildForm');
  if (!button || !status || !settings || !form) return;
  let resumeAfterSave = false;
  let running = false;
  let timer;
  const sleep = (ms) => new Promise(resolve => { timer = setTimeout(resolve, ms); });
  const setStatus = (message, kind = '') => { status.textContent = message; status.dataset.state = kind; };
  function config() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* use defaults */ }
    const cfg = { ...defaults, ...stored };
    for (const [key, min, max] of [['pollIntervalMs', 1000, 60000], ['maxPolls', 1, 120], ['maxRetries', 0, 20], ['requestTimeoutMs', 1000, 60000]]) {
      cfg[key] = Math.max(min, Math.min(max, Number(cfg[key]) || defaults[key]));
    }
    return cfg;
  }
  function valid(cfg) {
    try {
      const url = new URL(cfg.hookUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'api.vercel.com' || !url.pathname.startsWith('/v1/integrations/deploy/')) return false;
    } catch { return false; }
    return !!(cfg.token && cfg.projectId);
  }
  function populate() {
    const cfg = config();
    for (const field of form.elements) if (field.name && Object.hasOwn(cfg, field.name)) field.value = cfg[field.name];
  }
  // Deliberately hidden by default. Open with ?rebuildConfig=1 (or Alt+click the button).
  if (new URLSearchParams(location.search).get('rebuildConfig') === '1') { settings.hidden = false; populate(); }
  button.addEventListener('click', (event) => {
    if (event.altKey && !running) { settings.hidden = !settings.hidden; if (!settings.hidden) populate(); return; }
    rebuild();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem(KEY, JSON.stringify({ ...config(), ...data }));
    setStatus('Konfiguration lokal gespeichert.');
    settings.hidden = true;
    if (resumeAfterSave) { resumeAfterSave = false; rebuild(); }
  });
  async function request(url, options, cfg) {
    for (let retry = 0; ; retry++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
      try {
        const response = await fetch(url, { ...options, cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (retry >= cfg.maxRetries || error.retryable === false) throw error;
        setStatus(`Verbindungsproblem – Wiederholung ${retry + 1}/${cfg.maxRetries} …`, 'waiting');
        await sleep(Math.min(1000 * 2 ** retry, 10000));
      } finally { clearTimeout(timeout); }
    }
  }
  async function rebuild() {
    if (running) return;
    const cfg = config();
    if (!valid(cfg)) {
      resumeAfterSave = true;
      populate();
      settings.hidden = false;
      setStatus('⚙️ Bitte Vercel Deploy Hook, API-Token und Projekt-ID eintragen. Nach dem Speichern startet der Neubau automatisch.', 'waiting');
      const missing = !cfg.hookUrl ? 'hookUrl' : !cfg.token ? 'token' : 'projectId';
      form.elements.namedItem(missing)?.focus();
      return;
    }
    running = true;
    button.disabled = true;
    const started = Date.now();
    const endpoint = new URL('https://api.vercel.com/v6/deployments');
    endpoint.searchParams.set('projectId', cfg.projectId);
    endpoint.searchParams.set('limit', '20');
    if (cfg.teamId) endpoint.searchParams.set('teamId', cfg.teamId);
    const headers = { Authorization: `Bearer ${cfg.token}` };
    try {
      setStatus('🚀 Neubau wird gestartet …', 'waiting');
      await request(cfg.hookUrl, { method: 'POST' }, cfg);
      for (let poll = 1; poll <= cfg.maxPolls; poll++) {
        // Show remaining seconds and checks, updating once per second.
        for (let remaining = Math.ceil(cfg.pollIntervalMs / 1000); remaining > 0; remaining--) {
          setStatus(`🏗️ Build läuft · Prüfung ${poll}/${cfg.maxPolls} · ${remaining}s bis zur nächsten Prüfung`, 'waiting');
          await sleep(Math.min(1000, cfg.pollIntervalMs - (Math.ceil(cfg.pollIntervalMs / 1000) - remaining) * 1000));
        }
        const result = await request(endpoint.href, { headers }, cfg);
        const deployments = Array.isArray(result.deployments) ? result.deployments : [];
        // Only consider deployments started after this button was pressed.
        const candidates = deployments.filter(d => Number(d.createdAt || d.created || 0) >= started - 2000);
        const latest = candidates.sort((a, b) => (b.createdAt || b.created || 0) - (a.createdAt || a.created || 0))[0];
        if (!latest) { setStatus(`Warte auf neuen Build · ${cfg.maxPolls - poll} Prüfungen übrig`, 'waiting'); continue; }
        const state = latest.readyState || latest.state;
        if (state === 'READY') {
          setStatus('✅ Build erfolgreich – Cache wird erneuert …', 'success');
          // Clear stale app shell/profile resources only after a successful build.
          try {
            const names = await caches.keys();
            await Promise.all(names.filter(n => n.startsWith('deckplan-')).map(n => caches.delete(n)));
            navigator.serviceWorker?.controller?.postMessage({type:'BUILD_READY'});
            await navigator.serviceWorker?.getRegistration()?.then(r => r?.update());
          } catch (error) { console.warn('Cache cleanup failed:', error); }
          setStatus('✅ Build erfolgreich – Seite wird neu geladen …', 'success');
          // Local profile edits are retained; only service-worker resources are invalidated.
          // Bust browser/CDN caches for the document on reload.
          const target = new URL(location.href);
          target.searchParams.delete('rebuildConfig');
          target.searchParams.set('_build', String(Date.now()));
          location.replace(target.href);
          return;
        }
        if (state === 'ERROR' || state === 'CANCELED') { setStatus(`❌ Build ${state} (${latest.id || ''})`, 'error'); return; }
        setStatus(`🏗️ ${state || 'QUEUED'} · ${cfg.maxPolls - poll} Prüfungen übrig`, 'waiting');
      }
      setStatus('⌛ Zeitlimit erreicht. Build-Status noch unbekannt.', 'error');
    } catch (error) {
      setStatus(`❌ Neubau/Statusprüfung fehlgeschlagen: ${error.message}. Prüfe Verbindung, CORS und Konfiguration.`, 'error');
    } finally { running = false; button.disabled = false; }
  }
})();
