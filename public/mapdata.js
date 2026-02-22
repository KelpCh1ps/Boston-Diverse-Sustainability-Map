// mapdata.js
// Controls all marker rendering for:
// - Food (Boston dataset)
// - Retail (supermarket.geojson)
// - Wholesale (food_producers + local_markets, excluding pantry/bank overlap)
// - Farm (food_banks + food_pantries)
// Also displays AI analysis (creates AI card automatically if missing).

import { Restaurants, Market, Pantry } from "./markers.js";
import { checkSnap, loadSnapIndex } from "./snapmatch.js";

const BOSTON_URL =
  "https://data.boston.gov/api/3/action/datastore_search?resource_id=f1e13724-284d-478c-b8bc-ef042aa5b70b&limit=5000";

const GEO = {
  producers: "food_producers.geojson",
  localMarkets: "local_markets.geojson",
  banks: "food_banks.geojson",
  pantries: "food_pantries.geojson",
  supermarkets: "supermarket.geojson",
};

let mapRef = null;
let infoWindowRef = null;

let currentCategory = "food";
let currentQuery = "";

let foodItems = [];
let retailItems = [];
let wholesaleItems = [];
let farmItems = [];

let foodFiltered = [];
let retailFiltered = [];
let wholesaleFiltered = [];
let farmFiltered = [];

let foodMarkers = [];
let retailMarkers = [];
let wholesaleMarkers = [];
let farmMarkers = [];

let loadedFood = false;
let loadedRetail = false;
let loadedWholesale = false;
let loadedFarms = false;

/* ---------------- Utilities ---------------- */

const norm = (v) => (v ?? "").toString().trim();
const lower = (v) => norm(v).toLowerCase();

function clearMarkers(arr) {
  arr.forEach((m) => m.setMap(null));
  arr.length = 0;
}

function clearAllMarkers() {
  clearMarkers(foodMarkers);
  clearMarkers(retailMarkers);
  clearMarkers(wholesaleMarkers);
  clearMarkers(farmMarkers);
  if (infoWindowRef) infoWindowRef.close();
}

function buildOsmAddress(p = {}) {
  const line1 = [p["addr:housenumber"], p["addr:street"]].filter(Boolean).join(" ");
  const line2 = [p["addr:city"], p["addr:state"], p["addr:postcode"]]
    .filter(Boolean)
    .join(", ");
  return [line1, line2].filter(Boolean).join(", ");
}

async function loadGeoJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const gj = await res.json();
  return Array.isArray(gj?.features) ? gj.features : [];
}

function toLatLng(f) {
  const coords = f?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lng, lat] = coords;
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  return { lat: nLat, lng: nLng };
}

function filterItems(items, q) {
  if (!q) return [...items];
  const query = lower(q);
  return items.filter((it) =>
    lower(`${it.name} ${it.address ?? ""} ${it.number ?? ""} ${it.review ?? ""} ${it.hours ?? ""}`).includes(query)
  );
}

function sortByName(arr, order) {
  const dir = order === "asc" ? 1 : -1;
  arr.sort((a, b) => dir * norm(a.name).localeCompare(norm(b.name)));
}

/* ---------------- AI Summary UI ---------------- */

// Create AI card in sidebar if it doesn't exist
function ensureAICard() {
  let card = document.getElementById("ai-summary-card");
  let content = document.getElementById("ai-summary-content");

  if (card && content) return { card, content };

  const sidebar = document.querySelector("aside");
  if (!sidebar) return { card: null, content: null };

  // Put it right below the search box (after the first div in aside)
  const headerBox = sidebar.querySelector("div");
  const cardWrap = document.createElement("div");
  cardWrap.id = "ai-summary-card";
  cardWrap.style.margin = "12px 16px";
  cardWrap.style.padding = "12px 12px";
  cardWrap.style.border = "1px solid #e6e6e6";
  cardWrap.style.borderRadius = "14px";
  cardWrap.style.background = "#fff";
  cardWrap.style.boxShadow = "0 1px 8px rgba(0,0,0,0.06)";
  cardWrap.style.display = "none";

  const title = document.createElement("div");
  title.style.display = "flex";
  title.style.alignItems = "center";
  title.style.justifyContent = "space-between";
  title.style.gap = "10px";

  const h = document.createElement("div");
  h.innerHTML = `<strong>AI Summary</strong>`;
  title.appendChild(h);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "×";
  btn.style.border = "none";
  btn.style.background = "transparent";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "18px";
  btn.style.lineHeight = "18px";
  btn.title = "Close";
  btn.addEventListener("click", () => {
    cardWrap.style.display = "none";
  });
  title.appendChild(btn);

  const body = document.createElement("div");
  body.id = "ai-summary-content";
  body.style.marginTop = "10px";
  body.style.fontSize = "14px";
  body.style.lineHeight = "1.35";

  cardWrap.appendChild(title);
  cardWrap.appendChild(body);

  if (headerBox && headerBox.parentNode) {
    headerBox.parentNode.insertBefore(cardWrap, headerBox.nextSibling);
  } else {
    sidebar.prepend(cardWrap);
  }

  card = cardWrap;
  content = body;
  return { card, content };
}

