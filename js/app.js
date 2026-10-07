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

function coachKey(
  operator = state?.operator || "db",
  coachClass = state?.coachClass || "1"
) {
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

  s.coaches[key].totals ||= {
    bottom: 0,
    top: 0,
  };

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
      })[c]
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
  document.body.classList.remove(
    "operator-db",
    "operator-sbb"
  );

  document.body.classList.add(
    `operator-${state.operator}`
  );

  document
    .querySelectorAll("#operator button")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        b.dataset.op === state.operator
      )
    );

  document
    .querySelectorAll("#floor button")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        b.dataset.floor === state.floor
      )
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


// -----------------------------------------------------------------------------
// Side view
// -----------------------------------------------------------------------------

function sideMarkup(c) {
  const active =
    String(c) === String(state.coachClass);

  const p = active
    ? floorProgress()
    : {
        top: 0,
        bottom: 0,
      };

  return `
    <img
      src="${assetUrl(
        SIDE_ASSETS[state.operator][c]
      )}"
      alt="${state.operator.toUpperCase()} IC2 ${c}. Klasse"
    >

    <span
      class="coach-progress top"
      style="--done:${p.top}%"
    ></span>

    <span
      class="coach-progress bottom"
      style="--done:${p.bottom}%"
    ></span>

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
  const totals =
    coach().totals || {
      top: 0,
      bottom: 0,
    };

  const c = coach();

  return {
    top: totals.top
      ? Math.round(
          (Object.keys(c.seats.top || {}).length /
            totals.top) *
            100
        )
      : 0,

    bottom: totals.bottom
      ? Math.round(
          (Object.keys(c.seats.bottom || {}).length /
            totals.bottom) *
            100
        )
      : 0,
  };
}

function renderSide() {
  const first =
    document.getElementById("sideFirst");

  const second =
    document.getElementById("sideSecond");

  first.innerHTML = sideMarkup(1);
  second.innerHTML = sideMarkup(2);

  document
    .querySelectorAll(".coach-option")
    .forEach((el) => {
      const active =
        el.dataset.coach ===
        String(state.coachClass);

      el.classList.remove("no-deck");

      el.classList.toggle(
        "active",
        active
      );

      el.classList.toggle(
        "floor-top",
        active && state.floor === "top"
      );

      el.classList.toggle(
        "floor-bottom",
        active && state.floor === "bottom"
      );
    });

  document.getElementById(
    "floorStatus"
  ).textContent =
    state.floor === "top"
      ? "⬆ Oberdeck aktiv"
      : "⬇ Unterdeck aktiv";

  document
    .querySelectorAll(".floor-hit")
    .forEach((b) =>
      b.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          setFloor(b.dataset.floor);
        }
      )
    );
}


// -----------------------------------------------------------------------------
// Seats
// -----------------------------------------------------------------------------

function seatElements(svg) {
  const groups = [
    ...svg.querySelectorAll("g[id]"),
  ];

  const semantic =
    groups.filter((e) =>
      seatRE.test(e.id)
    );

  if (semantic.length) {
    return semantic;
  }

  return groups.filter(
    (e) =>
      /^SEAT(?:_|-)/i.test(e.id) &&
      !/(ROW|ARM|REST|HEAD|TABLE|FRAME|WINDOW)/i.test(
        e.id
      )
  );
}


// -----------------------------------------------------------------------------
// External SVG
// -----------------------------------------------------------------------------

function wireDeckSvg(svg) {
  if (!svg) return;

  const doc = svg.ownerDocument;

  if (
    !doc.getElementById(
      "deckplan-seat-style"
    )
  ) {
    const style =
      doc.createElementNS(
        "http://www.w3.org/2000/svg",
        "style"
      );

    style.id =
      "deckplan-seat-style";

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

    svg.insertBefore(
      style,
      svg.firstChild
    );
  }

  const seats =
    seatElements(svg);

  coach().totals ||= {
    top: 0,
    bottom: 0,
  };

  coach().totals[state.floor] =
    seats.length;

  localStorage.setItem(
    KEY,
    JSON.stringify(state)
  );

  seats.forEach((g, i) => {
    const key = g.id;

    g.dataset.seat = key;
    g.dataset.index = i + 1;

    g.addEventListener(
      "click",
      (e) => {
        if (
          e.target.classList.contains(
            "seat-delete"
          )
        ) {
          return;
        }

        openEditor(g, key);
      }
    );

    const val =
      coach().seats[
        state.floor
      ][key];

    if (val) {
      g.classList.add(
        "assigned"
      );

      addSeatMarks(
        g,
        val.label,
        key
      );
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

  const host =
    document.getElementById("deck");

  const src =
    DECK_ASSETS[state.operator]
      ?.[state.coachClass]
      ?.[state.floor];

  if (!src) {
    host.innerHTML = `
      <div class="deck-missing">
        <strong>
          ${state.coachClass}. Klasse ausgewählt
        </strong>

        Für diesen Coach ist kein
        ${
          state.floor === "top"
            ? "Oberdeck"
            : "Unterdeck"
        }
        konfiguriert.
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

  const obj =
    host.querySelector("object");

  obj.addEventListener(
    "load",
    () => {
      const svg =
        obj.contentDocument
          ?.querySelector("svg");

      wireDeckSvg(svg);
    }
  );
}


