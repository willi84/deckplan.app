/* Optional imports and modest image caching; no external dependencies. */
(() => {
  'use strict';
  const status = document.getElementById('uploadStatus');
  const fileInput = document.getElementById('uploadFile');
  document.getElementById('uploadButton').addEventListener('click', () => fileInput.click());
  const validOp = op => ['db', 'sbb'].includes(String(op).toLowerCase()) ? String(op).toLowerCase() : null;
  const validClass = c => ['1', '2'].includes(String(c)) ? String(c) : null;
  const validFloor = f => ['top', 'bottom'].includes(f) ? f : null;
  function normalizedSeats(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw Error('Sitzdaten fehlen.');
    const result = {bottom: {}, top: {}};
    for (const floor of ['bottom', 'top']) {
      const group = source[floor] ?? {};
      if (!group || typeof group !== 'object' || Array.isArray(group)) throw Error(`Ungültige Ebene: ${floor}`);
      for (const [key, seat] of Object.entries(group)) {
        if (!seat || typeof seat !== 'object' || Array.isArray(seat) || typeof seat.label !== 'string' || !seat.label.trim()) throw Error(`Ungültiger Sitz: ${key}`);
        if (seat.x !== undefined && !Number.isFinite(Number(seat.x))) throw Error(`Ungültige X-Koordinate: ${key}`);
        if (seat.y !== undefined && !Number.isFinite(Number(seat.y))) throw Error(`Ungültige Y-Koordinate: ${key}`);
        result[floor][key] = {...seat, id: String(seat.id ?? key), label: seat.label.trim()};
      }
    }
    return result;
  }
  function parseJson(text) {
    const data = JSON.parse(text);
    const meta = data.deckPlan ?? data;
    const op = validOp(meta.operator);
    const cls = validClass(meta.coachClass);
    if (!op || !cls) throw Error('JSON: deckPlan.operator (DB/SBB) und coachClass (1/2) erforderlich.');
    const seats = data.seats ?? data.coaches?.[`${op}:class-${cls}`]?.seats;
    return {op, cls, floor: validFloor(data.floor) ?? 'bottom', seats: normalizedSeats(seats)};
  }
  function parseNetex(text) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw Error('NeTEx: ungültiges XML.');
    const els = tag => Array.from(xml.getElementsByTagNameNS('*', tag));
    const plan = els('DeckPlan')[0];
    if (!plan) throw Error('NeTEx: DeckPlan fehlt.');
    const name = els('Name').find(n => n.parentElement === plan)?.textContent ?? '';
    const match = name.match(/\b(DB|SBB)\s+Class\s+([12])\b/i);
    if (!match) throw Error('NeTEx: Profil nicht erkennbar (erwartet z. B. DB Class 1).');
    const seats = {bottom: {}, top: {}};
    for (const deck of els('Deck')) {
      const id = deck.getAttribute('id') || '';
      const floor = id.includes('bottom') ? 'bottom' : id.includes('top') ? 'top' : null;
      if (!floor) continue;
      for (const spot of Array.from(deck.getElementsByTagNameNS('*', 'PassengerSpot'))) {
        const key = spot.getAttribute('id');
        const label = spot.getElementsByTagNameNS('*', 'Label')[0]?.textContent?.trim();
        const pos = spot.getElementsByTagNameNS('*', 'pos')[0]?.textContent?.trim().split(/\s+/).map(Number);
        if (!key || !label || !pos || pos.length !== 2 || !pos.every(Number.isFinite)) throw Error('NeTEx: unvollständiger PassengerSpot.');
        if (seats[floor][key]) throw Error(`NeTEx: doppelte Sitz-ID ${key}`);
        seats[floor][key] = {id:key, label, x:pos[0], y:pos[1]};
      }
    }
    return {op: match[1].toLowerCase(), cls: match[2], floor:'bottom', seats};
  }
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw Error('Datei zu groß (maximal 5 MB).');
      const text = await file.text();
      const data = /\.(xml|netex)$/i.test(file.name) || text.trimStart().startsWith('<') ? parseNetex(text) : parseJson(text);
      const key = `${data.op}:class-${data.cls}`;
      if (!confirm(`Profil ${data.op.toUpperCase()} · ${data.cls}. Klasse mit ${Object.keys(data.seats.bottom).length + Object.keys(data.seats.top).length} Sitzen importieren? Bestehende Sitzdaten dieses Profils werden ersetzt.`)) return;
      state.operator = data.op;
      state.coachClass = data.cls;
      state.floor = data.floor;
      ensureCoach(state, key).seats = data.seats;
      persist();
      renderAll();
      status.textContent = `✓ ${file.name}: ${data.op.toUpperCase()} · ${data.cls}. Klasse geladen.`;
    } catch (err) { status.textContent = `⚠ Import fehlgeschlagen: ${err.message}`; }
    finally { fileInput.value = ''; }
  });
  const assets = ['db','sbb'].flatMap(op => [1,2].flatMap(cls => ['side','deck-top','deck-bottom'].map(kind => `assets/${op}-ic2-class-${cls}-${kind}.svg`)));
  const grid = document.getElementById('cacheGrid');
  const cacheStatus = document.getElementById('cacheStatus');
  const cacheName = 'deckplan-graphics-v1';
  async function showCache() {
    if (!('caches' in window)) {cacheStatus.textContent = 'Cache API nicht verfügbar'; return;}
    try {
      const cache = await caches.open(cacheName);
      const entries = await Promise.all(assets.map(async path => Boolean(await cache.match(new URL(path, location.href), {ignoreSearch:true}))));
      grid.replaceChildren(...assets.map((path,i) => {
        const square = document.createElement('span');
        square.className = 'cache-square' + (entries[i] ? ' cached' : '') + (path.startsWith(`assets/${state.operator}-ic2-class-${state.coachClass}-`) ? ' active' : '');
        square.title = `${path.split('/').pop()}: ${entries[i] ? 'gespeichert' : 'nicht gespeichert'}`;
        square.setAttribute('aria-label', square.title);
        return square;
      }));
      cacheStatus.textContent = `${entries.filter(Boolean).length}/${assets.length} Grafiken zwischengespeichert · Netzwerk zuerst`;
    } catch {cacheStatus.textContent = 'Cache nicht verfügbar';}
  }
  document.getElementById('cacheRefresh').addEventListener('click', async () => {
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({type:'REFRESH_GRAPHICS'});
    await showCache();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(() => showCache()).catch(() => showCache());
    navigator.serviceWorker.addEventListener('message', e => {if(e.data?.type === 'GRAPHICS_UPDATED') showCache();});
  }
  showCache();
  document.getElementById('operator').addEventListener('click', () => queueMicrotask(showCache));
  document.getElementById('floor').addEventListener('click', () => queueMicrotask(showCache));
  document.getElementById('coachStrip').addEventListener('click', () => queueMicrotask(showCache));
})();
