import { mkdir, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const FIGMA_TOKEN = process.env.FIGMA_TOKEN_DECKPLAN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY_DECKPLAN;

const OUTPUT_DIRECTORY = "assets";
const INDEX_FILE = "index.html";

const ASSET_NAME_PATTERN =
  /^(db|sbb)-ic2-class-[12]-(side|deck-top|deck-bottom)$/;

const buildStartedAt = new Date();
const buildStarted = performance.now();

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

if (!FIGMA_TOKEN) {
  throw new Error("FIGMA_TOKEN_DECKPLAN is missing");
}

if (!FIGMA_FILE_KEY) {
  throw new Error("FIGMA_FILE_KEY_DECKPLAN is missing");
}

const headers = {
  "X-Figma-Token": FIGMA_TOKEN,
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Request failed: ${response.status} ${response.statusText}\n${body}`,
    );
  }

  return response.json();
}

async function downloadSvg(url, target) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`,
    );
  }

  const svg = await response.text();

  if (!svg.includes("<svg")) {
    throw new Error("Downloaded file does not appear to be SVG");
  }

  await writeFile(target, svg, "utf8");
}

// -----------------------------------------------------------------------------
// Load complete Figma document
// -----------------------------------------------------------------------------

console.log("🎨 Loading DeckPlan from Figma...");
console.log(`📄 File: ${FIGMA_FILE_KEY}`);

const file = await fetchJson(
  `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}`,
  { headers },
);

console.log(`📐 Document: ${file.name ?? "unknown"}`);

// -----------------------------------------------------------------------------
// Find DeckPlan assets recursively
// -----------------------------------------------------------------------------

const assets = new Map();
const duplicates = [];

function findAssets(node) {
  if (
    typeof node.name === "string" &&
    ASSET_NAME_PATTERN.test(node.name)
  ) {
    if (assets.has(node.name)) {
      duplicates.push({
        name: node.name,
        first: assets.get(node.name),
        duplicate: node.id,
      });
    } else {
      assets.set(node.name, node.id);

      console.log(`✅ Found ${node.name} → ${node.id}`);
    }
  }

  for (const child of node.children ?? []) {
    findAssets(child);
  }
}

findAssets(file.document);

// -----------------------------------------------------------------------------
// Validate result
// -----------------------------------------------------------------------------

if (duplicates.length > 0) {
  console.warn("\n⚠️ Duplicate asset names:");

  for (const duplicate of duplicates) {
    console.warn(
      `   ${duplicate.name}: ${duplicate.first} / ${duplicate.duplicate}`,
    );
  }

  console.warn("   → First occurrence will be used.");
}

if (assets.size === 0) {
  throw new Error(
    "No DeckPlan assets found in Figma.\n" +
      "Expected names like db-ic2-class-1-side or " +
      "sbb-ic2-class-2-deck-top.",
  );
}

console.log(`\n🔎 Found ${assets.size} DeckPlan assets.`);

// -----------------------------------------------------------------------------
// Request SVG exports
// -----------------------------------------------------------------------------

const exportParams = new URLSearchParams({
  ids: [...assets.values()].join(","),
  format: "svg",

  // Preserve Figma layer names such as SEAT_* as SVG IDs.
  svg_include_id: "true",
});

console.log("\n🚆 Requesting SVG exports...");

const exportResult = await fetchJson(
  `https://api.figma.com/v1/images/${FIGMA_FILE_KEY}?${exportParams}`,
  { headers },
);

if (exportResult.err) {
  throw new Error(`Figma export failed: ${exportResult.err}`);
}

// -----------------------------------------------------------------------------
// Download SVGs into assets/
// -----------------------------------------------------------------------------

await mkdir(OUTPUT_DIRECTORY, {
  recursive: true,
});

let downloaded = 0;
let failed = 0;

console.log("\n📦 Downloading SVGs...\n");

for (const [name, nodeId] of assets) {
  const imageUrl = exportResult.images?.[nodeId];
  const filename = `${name}.svg`;
  const target = `${OUTPUT_DIRECTORY}/${filename}`;

  if (!imageUrl) {
    console.error(`❌ No export URL for ${name} (${nodeId})`);
    failed++;
    continue;
  }

  try {
    await downloadSvg(imageUrl, target);

    downloaded++;

    console.log(`💾 ${target}`);
  } catch (error) {
    failed++;

    console.error(`❌ ${filename}: ${error.message}`);
  }
}

// -----------------------------------------------------------------------------
// Update build information in index.html
// -----------------------------------------------------------------------------

async function updateBuildInfo() {
  const durationSeconds =
    ((performance.now() - buildStarted) / 1000).toFixed(2);

  const buildDate = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(buildStartedAt);

  const buildInfo = `${buildDate} · ${durationSeconds} s`;

  let html = await readFile(INDEX_FILE, "utf8");

  const marker =
    /<!-- BUILD_INFO_START -->.*?<!-- BUILD_INFO_END -->/s;

  if (!marker.test(html)) {
    console.warn(
      "⚠️ BUILD_INFO marker not found in index.html - skipping build info.",
    );

    return null;
  }

  html = html.replace(
    marker,
    `<!-- BUILD_INFO_START -->${buildInfo}<!-- BUILD_INFO_END -->`,
  );

  await writeFile(INDEX_FILE, html, "utf8");

  console.log(`\n🏗️ Build info: ${buildInfo}`);

  return buildInfo;
}

await updateBuildInfo();

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

const totalDuration =
  ((performance.now() - buildStarted) / 1000).toFixed(2);

console.log("\n────────────────────────────────────");
console.log("🚆 DeckPlan Figma import");
console.log("────────────────────────────────────");
console.log(`Figma file:  ${file.name ?? FIGMA_FILE_KEY}`);
console.log(`Found:       ${assets.size}`);
console.log(`Downloaded:  ${downloaded}`);
console.log(`Failed:      ${failed}`);
console.log(`Duplicates:  ${duplicates.length}`);
console.log(`Duration:    ${totalDuration} s`);
console.log("────────────────────────────────────");

if (failed > 0) {
  process.exitCode = 1;
}