// -----------------------------------------------------------------------------
// Seat labels
// -----------------------------------------------------------------------------

function addSeatMarks(
  g,
  label,
  key
) {
  let b;

  try {
    b = g.getBBox();
  } catch {
    return;
  }

  const ns =
    "http://www.w3.org/2000/svg";

  const doc =
    g.ownerDocument;

  const t =
    doc.createElementNS(
      ns,
      "text"
    );

  t.setAttribute(
    "x",
    b.x + b.width / 2
  );

  t.setAttribute(
    "y",
    b.y + b.height / 2
  );

  t.setAttribute(
    "class",
    "seat-label"
  );

  t.textContent = label;

  g.appendChild(t);

  const d =
    doc.createElementNS(
      ns,
      "text"
    );

  d.setAttribute(
    "x",
    b.x + b.width - 2
  );

  d.setAttribute(
    "y",
    b.y + 4
  );

  d.setAttribute(
    "class",
    "seat-delete"
  );

  d.textContent = "×";

  d.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();

      delete coach().seats[
        state.floor
      ][key];

      persist();
      renderDeck();
    }
  );

  g.appendChild(d);
}


// -----------------------------------------------------------------------------
// Inline seat editor
// -----------------------------------------------------------------------------

function closeEditor(
  save = false
) {
  const old =
    document.querySelector(
      ".seat-inline-input"
    );

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

  const r =
    g.getBoundingClientRect();

  const owner =
    g.ownerDocument;

  const obj =
    owner !== document
      ? [
          ...document.querySelectorAll(
            "object.deck-object"
          ),
        ].find(
          (o) =>
            o.contentDocument === owner
        )
      : null;

  const or =
    obj?.getBoundingClientRect();

  const xOffset =
    or?.left || 0;

  const yOffset =
    or?.top || 0;

  const inp =
    document.createElement(
      "input"
    );

  inp.className =
    "seat-inline-input";

  inp.inputMode = "numeric";
  inp.autocomplete = "off";

  inp.setAttribute(
    "aria-label",
    "Sitzplatznummer"
  );

  inp.value =
    coach().seats[
      state.floor
    ][key]?.label || "";

  const w =
    Math.max(
      26,
      Math.min(
        52,
        r.width * 0.75
      )
    );

  inp.style.width =
    `${w}px`;

  inp.style.height =
    `${
      Math.max(
        20,
        Math.min(
          30,
          r.height * 0.65
        )
      )
    }px`;

  inp.style.left =
    `${
      xOffset +
      r.left +
      r.width / 2 -
      w / 2
    }px`;

  inp.style.top =
    `${
      yOffset +
      r.top +
      r.height / 2 -
      12
    }px`;

  document.body.appendChild(
    inp
  );

  inp.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitInline(inp);
      } else if (
        e.key === "Escape"
      ) {
        e.preventDefault();
        closeEditor(false);
      }
    }
  );

  inp.addEventListener(
    "blur",
    () =>
      setTimeout(() => {
        if (
          document.body.contains(
            inp
          )
        ) {
          commitInline(inp);
        }
      }, 30)
  );

  inp.focus();
  inp.select();
}