function showAI(title, html) {
  const { card, content } = ensureAICard();
  if (!card || !content) return;

  card.style.display = "block";
  content.innerHTML = `<div style="font-weight:600; margin-bottom:8px;">${title}</div>${html}`;
}

function escapeHTML(s) {
  return norm(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Optional: prevent spamming the server if /analyze is broken
let aiDisabled = false;

async function fetchAISummary({ source, name, address }) {
  if (aiDisabled) return "AI summary unavailable.";

  try {
    const res = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        restaurantName: name,
        address: address || "",
      }),
    });

    if (!res.ok) {
      // Disable if server is consistently failing
      if (res.status >= 500) aiDisabled = true;
      let text = "";
      try {
        text = await res.text();
      } catch {}
      console.warn("/analyze failed:", res.status, text.slice(0, 200));
      return `AI summary unavailable (server returned ${res.status}).`;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      return "AI summary unavailable (invalid response).";
    }

    const analysis = json?.analysis ?? "";
    return analysis ? analysis : "(No analysis returned.)";
  } catch (e) {
    console.warn("Could not reach /analyze:", e);
    aiDisabled = true;
    return "AI summary unavailable (could not reach server).";
  }
}

/* ---------------- Rendering helpers ---------------- */

function attachMarker(marker, item, sourceTag) {
  marker.addListener("mouseover", () => {
    if (!infoWindowRef) return;
    const html = `
      <div style="min-width:220px;">
        <strong>${escapeHTML(item.name)}</strong><br>
        ${escapeHTML(item.address || "N/A")}
      </div>
    `;
    infoWindowRef.setContent(html);
    infoWindowRef.open(mapRef, marker);
  });

  marker.addListener("mouseout", () => {
    if (infoWindowRef) infoWindowRef.close();
  });

  marker.addListener("click", async () => {
    if (infoWindowRef) {
      const html = `
        <div style="min-width:220px;">
          <strong>${escapeHTML(item.name)}</strong><br>
          ${escapeHTML(item.address || "N/A")}<br>
          ${item.review ? `<small>${escapeHTML(item.review)}</small>` : ""}
        </div>
      `;
      infoWindowRef.setContent(html);
      infoWindowRef.open(mapRef, marker);
    }

    showAI(escapeHTML(item.name), `<em>Loading…</em>`);
    const analysis = await fetchAISummary({
      source: sourceTag,
      name: item.name,
      address: item.address,
    });
    showAI(escapeHTML(item.name), `<div>${escapeHTML(analysis).replaceAll("\n", "<br>")}</div>`);
  });
}

function renderList(items, sourceTag) {
  const list = document.getElementById("restaurantList");
  if (!list) return;

  list.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "restaurant-item";
    div.innerHTML = `
      <strong>${escapeHTML(item.name)}</strong><br>
      ${item.address ? `${escapeHTML(item.address)}<br>` : ""}
      ${item.number ? `Phone: ${escapeHTML(item.number)}` : ""}
    `;

    div.addEventListener("click", async () => {
      if (!mapRef) return;

      const pos = { lat: item.lat, lng: item.lng };
      if (Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
        mapRef.panTo(pos);
        mapRef.setZoom(Math.max(mapRef.getZoom() ?? 13, 15));
      }

      showAI(escapeHTML(item.name), `<em>Loading…</em>`);
      const analysis = await fetchAISummary({
        source: sourceTag,
        name: item.name,
        address: item.address,
      });
      showAI(escapeHTML(item.name), `<div>${escapeHTML(analysis).replaceAll("\n", "<br>")}</div>`);
    });

    list.appendChild(div);
  });
}

function renderMarkers(items, markerStore, sourceTag) {
  clearAllMarkers();
  items.forEach((item) => {
    const m = item.toGoogleMarker(mapRef);
    attachMarker(m, item, sourceTag);
    markerStore.push(m);
  });
  renderList(items, sourceTag);
}

/* ---------------- Loaders ---------------- */

