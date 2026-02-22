let snapIndex = new Map();

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

export async function loadSnapIndex() {
  // If the CSV isn't present in /public, don't break the app.
  // Tip: you can ship a tiny empty CSV (headers only) to avoid noisy 404s in dev.
  const response = await fetch("/snap_retailers_MA_2005_2025.csv");
  if (!response.ok) {
    console.warn(
      "SNAP CSV not available (", response.status, ") - continuing without SNAP matching."
    );
    return;
  }
  const csv = await response.text();

  const rows = csv.split("\n");
  const headers = (rows[0] || "").split(",");

  const nameIdx = headers.indexOf("Store Name");
  const zipIdx = headers.indexOf("Zip");
  if (nameIdx === -1 || zipIdx === -1) {
    console.warn("SNAP CSV headers not found - continuing without SNAP matching.");
    return;
  }

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(",");
    if (cols.length <= Math.max(nameIdx, zipIdx)) continue;

    const zip = cols[zipIdx];
    const name = normalize(cols[nameIdx]);
    if (!zip || !name) continue;

    if (!snapIndex.has(zip)) {
      snapIndex.set(zip, []);
    }

    snapIndex.get(zip).push(name);
  }

  console.log("SNAP index loaded", snapIndex.size, "zip codes");
}

export function checkSnap(name, zip) {
  const list = snapIndex.get(zip);
  if (!list) return false;

  const n = normalize(name);

  return list.some(store =>
    n.includes(store) || store.includes(n)
  );
}