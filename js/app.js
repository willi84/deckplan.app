const BUILD_ID = window.DECKPLAN_BUILD_ID ?? "local";

function assetUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(BUILD_ID)}`;
}

const KEY = "deckplan-editor-v4";
const LEGACY_KEY = "deckplan-editor-v3";
const seatRE = /^SEAT_(LEFT|RIGHT|1_TOP|2_BOTTOM)(?:_\d+)?$/;

let state = load();
let currentSeat = null;
let tab = "json";

function coachKey(operator = state?.operator || "db", coachClass = state?.coachClass || "1") {
  return `${operator}:class-${coachClass}`;
}

function empty() {
  return {
    version: 6,
    operator: "db",
    coachClass: "1",
    floor: "bottom",
    coaches: {},
  };
}

function ensureCoach(s, key = coachKey(s.operator, s.coachClass)) {
  s.coaches ||= {};
  s.coaches[key] ||= {
    operator: s.operator,
    coachClass: s.coachClass,
    seats: {
      bottom: {},
      top: {},
    },
    totals: {
      bottom: 0,
      top: 0,
    },
  };

  s.coaches[key].totals ||= { bottom: 0, top: 0 };
  return s.coaches[key];
}

function load() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY));

    if (x) {
      const s = {
        ...empty(),
        ...x,
        coaches: x.coaches || {},
      };

      ensureCoach(s);
      return s;
    }

    const old = JSON.parse(localStorage.getItem(LEGACY_KEY));

    if (old) {
      const s = empty();

      s.operator = old.operator || "db";
      s.coachClass = old.coachClass || "1";
      s.floor = old.floor || "bottom";

      s.coaches[coachKey(s.operator, s.coachClass)] = {
        operator: s.operator,
        coachClass: s.coachClass,
        seats: {
          bottom: old.seats?.bottom || {},
          top: old.seats?.top || {},
        },
        totals: {
          bottom: 0,
          top: 0,
        },
      };

      return s;
    }
  } catch {}

  return empty();
}

function coach() {
  return ensureCoach(state);
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  renderOutput();
  renderStats();
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}

function setOperator(op) {
  state.operator = op;
  ensureCoach(state);
  persist();
  renderAll();
}

function setFloor(f) {
  state.floor = f;
  persist();
  renderAll();
}

function renderAll() {
  document.body.classList.remove("operator-db", "operator-sbb");
  document.body.classList.add(`operator-${state.operator}`);

  document.querySelectorAll("#operator button").forEach((b) =>
    b.classList.toggle("active", b.dataset.op === state.operator),
  );

  document.querySelectorAll("#floor button").forEach((b) =>
    b.classList.toggle("active", b.dataset.floor === state.floor),
  );

  document.getElementById("coachTitle").textContent =
    `${state.operator === "db" ? "DB" : "SBB"} · ${state.coachClass}. Klasse`;

  renderSide();
  renderDeck();
  renderStats();
  renderOutput();
}

// -----------------------------------------------------------------------------
// Assets
// -----------------------------------------------------------------------------

const SIDE_ASSETS = {
  db: {
    1: "assets/db-ic2-class-1-side.svg",
    2: "assets/db-ic2-class-2-side.svg",
  },
  sbb: {
    1: "assets/sbb-ic2-class-1-side.svg",
    2: "assets/sbb-ic2-class-2-side.svg",
  },
};

const DECK_ASSETS = {
  db: {
    1: {
      top: "assets/db-ic2-class-1-deck-top.svg",
      bottom: "assets/db-ic2-class-1-deck-bottom.svg",
    },
    2: {
      top: "assets/db-ic2-class-2-deck-top.svg",
      bottom: "assets/db-ic2-class-2-deck-bottom.svg",
    },
  },
  sbb: {
    1: {
      top: "assets/sbb-ic2-class-1-deck-top.svg",
      bottom: "assets/sbb-ic2-class-1-deck-bottom.svg",
    },
    2: {
      top: "assets/sbb-ic2-class-2-deck-top.svg",
      bottom: "assets/sbb-ic2-class-2-deck-bottom.svg",
    },
  },
};

function setCoachClass(c) {
  state.coachClass = String(c);
  ensureCoach(state);
  persist();
  renderAll();
}

function sideMarkup(c) {
  const active = String(c) === String(state.coachClass);
  const p = active ? floorProgress() : { top: 0, bottom: 0 };

  return `
    <img
      src="${assetUrl(SIDE_ASSETS[state.operator][c])}"
      alt="${state.operator.toUpperCase()} IC2 ${c}. Klasse"
    >

    <span class="coach-progress top" style="--done:${p.top}%"></span>
    <span class="coach-progress bottom" style="--done:${p.bottom}%"></span>

    ${
      active
        ? `
          <button
            class="floor-hit top"
            data-floor="top"
            aria-label="Oberdeck auswählen"
          ></button>

          <button
            class="floor-hit bottom"
            data-floor="bottom"
            aria-label="Unterdeck auswählen"
          ></button>
        `
        : ""
    }
  `;
}

function floorProgress() {
  const totals = coach().totals || { top: 0, bottom: 0 };
  const c = coach();

  return {
    top: totals.top
      ? Math.round((Object.keys(c.seats.top || {}).length / totals.top) * 100)
      : 0,
    bottom: totals.bottom
      ? Math.round((Object.keys(c.seats.bottom || {}).length / totals.bottom) * 100)
      : 0,
  };
}

function renderSide() {
  const first = document.getElementById("sideFirst");
  const second = document.getElementById("sideSecond");

  first.innerHTML = sideMarkup(1);
  second.innerHTML = sideMarkup(2);

  document.querySelectorAll(".coach-option").forEach((el) => {
    const active = el.dataset.coach === String(state.coachClass);

    el.classList.remove("no-deck");
    el.classList.toggle("active", active);
    el.classList.toggle("floor-top", active && state.floor === "top");
    el.classList.toggle("floor-bottom", active && state.floor === "bottom");
  });

  document.getElementById("floorStatus").textContent =
    state.floor === "top" ? "⬆ Oberdeck aktiv" : "⬇ Unterdeck aktiv";

  document.querySelectorAll(".floor-hit").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      setFloor(b.dataset.floor);
    }),
  );
}

// -----------------------------------------------------------------------------
// Seats
// -----------------------------------------------------------------------------

function seatElements(svg) {
  const groups = [...svg.querySelectorAll("g[id]")];

  const semantic = groups.filter((e) => seatRE.test(e.id));

  if (semantic.length) {
    return semantic;
  }

  return groups.filter(
    (e) =>
      /^SEAT(?:_|-)/i.test(e.id) &&
      !/(ROW|ARM|REST|HEAD|TABLE|FRAME|WINDOW)/i.test(e.id),
  );
}

function wireDeckSvg(svg) {
  if (!svg) return;

  const doc = svg.ownerDocument;

  if (!doc.getElementById("deckplan-seat-style")) {
    const style = doc.createElementNS("http://www.w3.org/2000/svg", "style");

    style.id = "deckplan-seat-style";
    style.textContent = `
      [data-seat] {
        cursor: pointer;
        opacity: .48;
        transition: opacity .12s;
      }

      [data-seat]:hover {
        opacity: .78;
      }

      [data-seat].assigned {
        opacity: 1;
      }

      .seat-label {
        font: 700 11px/1 system-ui;
        fill: #111;
        stroke: #fff;
        stroke-width: 3px;
        paint-order: stroke;
        pointer-events: none;
        text-anchor: middle;
        dominant-baseline: middle;
      }

      .seat-delete {
        font: 700 12px/1 system-ui;
        fill: #b00020;
        stroke: #fff;
        stroke-width: 3px;
        paint-order: stroke;
        cursor: pointer;
        text-anchor: middle;
        dominant-baseline: middle;
      }
    `;

    svg.insertBefore(style, svg.firstChild);
  }

  const seats = seatElements(svg);

  coach().totals ||= { top: 0, bottom: 0 };
  coach().totals[state.floor] = seats.length;
  localStorage.setItem(KEY, JSON.stringify(state));

  seats.forEach((g, i) => {
    const key = g.id;

    g.dataset.seat = key;
    applySeatPosition(g, valForSeat(key));
    if (layoutMode) installSeatDrag(g, key);
    g.dataset.index = i + 1;

    g.addEventListener("click", (e) => {
      if (layoutMode) { e.stopPropagation(); showSeatProperties(g, key); return; }
      if (e.target.classList.contains("seat-delete")) {
        return;
      }

      openEditor(g, key);
    });

    const val = coach().seats[state.floor][key];

    if (val) {
      g.classList.add("assigned");
      addSeatMarks(g, val.label, key);
    }
  });

  renderStats();
  renderSide();
}

// -----------------------------------------------------------------------------
// Deck
// -----------------------------------------------------------------------------

function renderDeck() {
  closeEditor();

  const host = document.getElementById("deck");

  const src = DECK_ASSETS[state.operator]?.[state.coachClass]?.[state.floor];

  if (!src) {
    host.innerHTML = `
      <div class="deck-missing">
        <strong>${state.coachClass}. Klasse ausgewählt</strong>
        Für diesen Coach ist kein ${state.floor === "top" ? "Oberdeck" : "Unterdeck"} konfiguriert.
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <object
      class="deck-object"
      type="image/svg+xml"
      data="${assetUrl(src)}"
      aria-label="${state.operator.toUpperCase()} IC2 ${state.coachClass}. Klasse ${state.floor}"
    ></object>
  `;

  const obj = host.querySelector("object");

  obj.addEventListener("load", () => {
    const svg = obj.contentDocument?.querySelector("svg");
    wireDeckSvg(svg);
  });
}

// -----------------------------------------------------------------------------
// Seat labels
// -----------------------------------------------------------------------------

function addSeatMarks(g, label, key) {
  let b;

  try {
    b = g.getBBox();
  } catch {
    return;
  }

  const ns = "http://www.w3.org/2000/svg";
  const doc = g.ownerDocument;

  const t = doc.createElementNS(ns, "text");

  t.setAttribute("x", b.x + b.width / 2);
  t.setAttribute("y", b.y + b.height / 2);
  t.setAttribute("class", "seat-label");
  t.textContent = label;

  g.appendChild(t);

  const d = doc.createElementNS(ns, "text");

  d.setAttribute("x", b.x + b.width - 2);
  d.setAttribute("y", b.y + 4);
  d.setAttribute("class", "seat-delete");
  d.textContent = "×";

  d.addEventListener("click", (e) => {
    e.stopPropagation();

    delete coach().seats[state.floor][key];

    persist();
    renderDeck();
  });

  g.appendChild(d);
}

// -----------------------------------------------------------------------------
// Inline seat editor
// -----------------------------------------------------------------------------

function closeEditor(save = false) {
  const old = document.querySelector(".seat-inline-input");

  if (old) {
    if (save) {
      commitInline(old);
    } else {
      old.remove();
    }
  }

  currentSeat = null;
}

function openEditor(g, key) {
  closeEditor(false);

  currentSeat = {
    g,
    key,
    floor: state.floor,
  };

  const r = g.getBoundingClientRect();
  const owner = g.ownerDocument;

  const obj =
    owner !== document
      ? [...document.querySelectorAll("object.deck-object")].find(
          (o) => o.contentDocument === owner,
        )
      : null;

  const or = obj?.getBoundingClientRect();

  const xOffset = or?.left || 0;
  const yOffset = or?.top || 0;

  const inp = document.createElement("input");

  inp.className = "seat-inline-input";
  inp.inputMode = "numeric";
  inp.autocomplete = "off";
  inp.setAttribute("aria-label", "Sitzplatznummer");

  inp.value = coach().seats[state.floor][key]?.label || "";

  const w = Math.max(26, Math.min(52, r.width * 0.75));

  inp.style.width = `${w}px`;
  inp.style.height = `${Math.max(20, Math.min(30, r.height * 0.65))}px`;

  inp.style.left = `${xOffset + r.left + r.width / 2 - w / 2}px`;
  inp.style.top = `${yOffset + r.top + r.height / 2 - 12}px`;

  document.body.appendChild(inp);

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitInline(inp);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeEditor(false);
    }
  });

  inp.addEventListener("blur", () =>
    setTimeout(() => {
      if (document.body.contains(inp)) {
        commitInline(inp);
      }
    }, 30),
  );

  inp.focus();
  inp.select();
}

function commitInline(inp) {
  if (!currentSeat) return;

  const cs = currentSeat;
  const label = inp.value.trim();

  inp.remove();
  currentSeat = null;

  if (!label) {
    delete coach().seats[cs.floor][cs.key];

    persist();
    renderDeck();
    return;
  }

  let b;

  try {
    b = cs.g.getBBox();
  } catch {
    b = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  const svg = cs.g.ownerSVGElement;
  const vb = svg.viewBox.baseVal;

  coach().seats[cs.floor][cs.key] = {
    id: `${cs.floor}-${cs.key.toLowerCase().replaceAll("_", "-")}`,
    label,
    svgId: cs.key,
    x: +((b.x + b.width / 2 - vb.x) / vb.width).toFixed(5),
    y: +((b.y + b.height / 2 - vb.y) / vb.height).toFixed(5),
  };

  persist();
  renderDeck();
}

function saveSeat() {
  const inp = document.querySelector(".seat-inline-input");

  if (inp) {
    commitInline(inp);
  }
}

function deleteSeat() {
  if (!currentSeat) return;

  const cs = currentSeat;

  document.querySelector(".seat-inline-input")?.remove();

  currentSeat = null;

  delete coach().seats[cs.floor][cs.key];

  persist();
  renderDeck();
}

// -----------------------------------------------------------------------------
// Stats
// -----------------------------------------------------------------------------

function renderStats() {
  const totals = coach().totals || {
    bottom: 0,
    top: 0,
  };

  const b = Object.keys(coach().seats.bottom).length;
  const t = Object.keys(coach().seats.top).length;

  const total = totals.bottom + totals.top;
  const c = b + t;

  const p = total ? Math.round((c / total) * 100) : 0;

  const capturedEl = document.getElementById("captured");
  const totalEl = document.getElementById("total");
  const percentEl = document.getElementById("percent");
  const progressEl = document.getElementById("progress");
  const floorBreakdownEl = document.getElementById("floorBreakdown");

  if (capturedEl) capturedEl.textContent = c;
  if (totalEl) totalEl.textContent = total;
  if (percentEl) percentEl.textContent = `${p}%`;

  const level = p === 100 ? "done" : p >= 70 ? "high" : p >= 35 ? "mid" : "low";

  if (progressEl) {
    progressEl.style.width = `${p}%`;
    progressEl.className = `progress ${level}`;
  }

  document.querySelectorAll(".stat").forEach((x) => {
    x.classList.remove(
      "status-low",
      "status-mid",
      "status-high",
      "status-done",
    );

    x.classList.add(`status-${level}`);
  });

  if (floorBreakdownEl) {
    floorBreakdownEl.textContent =
      `Unterdeck: ${b}/${totals.bottom} · Oberdeck: ${t}/${totals.top}`;
  }
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

function exportState() {
  return {
    version: 7,

    deckPlan: {
      id: "deck-plan-1",
      operator: state.operator.toUpperCase(),
      coachClass: Number(state.coachClass),
    },

    seats: coach().seats,
  };
}

function netex() {
  const decks = ["bottom", "top"]
    .map((f, ix) => {
      const spots = Object.values(coach().seats[f])
        .map(
          (s) => `
                    <PassengerSpot id="${esc(s.id)}" version="any">
                      <Label>${esc(s.label)}</Label>
                      <Description>${esc(JSON.stringify({svgId:s.svgId,operator:s.operator||state.operator,coachClass:s.coachClass||state.coachClass}))}</Description>
                      <Centroid>
                        <Location>
                          <pos>${s.x} ${s.y}</pos>
                        </Location>
                      </Centroid>
                    </PassengerSpot>`,
        )
        .join("\n");

      return `
            <Deck id="deck-${f}" version="any">
              <Name>${f === "bottom" ? "Lower" : "Upper"} Deck</Name>
              <Label>${ix + 1}</Label>
              <deckSpaces>
                <PassengerSpace id="space-${f}" version="any">
                  <passengerSpots>