async function loadFood() {
  if (loadedFood) return;

  try {
    await loadSnapIndex();
  } catch {
    console.warn("SNAP CSV not loaded (continuing).");
  }

  const res = await fetch(BOSTON_URL);
  const data = await res.json();

  const recs = data?.result?.records ?? [];
  foodItems = recs
    .map((r) => {
      const lat = Number(r.latitude);
      const lng = Number(r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return new Restaurants({
        name: r.businessname ?? "Restaurant",
        lat,
        lng,
        address: `${r.address ?? ""} ${r.city ?? ""}, ${r.state ?? ""} ${r.zip ?? ""}`.trim(),
        number: r.dayphn_cleaned ?? "N/A",
        review: r.descript ?? "",
        hours: "Hours not listed",
        takeEbt: checkSnap(r.businessname, r.zip),
      });
    })
    .filter(Boolean);

  loadedFood = true;
}

async function loadRetail() {
  if (loadedRetail) return;

  const feats = await loadGeoJSON(GEO.supermarkets);
  retailItems = feats
    .map((f) => {
      const ll = toLatLng(f);
      if (!ll) return null;
      const p = f.properties || {};
      return new Market({
        name: p.name || "Supermarket",
        lat: ll.lat,
        lng: ll.lng,
        address: buildOsmAddress(p) || "N/A",
        number: p.phone || "N/A",
        review: p.shop || "Supermarket",
        hours: p.opening_hours || "Hours not listed",
      });
    })
    .filter(Boolean);

  loadedRetail = true;
}

async function loadWholesale() {
  if (loadedWholesale) return;

  const [prod, local, banks, pantries] = await Promise.all([
    loadGeoJSON(GEO.producers),
    loadGeoJSON(GEO.localMarkets),
    loadGeoJSON(GEO.banks),
    loadGeoJSON(GEO.pantries),
  ]);

  const pantryIds = new Set(
    [...banks, ...pantries].map((f) => f?.properties?.["@id"]).filter(Boolean)
  );

  wholesaleItems = [...prod, ...local]
    .filter((f) => {
      const p = f.properties || {};
      if (p["@id"] && pantryIds.has(p["@id"])) return false;
      if (p.amenity === "social_facility") return false;
      if (p.social_facility === "food_bank" || p.social_facility === "food_pantry") return false;
      const n = lower(p.name);
      if (n.includes("food pantry") || n.includes("food bank")) return false;
      return true;
    })
    .map((f) => {
      const ll = toLatLng(f);
      if (!ll) return null;
      const p = f.properties || {};
      return new Market({
        name: p.name || "Wholesale",
        lat: ll.lat,
        lng: ll.lng,
        address: buildOsmAddress(p) || "N/A",
        number: p.phone || "N/A",
        review: p.craft || p.shop || p.amenity || "Wholesale",
        hours: p.opening_hours || "Hours not listed",
      });
    })
    .filter(Boolean);

  loadedWholesale = true;
}

async function loadFarms() {
  if (loadedFarms) return;

  const [banks, pantries] = await Promise.all([
    loadGeoJSON(GEO.banks),
    loadGeoJSON(GEO.pantries),
  ]);

  farmItems = [...banks, ...pantries]
    .map((f) => {
      const ll = toLatLng(f);
      if (!ll) return null;
      const p = f.properties || {};
      return new Pantry({
        name: p.name || "Food Pantry",
        lat: ll.lat,
        lng: ll.lng,
        address: buildOsmAddress(p) || "N/A",
        number: p.phone || "N/A",
        review: p.social_facility || p.amenity || "Food Pantry",
        hours: p.opening_hours || "Hours not listed",
      });
    })
    .filter(Boolean);

  loadedFarms = true;
}

/* ---------------- Category Rendering ---------------- */

async function renderCategory(cat) {
  currentCategory = cat;

  if (cat === "food") {
    await loadFood();
    foodFiltered = filterItems(foodItems, currentQuery);
    renderMarkers(foodFiltered, foodMarkers, "boston");
    return;
  }

  if (cat === "retail") {
    await loadRetail();
    retailFiltered = filterItems(retailItems, currentQuery);
    renderMarkers(retailFiltered, retailMarkers, "retail");
    return;
  }

  if (cat === "wholesale") {
    await loadWholesale();
    wholesaleFiltered = filterItems(wholesaleItems, currentQuery);
    renderMarkers(wholesaleFiltered, wholesaleMarkers, "wholesale");
    return;
  }

  if (cat === "farm") {
    await loadFarms();
    farmFiltered = filterItems(farmItems, currentQuery);
    renderMarkers(farmFiltered, farmMarkers, "farm");
    return;
  }
}

/* ---------------- Public API ---------------- */

export function attachMap(map, infoWindow) {
  mapRef = map;
  infoWindowRef = infoWindow;

  // ensure AI card exists early so you can see it immediately on click
  ensureAICard();
}

export async function setCategory(cat) {
  currentQuery = "";
  const input = document.getElementById("searchBar");
  if (input) input.value = "";
  await renderCategory(cat);
}

export async function applySearch(q) {
  currentQuery = q || "";
  await renderCategory(currentCategory);
}

export async function sortCurrent(_type, order) {
  // datasets don't have real price/rating => keep UI behavior by sorting name
  if (currentCategory === "food") {
    sortByName(foodFiltered, order);
    renderMarkers(foodFiltered, foodMarkers, "boston");
  }
  if (currentCategory === "retail") {
    sortByName(retailFiltered, order);
    renderMarkers(retailFiltered, retailMarkers, "retail");
  }
  if (currentCategory === "wholesale") {
    sortByName(wholesaleFiltered, order);
    renderMarkers(wholesaleFiltered, wholesaleMarkers, "wholesale");
  }
  if (currentCategory === "farm") {
    sortByName(farmFiltered, order);
    renderMarkers(farmFiltered, farmMarkers, "farm");
  }
}

export function clearAll() {
  clearAllMarkers();
}