let snapIndex = new Map();

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

export async function loadSnapIndex() {
  const response = await fetch("snap_retailers_MA_2005_2025.csv");
  const csv = await response.text();

  const rows = csv.split("\n");
  const headers = rows[0].split(",");

  const nameIdx = headers.indexOf("Store Name");
  const zipIdx = headers.indexOf("Zip");

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i].split(",");

    const zip = cols[zipIdx];
    const name = normalize(cols[nameIdx]);

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