function commitInline(inp) {
  if (!currentSeat) return;

  const cs =
    currentSeat;

  const label =
    inp.value.trim();

  inp.remove();
  currentSeat = null;

  if (!label) {
    delete coach().seats[
      cs.floor
    ][cs.key];

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

  const svg =
    cs.g.ownerSVGElement;

  const vb =
    svg.viewBox.baseVal;

  coach().seats[
    cs.floor
  ][cs.key] = {
    id:
      `${cs.floor}-${cs.key
        .toLowerCase()
        .replaceAll("_", "-")}`,

    label,

    svgId: cs.key,

    x: +(
      (
        b.x +
        b.width / 2 -
        vb.x
      ) /
      vb.width
    ).toFixed(5),

    y: +(
      (
        b.y +
        b.height / 2 -
        vb.y
      ) /
      vb.height
    ).toFixed(5),
  };

  persist();
  renderDeck();
}

function saveSeat() {
  const inp =
    document.querySelector(
      ".seat-inline-input"
    );

  if (inp) {
    commitInline(inp);
  }
}

function deleteSeat() {
  if (!currentSeat) return;

  const cs =
    currentSeat;

  document
    .querySelector(
      ".seat-inline-input"
    )
    ?.remove();

  currentSeat = null;

  delete coach().seats[
    cs.floor
  ][cs.key];

  persist();
  renderDeck();
}


// -----------------------------------------------------------------------------
// Stats
// -----------------------------------------------------------------------------

function renderStats() {
  const totals =
    coach().totals || {
      bottom: 0,
      top: 0,
    };

  const b =
    Object.keys(
      coach().seats.bottom
    ).length;

  const t =
    Object.keys(
      coach().seats.top
    ).length;

  const total =
    totals.bottom +
    totals.top;

  const c =
    b + t;

  const p =
    total
      ? Math.round(
          (c / total) * 100
        )
      : 0;

  const capturedEl =
    document.getElementById(
      "captured"
    );

  const totalEl =
    document.getElementById(
      "total"
    );

  const percentEl =
    document.getElementById(
      "percent"
    );

  const progressEl =
    document.getElementById(
      "progress"
    );

  const floorBreakdownEl =
    document.getElementById(
      "floorBreakdown"
    );

  if (capturedEl) {
    capturedEl.textContent = c;
  }

  if (totalEl) {
    totalEl.textContent =
      total;
  }

  if (percentEl) {
    percentEl.textContent =
      `${p}%`;
  }

  const level =
    p === 100
      ? "done"
      : p >= 70
        ? "high"
        : p >= 35
          ? "mid"
          : "low";

  if (progressEl) {
    progressEl.style.width =
      `${p}%`;

    progressEl.className =
      `progress ${level}`;
  }

  document
    .querySelectorAll(".stat")
    .forEach((x) => {
      x.classList.remove(
        "status-low",
        "status-mid",
        "status-high",
        "status-done"
      );

      x.classList.add(
        `status-${level}`
      );
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
    version: 6,

    deckPlan: {
      id: "deck-plan-1",
      operator:
        state.operator.toUpperCase(),
      coachClass:
        Number(
          state.coachClass
        ),
    },

    seats:
      coach().seats,
  };
}

function netex() {
  const decks =
    ["bottom", "top"]
      .map((f, ix) => {
        const spots =
          Object.values(
            coach().seats[f]
          )
            .map(
              (s) => `
                    <PassengerSpot id="${esc(s.id)}" version="any">
                      <Label>${esc(s.label)}</Label>
                      <Centroid>
                        <Location>
                          <pos>${s.x} ${s.y}</pos>
                        </Location>
                      </Centroid>
                    </PassengerSpot>`
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
  const kids =
    [...el.children];

  const attrs =
    [...el.attributes]
      .map(
        (a) =>
          `${a.name}="${esc(
            a.value
          )}"`
      )
      .join(" ");

  const text =
    [...el.childNodes]
      .filter(
        (n) =>
          n.nodeType === 3
      )
      .map(
        (n) =>
          n.textContent.trim()
      )
      .filter(Boolean)
      .join(" ");

  if (!kids.length) {
    return `
      <details>
        <summary>
          <span class="node">
            &lt;${el.localName}&gt;
          </span>

          ${
            attrs
              ? `<span class="attrs">${attrs}</span>`
              : ""
          }
        </summary>

        ${
          text
            ? `<div class="value">${esc(text)}</div>`
            : ""
        }
      </details>
    `;
  }

  return `
    <details>
      <summary>
        <span class="node">
          &lt;${el.localName}&gt;
        </span>

        ${
          attrs
            ? `<span class="attrs">${attrs}</span>`
            : ""
        }
      </summary>

      ${
        text
          ? `<div class="value">${esc(text)}</div>`
          : ""
      }

      ${kids.map(treeNode).join("")}
    </details>
  `;
}

function renderOutput() {
  const output =
    document.getElementById(
      "output"
    );

  if (tab === "tree") {
    const doc =
      new DOMParser()
        .parseFromString(
          netex(),
          "application/xml"
        );

    output.outerHTML =
      `<div id="output" class="netex-tree">${treeNode(
        doc.documentElement
      )}</div>`;

    return;
  }

  const cur =
    document.getElementById(
      "output"
    );

  if (cur.tagName !== "PRE") {
    cur.outerHTML =
      '<pre id="output" class="code"></pre>';
  }

  document.getElementById(
    "output"
  ).textContent =
    tab === "json"
      ? JSON.stringify(
          exportState(),
          null,
          2
        )
      : netex();
}


// -----------------------------------------------------------------------------
// Train width
// -----------------------------------------------------------------------------

const WIDTH_KEY =
  "deckplan-editor-train-width";

const trainWidth =
  document.getElementById(
    "trainWidth"
  );

const trainWidthValue =
  document.getElementById(
    "trainWidthValue"
  );

function applyTrainWidth(
  value
) {
  const n =
    Math.max(
      35,
      Math.min(
        100,
        Number(value) || 75
      )
    );

  document.documentElement
    .style.setProperty(
      "--train-width",
      `${n}%`
    );

  trainWidth.value =
    String(n);

  trainWidthValue.value =
    `${n}%`;

  trainWidthValue.textContent =
    `${n}%`;

  localStorage.setItem(
    WIDTH_KEY,
    String(n)
  );
}

applyTrainWidth(
  localStorage.getItem(
    WIDTH_KEY
  ) || 75
);

trainWidth.addEventListener(
  "input",
  () =>
    applyTrainWidth(
      trainWidth.value
    )
);


// -----------------------------------------------------------------------------
// Opacity controls
// -----------------------------------------------------------------------------

const VIEW_KEY =
  "deckplan-editor-view-opacity";

const activeOpacity =
  document.getElementById(
    "activeOpacity"
  );

const inactiveOpacity =
  document.getElementById(
    "inactiveOpacity"
  );

const inactiveFloorOpacity =
  document.getElementById(
    "inactiveFloorOpacity"
  );

function applyViewOpacity() {
  const active =
    Math.max(
      50,
      Math.min(
        100,
        Number(
          activeOpacity.value
        ) || 100
      )
    );

  const inactive =
    Math.max(
      10,
      Math.min(
        100,
        Number(
          inactiveOpacity.value
        ) || 50
      )
    );

  const floor =
    Math.max(
      10,
      Math.min(
        90,
        Number(
          inactiveFloorOpacity.value
        ) || 50
      )
    );

  document.documentElement
    .style.setProperty(
      "--coach-active-opacity",
      active / 100
    );

  document.documentElement
    .style.setProperty(
      "--coach-inactive-opacity",
      inactive / 100
    );

  document.documentElement
    .style.setProperty(
      "--floor-dim-overlay",
      1 - floor / 100
    );

  document.getElementById(
    "activeOpacityValue"
  ).textContent =
    `${active}%`;

  document.getElementById(
    "inactiveOpacityValue"
  ).textContent =
    `${inactive}%`;

  document.getElementById(
    "inactiveFloorOpacityValue"
  ).textContent =
    `${floor}%`;

  localStorage.setItem(
    VIEW_KEY,
    JSON.stringify({
      active,
      inactive,
      floor,
    })
  );
}

try {
  const v =
    JSON.parse(
      localStorage.getItem(
        VIEW_KEY
      ) || "{}"
    );

  activeOpacity.value =
    v.active ?? 100;

  inactiveOpacity.value =
    v.inactive ?? 50;

  inactiveFloorOpacity.value =
    v.floor ?? 50;
} catch {}

[
  activeOpacity,
  inactiveOpacity,
  inactiveFloorOpacity,
].forEach((el) =>
  el.addEventListener(
    "input",
    applyViewOpacity
  )
);

applyViewOpacity();


// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

document
  .getElementById(
    "coachStrip"
  )
  .addEventListener(
    "click",
    (e) => {
      const el =
        e.target.closest(
          ".coach-option"
        );

      if (
        el &&
        !e.target.classList.contains(
          "floor-hit"
        )
      ) {
        setCoachClass(
          el.dataset.coach
        );
      }
    }
  );

document
  .getElementById(
    "operator"
  )
  .addEventListener(
    "click",
    (e) => {
      if (
        e.target.dataset.op
      ) {
        setOperator(
          e.target.dataset.op
        );
      }
    }
  );

document
  .getElementById(
    "floor"
  )
  .addEventListener(
    "click",
    (e) => {
      if (
        e.target.dataset.floor
      ) {
        setFloor(
          e.target.dataset.floor
        );
      }
    }
  );

document
  .querySelector(".tabs")
  .addEventListener(
    "click",
    (e) => {
      if (
        e.target.dataset.tab
      ) {
        tab =
          e.target.dataset.tab;

        document
          .querySelectorAll(
            ".tabs button"
          )
          .forEach((b) =>
            b.classList.toggle(
              "active",
              b.dataset.tab ===
                tab
            )
          );

        renderOutput();
      }
    }
  );

document.getElementById(
  "reset"
).onclick = () => {
  if (
    confirm(
      "Alle erfassten Sitznummern löschen?"
    )
  ) {
    coach().seats = {
      bottom: {},
      top: {},
    };

    persist();
    renderAll();
  }
};

document.getElementById(
  "download"
).onclick = () => {
  const a =
    document.createElement(
      "a"
    );

  a.href =
    URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            exportState(),
            null,
            2
          ),
        ],
        {
          type:
            "application/json",
        }
      )
    );

  a.download =
    "deckplan.json";

  a.click();

  URL.revokeObjectURL(
    a.href
  );
};

renderAll();