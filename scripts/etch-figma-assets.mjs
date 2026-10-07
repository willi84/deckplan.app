import { mkdir, writeFile } from "node:fs/promises";

const FIGMA_TOKEN = process.env.FIGMA_TOKEN_DECKPLAN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY_DECKPLAN;
const FIGMA_NODE_ID = process.env["FIGMA_NODE_ID_DECKPLAN"];

const OUTPUT_DIRECTORY = "assets";

const ASSET_NAME_PATTERN =
  /^(db|sbb)-ic2-class-[12]-(side|deck-top|deck-bottom)$/;

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

if (!FIGMA_TOKEN) {
  throw new Error("FIGMA_TOKEN_DECKPLAN is missing");
}

if (!FIGMA_FILE_KEY) {
  throw new Error("FIGMA_FILE_KEY_DECKPLAN is missing");
}

if (!FIGMA_NODE_ID) {
  throw new Error("FIGMA_NODE_ID_DECKPLAN is missing");
}

const headers = {
  "X-Figma-Token": FIGMA_TOKEN,
};

// Figma URLs often contain 123-456, while the API uses 123:456.
const nodeId = FIGMA_NODE_ID.replace("-", ":");

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

// -----------------------------------------------------------------------------
// Start-Node from Figma
// -----------------------------------------------------------------------------

console.log("🎨 Loading DeckPlan from Figma...");
console.log(`📄 File: ${FIGMA_FILE_KEY}`);
console.log(`🌳 Root node: ${nodeId}`);

const nodeResult = await fetchJson(
  `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/nodes?ids=${encodeURIComponent(nodeId)}`,
  {
    headers,
  },
);

const root = nodeResult.nodes?.[nodeId]?.document;

if (!root) {
  throw new Error(
    `Figma node ${nodeId} was not found in file ${FIGMA_FILE_KEY}`,
  );
}

// -----------------------------------------------------------------------------
// Find matching layers recursively
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

      console.log(
        `✅ Found ${node.name} → ${node.id}`,
      );
    }
  }

  for (const child of node.children ?? []) {
    findAssets(child);
  }
}

findAssets(root);

// -----------------------------------------------------------------------------
// Validate result
// -----------------------------------------------------------------------------

if (duplicates.length > 0) {
  console.warn("\n⚠️ Duplicate asset names:");

  for (const duplicate of duplicates) {
    console.warn(
      `   ${duplicate.name}: ` +
      `${duplicate.first} / ${duplicate.duplicate}`,
    );
  }

  console.warn("   → First occurrence will be used.");
}

if (assets.size === 0) {
  throw new Error(
    `No DeckPlan assets found below Figma node ${nodeId}.\n\n` +
    "Expected layer names like:\n" +
    "  db-ic2-class-1-side\n" +
    "  db-ic2-class-1-deck-top\n" +
    "  db-ic2-class-1-deck-bottom\n" +
    "  db-ic2-class-2-side\n" +
    "  ...",
  );
}

console.log(`\n🔎 Found ${assets.size} DeckPlan assets.`);

// -----------------------------------------------------------------------------
// Request SVG export URLs
// -----------------------------------------------------------------------------

const exportParams = new URLSearchParams({
  ids: [...assets.values()].join(","),
  format: "svg",

  // Keep Figma layer names as SVG IDs.
  // Required for SEAT_*, WINDOWS_TOP, WINDOWS_BOTTOM, etc.
  svg_include_id: "true",
});

console.log("\n🚆 Requesting SVG exports...");

const exportResult = await fetchJson(
  `https://api.figma.com/v1/images/${FIGMA_FILE_KEY}?${exportParams}`,
  {
    headers,
  },
);

if (exportResult.err) {
  throw new Error(
    `Figma export failed: ${exportResult.err}`,
  );
}

// -----------------------------------------------------------------------------
// Create assets directory
// -----------------------------------------------------------------------------

await mkdir(
  OUTPUT_DIRECTORY,
  {
    recursive: true,
  },
);

// -----------------------------------------------------------------------------
// Download SVGs
// -----------------------------------------------------------------------------

let downloaded = 0;
let failed = 0;

console.log("\n📦 Downloading SVGs...\n");

for (const [name, assetNodeId] of assets) {
  const imageUrl = exportResult.images?.[assetNodeId];

  const filename = `${name}.svg`;
  const target = `${OUTPUT_DIRECTORY}/${filename}`;

  if (!imageUrl) {
    console.error(
      `❌ No export URL returned for ${name} (${assetNodeId})`,
    );

    failed++;

    continue;
  }

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(
        `${response.status} ${response.statusText}`,
      );
    }

    const svg = await response.text();

    if (!svg.includes("<svg")) {
      throw new Error(
        "Downloaded file does not appear to be SVG",
      );
    }

    await writeFile(
      target,
      svg,
      "utf8",
    );

    downloaded++;

    console.log(`💾 ${target}`);
  } catch (error) {
    failed++;

    console.error(
      `❌ ${filename}: ${error.message}`,
    );
  }
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log("\n────────────────────────────────────");
console.log("🚆 DeckPlan Figma import");
console.log("────────────────────────────────────");
console.log(`Root node:  ${nodeId}`);
console.log(`Found:      ${assets.size}`);
console.log(`Downloaded: ${downloaded}`);
console.log(`Failed:     ${failed}`);
console.log(`Duplicates: ${duplicates.length}`);
console.log("────────────────────────────────────");

if (failed > 0) {
  process.exitCode = 1;
}