${spots}
                  </passengerSpots>
                </PassengerSpace>
              </deckSpaces>
            </Deck>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<PublicationDelivery xmlns="http://www.netex.org.uk/netex" version="1.2.2">
  <dataObjects>
    <ResourceFrame id="deck-editor" version="any">
      <deckPlans>
        <DeckPlan id="deck-plan-1" version="any">
          <Name>${state.operator.toUpperCase()} Class ${state.coachClass}</Name>
          <decks>
${decks}
          </decks>
        </DeckPlan>
      </deckPlans>
    </ResourceFrame>
  </dataObjects>
</PublicationDelivery>`;
}

function treeNode(el) {
  const kids = [...el.children];

  const attrs = [...el.attributes]
    .map((a) => `${a.name}="${esc(a.value)}"`)
    .join(" ");

  const text = [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent.trim())
    .filter(Boolean)
    .join(" ");

  if (!kids.length) {
    return `
      <details>
        <summary>
          <span class="node">&lt;${el.localName}&gt;</span>
          ${attrs ? `<span class="attrs">${attrs}</span>` : ""}
        </summary>
        ${text ? `<div class="value">${esc(text)}</div>` : ""}
      </details>
    `;
  }

  return `
    <details>
      <summary>
        <span class="node">&lt;${el.localName}&gt;</span>
        ${attrs ? `<span class="attrs">${attrs}</span>` : ""}
      </summary>
      ${text ? `<div class="value">${esc(text)}</div>` : ""}
      ${kids.map(treeNode).join("")}
    </details>
  `;
}

function renderOutput() {
  const output = document.getElementById("output");

  if (tab === "tree") {
    const doc = new DOMParser().parseFromString(netex(), "application/xml");

    output.outerHTML =
      `<div id="output" class="netex-tree">${treeNode(doc.documentElement)}</div>`;

    return;
  }

  const cur = document.getElementById("output");

  if (cur.tagName !== "PRE") {
    cur.outerHTML = '<pre id="output" class="code"></pre>';
  }

  document.getElementById("output").textContent =
    tab === "json" ? JSON.stringify(exportState(), null, 2) : netex();
}

// -----------------------------------------------------------------------------
// Train width
// -----------------------------------------------------------------------------

const WIDTH_KEY = "deckplan-editor-train-width";

const trainWidth = document.getElementById("trainWidth");
const trainWidthValue = document.getElementById("trainWidthValue");

function applyTrainWidth(value) {
  const n = Math.max(35, Math.min(100, Number(value) || 75));

  document.documentElement.style.setProperty("--train-width", `${n}%`);

  trainWidth.value = String(n);
  trainWidthValue.value = `${n}%`;
  trainWidthValue.textContent = `${n}%`;

  localStorage.setItem(WIDTH_KEY, String(n));
}

applyTrainWidth(localStorage.getItem(WIDTH_KEY) || 75);

trainWidth.addEventListener("input", () => applyTrainWidth(trainWidth.value));

// -----------------------------------------------------------------------------
// Opacity controls
// -----------------------------------------------------------------------------

const VIEW_KEY = "deckplan-editor-view-opacity";

const activeOpacity = document.getElementById("activeOpacity");
const inactiveOpacity = document.getElementById("inactiveOpacity");
const inactiveFloorOpacity = document.getElementById("inactiveFloorOpacity");

function applyViewOpacity() {
  const active = Math.max(50, Math.min(100, Number(activeOpacity.value) || 100));
  const inactive = Math.max(
    10,
    Math.min(100, Number(inactiveOpacity.value) || 50),
  );
  const floor = Math.max(
    10,
    Math.min(90, Number(inactiveFloorOpacity.value) || 50),
  );

  document.documentElement.style.setProperty(
    "--coach-active-opacity",
    active / 100,
  );

  document.documentElement.style.setProperty(
    "--coach-inactive-opacity",
    inactive / 100,
  );

  document.documentElement.style.setProperty(
    "--floor-dim-overlay",
    1 - floor / 100,
  );

  document.getElementById("activeOpacityValue").textContent = `${active}%`;
  document.getElementById("inactiveOpacityValue").textContent = `${inactive}%`;
  document.getElementById("inactiveFloorOpacityValue").textContent = `${floor}%`;

  localStorage.setItem(
    VIEW_KEY,
    JSON.stringify({
      active,
      inactive,
      floor,
    }),
  );
}

try {
  const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}");

  activeOpacity.value = v.active ?? 100;
  inactiveOpacity.value = v.inactive ?? 50;
  inactiveFloorOpacity.value = v.floor ?? 50;
} catch {}

[activeOpacity, inactiveOpacity, inactiveFloorOpacity].forEach((el) =>
  el.addEventListener("input", applyViewOpacity),
);

applyViewOpacity();

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

document.getElementById("coachStrip").addEventListener("click", (e) => {
  const el = e.target.closest(".coach-option");

  if (el && !e.target.classList.contains("floor-hit")) {
    setCoachClass(el.dataset.coach);
  }
});

document.getElementById("operator").addEventListener("click", (e) => {
  if (e.target.dataset.op) {
    setOperator(e.target.dataset.op);
  }
});

document.getElementById("floor").addEventListener("click", (e) => {
  if (e.target.dataset.floor) {
    setFloor(e.target.dataset.floor);
  }
});

document.querySelector(".tabs").addEventListener("click", (e) => {
  if (e.target.dataset.tab) {
    tab = e.target.dataset.tab;

    document.querySelectorAll(".tabs button").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab),
    );

    renderOutput();
  }
});

document.getElementById("reset").onclick = () => {
  if (confirm("Alle erfassten Sitznummern löschen?")) {
    coach().seats = {
      bottom: {},
      top: {},
    };

    persist();
    renderAll();
  }
};

document.getElementById("download").onclick = () => {
  const a = document.createElement("a");

  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(exportState(), null, 2)], {
      type: "application/json",
    }),
  );

  a.download = "deckplan.json";
  a.click();

  URL.revokeObjectURL(a.href);
};


// -----------------------------------------------------------------------------
// Import and layout editing (feature flag)
// -----------------------------------------------------------------------------

let layoutMode = false;
let layoutDrag = null;

function valForSeat(key) {
  return coach().seats[state.floor]?.[key];
}

function normalizedCenter(g) {
  const svg = g.ownerSVGElement;
  const box = g.getBBox();
  const matrix = g.getCTM();
  const point = svg.createSVGPoint();
  point.x = box.x + box.width / 2;
  point.y = box.y + box.height / 2;
  const transformed = matrix ? point.matrixTransform(matrix) : point;
  const viewBox = svg.viewBox.baseVal;
  return {
    x: (transformed.x - viewBox.x) / viewBox.width,
    y: (transformed.y - viewBox.y) / viewBox.height,
  };
}

function applySeatPosition(g, data) {
  if (!data || !Number.isFinite(Number(data.x)) || !Number.isFinite(Number(data.y))) return;
  // Preserve the original Figma transform; only add a translation in the
  // parent SVG coordinate system, calculated from the actual seat centroid.
  const svg = g.ownerSVGElement;
  const vb = svg.viewBox.baseVal;
  const current = normalizedCenter(g);
  const dx = (Number(data.x) - current.x) * vb.width;
  const dy = (Number(data.y) - current.y) * vb.height;
  const original = g.dataset.baseTransform ?? g.getAttribute("transform") ?? "";
  g.dataset.baseTransform = original;
  const parentCTM = g.parentElement.getCTM();
  const svgCTM = svg.getCTM();
  if (!parentCTM || !svgCTM) return;
  const parentToSvg = svgCTM.inverse().multiply(parentCTM);
  const delta = parentToSvg.inverse();
  const px = delta.a * dx + delta.c * dy;
  const py = delta.b * dx + delta.d * dy;
  g.setAttribute("transform", `translate(${px} ${py}) ${original}`.trim());
}

function seatCoordinates(g, clientX, clientY) {
  const svg = g.ownerSVGElement;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse());
  const vb = svg.viewBox.baseVal;
  return {
    x: Math.max(0, Math.min(1, (svgPoint.x - vb.x) / vb.width)),
    y: Math.max(0, Math.min(1, (svgPoint.y - vb.y) / vb.height)),
  };
}

function ensureSeatData(g, key) {
  const seats = coach().seats[state.floor];
  if (!seats[key]) {
    const position = normalizedCenter(g);
    seats[key] = {
      id: `${state.floor}-${key.toLowerCase().replaceAll("_", "-")}`,
      svgId: key,
      label: "",
      x: +position.x.toFixed(5),
      y: +position.y.toFixed(5),
      operator: state.operator,
      coachClass: Number(state.coachClass),
    };
  }
  return seats[key];
}

function installSeatDrag(g, key) {
  g.style.cursor = "grab";
  g.style.touchAction = "none";
  g.addEventListener("pointerdown", (event) => {
    if (!layoutMode || event.target.classList.contains("seat-delete")) return;
    event.preventDefault();
    event.stopPropagation();
    const seat = ensureSeatData(g, key);
    const initial = { x: Number(seat.x), y: Number(seat.y) };
    const pointer = seatCoordinates(g, event.clientX, event.clientY);
    layoutDrag = { g, key, pointerId: event.pointerId, initial, pointer, moved: false };
    g.setPointerCapture(event.pointerId);
    g.style.cursor = "grabbing";
  });
  g.addEventListener("pointermove", (event) => {
    if (!layoutDrag || layoutDrag.g !== g || layoutDrag.pointerId !== event.pointerId) return;
    const current = seatCoordinates(g, event.clientX, event.clientY);
    const next = {
      x: Math.max(0, Math.min(1, layoutDrag.initial.x + current.x - layoutDrag.pointer.x)),
      y: Math.max(0, Math.min(1, layoutDrag.initial.y + current.y - layoutDrag.pointer.y)),
    };
    if (Math.abs(next.x - layoutDrag.initial.x) + Math.abs(next.y - layoutDrag.initial.y) > 0.002) layoutDrag.moved = true;
    const data = ensureSeatData(g, key);
    data.x = +next.x.toFixed(5);
    data.y = +next.y.toFixed(5);
    const base = g.dataset.baseTransform || "";
    g.setAttribute("transform", base);
    applySeatPosition(g, data);
  });
  const finish = (event) => {
    if (!layoutDrag || layoutDrag.g !== g || layoutDrag.pointerId !== event.pointerId) return;
    const moved = layoutDrag.moved;
    layoutDrag = null;
    g.style.cursor = "grab";
    persist();
    if (moved) {
      g.addEventListener("click", (e) => { e.stopImmediatePropagation(); e.preventDefault(); }, { once: true, capture: true });
    }
  };
  g.addEventListener("pointerup", finish);
  g.addEventListener("pointercancel", finish);
}

function showSeatProperties(g, key) {
  document.getElementById("layout-seat-panel")?.remove();
  const seat = ensureSeatData(g, key);
  const panel = document.createElement("div");
  panel.id = "layout-seat-panel";
  panel.className = "layout-seat-panel";
  panel.innerHTML = `
    <strong>🪑 ${escapeHtml(key)}</strong>
    <label>Nummer <input name="label" value="${escapeHtml(seat.label || "")}"></label>
    <label>Operator <select name="operator"><option value="db">DB</option><option value="sbb">SBB</option></select></label>
    <label>Klasse <select name="coachClass"><option value="1">1. Klasse</option><option value="2">2. Klasse</option></select></label>
    <div class="layout-seat-actions"><button type="button" data-action="save">Übernehmen</button><button type="button" data-action="close">Schließen</button></div>
  `;
  panel.querySelector('[name="operator"]').value = seat.operator || state.operator;
  panel.querySelector('[name="coachClass"]').value = String(seat.coachClass || state.coachClass);
  panel.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (action === "close") panel.remove();
    if (action === "save") {
      seat.label = panel.querySelector('[name="label"]').value.trim();
      seat.operator = panel.querySelector('[name="operator"]').value;
      seat.coachClass = Number(panel.querySelector('[name="coachClass"]').value);
      persist();
      panel.remove();
      renderDeck();
    }
  });
  document.body.appendChild(panel);
  persist();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function importJsonDocument(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object") throw new Error("Ungültige JSON-Datei");
  const imported = empty();
  if (data.coaches && typeof data.coaches === "object") {
    imported.coaches = data.coaches;
    imported.operator = String(data.operator || "db").toLowerCase();
    imported.coachClass = String(data.coachClass || "1");
    imported.floor = data.floor === "top" ? "top" : "bottom";
  } else if (data.deckPlan && data.seats) {
    imported.operator = String(data.deckPlan.operator || "db").toLowerCase();
    imported.coachClass = String(data.deckPlan.coachClass || "1");
    imported.coaches[coachKey(imported.operator, imported.coachClass)] = {
      operator: imported.operator,
      coachClass: imported.coachClass,
      seats: { bottom: data.seats.bottom || {}, top: data.seats.top || {} },
      totals: { bottom: 0, top: 0 },
    };
  } else throw new Error("Unbekanntes JSON-Format: deckPlan/seats fehlen");
  if (!["db", "sbb"].includes(imported.operator) || !["1", "2"].includes(imported.coachClass)) throw new Error("Operator/Klasse nicht unterstützt");
  return imported;
}

function importNetexDocument(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("Ungültiges XML");
  const local = (node, name) => [...node.getElementsByTagName("*")].filter(el => el.localName === name);
  const plan = local(xml, "DeckPlan")[0];
  if (!plan) throw new Error("Kein DeckPlan im NeTEx gefunden");
  const name = local(plan, "Name")[0]?.textContent || "";
  const operator = /\bSBB\b/i.test(name) ? "sbb" : /\bDB\b/i.test(name) ? "db" : null;
  const cls = name.match(/(?:Class|Klasse)\s*([12])/i)?.[1];
  if (!operator || !cls) throw new Error("Operator/Klasse fehlen im DeckPlan-Namen");
  const imported = empty();
  imported.operator = operator;
  imported.coachClass = cls;
  const c = ensureCoach(imported, coachKey(operator, cls));
  for (const deck of local(plan, "Deck")) {
    const deckName = local(deck, "Name")[0]?.textContent || "";
    const floor = /lower|unter|bottom/i.test(deckName) ? "bottom" : /upper|ober|top/i.test(deckName) ? "top" : null;
    if (!floor) continue;
    for (const spot of local(deck, "PassengerSpot")) {
      const id = spot.getAttribute("id") || "";
      const label = local(spot, "Label")[0]?.textContent || "";
      const pos = (local(spot, "pos")[0]?.textContent || "").trim().split(/\s+/).map(Number);
      if (pos.length !== 2 || !pos.every(Number.isFinite)) continue;
      let metadata = {};
      try { metadata = JSON.parse(local(spot, "Description")[0]?.textContent || "{}"); } catch {}
      const svgId = metadata.svgId || id.replace(new RegExp(`^${floor}-`), "").replaceAll("-", "_").toUpperCase();
      c.seats[floor][svgId] = {
        id, label, svgId, x: pos[0], y: pos[1],
        operator: metadata.operator || operator,
        coachClass: Number(metadata.coachClass || cls),
      };
    }
  }
  return imported;
}

async function importDeckFile(file) {
  const text = await file.text();
  const imported = /\.(xml|netex)$/i.test(file.name) || text.trimStart().startsWith("<")
    ? importNetexDocument(text)
    : importJsonDocument(text);
  if (!confirm("Import ersetzt die bisher lokal gespeicherten Sitzdaten. Fortfahren?")) return;
  state = imported;
  ensureCoach(state);
  localStorage.setItem(KEY, JSON.stringify(state));
  renderAll();
}

function installLayoutTools() {
  const toolbar = document.createElement("div");
  toolbar.className = "layout-toolbar";
  toolbar.innerHTML = `
    <button type="button" id="import-deck-button">📂 JSON / NeTEx importieren</button>
    <input type="file" id="import-deck-file" accept=".json,.xml,.netex,application/json,application/xml,text/xml" hidden>
    <button type="button" id="layout-toggle" aria-pressed="false">🛠 Layout bearbeiten: Aus</button>
    <span class="layout-help" id="layout-help" hidden>Sitz ziehen = Position ändern · Sitz anklicken = Eigenschaften</span>
  `;
  const actions = document.querySelector(".actions");
  actions?.parentElement?.insertBefore(toolbar, actions);
  toolbar.querySelector("#import-deck-button").onclick = () => toolbar.querySelector("#import-deck-file").click();
  toolbar.querySelector("#import-deck-file").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importDeckFile(file); }
    catch (error) { alert(`Import fehlgeschlagen: ${error.message}`); }
    event.target.value = "";
  };
  toolbar.querySelector("#layout-toggle").onclick = (event) => {
    layoutMode = !layoutMode;
    event.currentTarget.setAttribute("aria-pressed", String(layoutMode));
    event.currentTarget.textContent = `🛠 Layout bearbeiten: ${layoutMode ? "An" : "Aus"}`;
    toolbar.querySelector("#layout-help").hidden = !layoutMode;
    document.getElementById("layout-seat-panel")?.remove();
    renderDeck();
  };
  const css = document.createElement("style");
  css.textContent = `
    .layout-toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0}
    .layout-toolbar button,.layout-seat-actions button{border:1px solid #cbd1d8;background:white;border-radius:7px;padding:7px 9px;cursor:pointer}
    #layout-toggle[aria-pressed="true"]{background:#1d4f91;color:white}
    .layout-help{font-size:12px;color:#667085}
    .layout-seat-panel{position:fixed;right:20px;top:85px;z-index:100;background:white;border:1px solid #cbd1d8;border-radius:12px;padding:15px;box-shadow:0 8px 35px #0003;display:grid;gap:10px;min-width:220px}
    .layout-seat-panel label{display:grid;gap:3px;font-size:12px}
    .layout-seat-panel input,.layout-seat-panel select{padding:6px;border:1px solid #cbd1d8;border-radius:5px}
    .layout-seat-actions{display:flex;gap:6px}
  `;
  document.head.appendChild(css);
}

installLayoutTools();
renderAll();
