// mapdata.js
// All marker processing for:
// - Food (Boston restaurants dataset)
// - Retail + Wholesale (our Market markers from food_producers + local_markets)
// - Farm (our Pantry markers from food_banks + food_pantries)
// Keeps UI controlled by index.html.

import { Restaurants, Market, Pantry } from "./markers.js";
import { checkSnap, loadSnapIndex } from "./snapmatch.js";

const BOSTON_URL =
  "https://data.boston.gov/api/3/action/datastore_search?resource_id=f1e13724-284d-478c-b8bc-ef042aa5b70b&limit=5000";

const GEO = {
  producers: "food_producers.geojson",
  localMarkets: "local_markets.geojson",
  banks: "food_banks.geojson",
  pantries: "food_pantries.geojson",
};

let mapRef = null;
let infoWindowRef = null;

let currentCategory = "food"; // food | retail | wholesale | farm
let currentQuery = "";

let loadedFood = false;
let loadedMarkets = false;
let loadedFarms = false;

let foodItems = [];
let marketItems = [];
let farmItems = [];

let foodFiltered = [];
let marketFiltered = [];
let farmFiltered = [];

let foodMarkers = [];
let marketMarkers = [];
let farmMarkers = [];

function norm(v) {
  return (v ?? "").toString().trim();
}
function lower(v) {
  return norm(v).toLowerCase();
}

function getListEl() {
  return document.getElementById("restaurantList");
}

function getAICardEls() {
  return {
    card: document.getElementById("ai-summary-card"),
    content: document.getElementById("ai-summary-content"),
  };
}

function showAICard(title, html) {
  const { card, content } = getAICardEls();
  if (!card || !content) return;
  card.style.display = "block";
  content.innerHTML = `<strong>${title}</strong><br><br>${html}`;
}

async function fetchAISummary({ source, name, address }) {
  // Avoid spamming a failing backend: if it errors once, disable further calls.
  if (fetchAISummary._disabled) {
    return "AI summary unavailable (AI backend not configured).";
  }

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
      let errText = "";
      try {
        errText = await res.text();
      } catch {
        // ignore
      }
      console.warn("/analyze returned", res.status, errText);
      fetchAISummary._disabled = true;
      return `AI summary unavailable (server returned ${res.status}).`;
    }

    let result = null;
    try {
      result = await res.json();
    } catch {
      console.warn("/analyze returned non-JSON response");
      fetchAISummary._disabled = true;
      return "AI summary unavailable (invalid server response).";
    }

    return result?.analysis ?? "(No analysis returned.)";
  } catch (err) {
    console.error(err);
    fetchAISummary._disabled = true;
    return "AI summary unavailable (could not reach /analyze).";
  }
}

function closeInfoWindow() {
  if (infoWindowRef) infoWindowRef.close();
}

function clearMarkers(arr) {
  arr.forEach((m) => m.setMap(null));
  arr.length = 0;
}

function clearAllMarkers() {
  clearMarkers(foodMarkers);
  clearMarkers(marketMarkers);
  clearMarkers(farmMarkers);
  closeInfoWindow();
}

function buildOsmAddress(props = {}) {
  const hn = norm(props["addr:housenumber"]);
  const st = norm(props["addr:street"]);
  const city = norm(props["addr:city"]);
  const state = norm(props["addr:state"]);
  const zip = norm(props["addr:postcode"]);

  const line1 = [hn, st].filter(Boolean).join(" ");
  const line2 = [city, state].filter(Boolean).join(", ");
  const line3 = zip;

  return [line1, [line2, line3].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

// ---- NEW: ZIP extraction for SNAP/EBT matching ----
function zipFromProps(props = {}, addressStr = "") {
  const direct =
    norm(props["addr:postcode"]) ||
    norm(props.postcode) ||
    norm(props.zip) ||
    norm(props["addr:zip"]);

  if (direct) {
    const m = direct.match(/\b(\d{5})(?:-\d{4})?\b/);
    return m ? m[1] : "";
  }

  const m2 = norm(addressStr).match(/\b(\d{5})(?:-\d{4})?\b/);
  return m2 ? m2[1] : "";
}

async function loadGeoJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const gj = await res.json();
  return Array.isArray(gj?.features) ? gj.features : [];
}

function toLatLng(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function buildInfoHTML(item) {
  const name = norm(item.name) || "Place";
  const addr = norm(item.address) || "N/A";
  const phone = norm(item.number) || "N/A";
  const hours = norm(item.hours) || "";
  const desc = norm(item.review) || "";

  const hasEbt = typeof item.takeEbt === "boolean";
  const ebtLine = hasEbt ? `EBT/SNAP: ${item.takeEbt ? "Yes" : "No"}<br>` : "";

  return `
    <div style="min-width:220px;">
      <strong>${name}</strong><br>
      ${addr ? `${addr}<br>` : ""}
      ${phone ? `Phone: ${phone}<br>` : ""}
      ${hours ? `Hours: ${hours}<br>` : ""}
      ${ebtLine}
      ${desc ? `<small>${desc}</small>` : ""}
    </div>
  `;
}

function attachMarkerInteractions(marker, item, sourceTag) {
  marker.addListener("mouseover", () => {
    if (!infoWindowRef) return;
    infoWindowRef.setContent(buildInfoHTML(item));
    infoWindowRef.open(mapRef, marker);
  });
  marker.addListener("mouseout", () => closeInfoWindow());

  marker.addListener("click", async () => {
    if (infoWindowRef) {
      infoWindowRef.setContent(buildInfoHTML(item));
      infoWindowRef.open(mapRef, marker);
    }

    showAICard(item.name, "Loading AI summary...");
    const analysis = await fetchAISummary({
      source: sourceTag,
      name: item.name,
      address: item.address,
    });
    showAICard(item.name, analysis);
  });
}

function renderList(items) {
  const list = getListEl();
  if (!list) return;

  list.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "restaurant-item";

    const name = norm(item.name) || "Place";
    const addr = norm(item.address);
    const phone = norm(item.number);
    const hasEbt = typeof item.takeEbt === "boolean";

    div.innerHTML = `
      <strong>${name}</strong><br>
      ${addr ? `${addr}<br>` : ""}
      ${phone ? `Phone: ${phone}<br>` : ""}
      ${hasEbt ? `EBT/SNAP: ${item.takeEbt ? "Yes" : "No"}` : ""}
    `;

    div.addEventListener("click", () => {
      if (!mapRef) return;
      const pos = { lat: item.lat, lng: item.lng };
      if (Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
        mapRef.panTo(pos);
        mapRef.setZoom(Math.max(mapRef.getZoom() ?? 13, 15));
      }

      showAICard(item.name, "Loading AI summary...");
      fetchAISummary({
        source:
          currentCategory === "food"
            ? "boston"
            : currentCategory === "farm"
              ? "pantry"
              : "market",
        name: item.name,
        address: item.address,
      }).then((analysis) => showAICard(item.name, analysis));
    });

    list.appendChild(div);
  });
}

function filterItems(items, q) {
  if (!q) return [...items];
  const query = lower(q);
  return items.filter((it) => {
    const hay = lower(
      `${it.name} ${it.address ?? ""} ${it.number ?? ""} ${it.review ?? ""} ${it.hours ?? ""}`
    );
    return hay.includes(query);
  });
}

function sortItemsByName(items, order) {
  const dir = order === "asc" ? 1 : -1;
  items.sort((a, b) => dir * norm(a.name).localeCompare(norm(b.name)));
}

function buildBostonAddress(place) {
  return `${place.address ?? ""} ${place.city ?? ""}, ${place.state ?? ""} ${place.zip ?? ""}`.trim();
}

async function loadFoodIfNeeded() {
  if (loadedFood) return;

  try {
    await loadSnapIndex();
  } catch (e) {
    console.warn("SNAP index failed to load; continuing without SNAP matching.", e);
  }

  const res = await fetch(BOSTON_URL);
  const data = await res.json();
  const records = data?.result?.records ?? [];

  foodItems = records
    .map((place) => {
      const lat = Number(place.latitude);
      const lng = Number(place.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const takesSnap = checkSnap(place.businessname, place.zip);

      return new Restaurants({
        name: place.businessname ?? "Restaurant",
        lat,
        lng,
        address: buildBostonAddress(place),
        number: place.dayphn_cleaned ?? "N/A",
        rating: 0,
        review: place.descript ?? "No description",
        hours: "Hours not listed",
        takeEbt: takesSnap,
        meta: {
          licstatus: place.licstatus,
          licensecat: place.licensecat,
          property_id: place.property_id,
        },
      });
    })
    .filter(Boolean);

  foodFiltered = [...foodItems];
  loadedFood = true;
}

async function loadMarketsIfNeeded() {
  if (loadedMarkets) return;

  // ---- NEW: load SNAP index for Market markers too ----
  try {
    await loadSnapIndex();
  } catch (e) {
    console.warn("SNAP index failed to load; continuing without SNAP matching.", e);
  }

  const [prod, local] = await Promise.all([
    loadGeoJSON(GEO.producers),
    loadGeoJSON(GEO.localMarkets),
  ]);

  const features = [...prod, ...local];

  marketItems = features
    .map((f) => {
      const ll = toLatLng(f);
      if (!ll) return null;

      const p = f?.properties ?? {};
      const name = norm(p.name) || "Market";
      const address = buildOsmAddress(p) || "N/A";
      const phone = norm(p.phone) || "N/A";
      const hours = norm(p.opening_hours) || "Hours not listed";

      const kind = norm(p.craft || p.shop || p.amenity || p.building || p.type);
      const website = norm(p.website);

      const review = [
        kind && `Type: ${kind}`,
        website && `Website: ${website}`,
      ]
        .filter(Boolean)
        .join(" • ");

      // ---- NEW: scrape EBT/SNAP into existing Market markers ----
      const zip = zipFromProps(p, address);
      const takesSnap = zip ? checkSnap(name, zip) : false;

      return new Market({
        name,
        lat: ll.lat,
        lng: ll.lng,
        address,
        number: phone,
        rating: 0,
        review: review || "",
        hours,
        takeEbt: takesSnap,
        meta: { ...p, zip },
      });
    })
    .filter(Boolean);

  marketFiltered = [...marketItems];
  loadedMarkets = true;
}

async function loadFarmsIfNeeded() {
  if (loadedFarms) return;

  const [banks, pantries] = await Promise.all([
    loadGeoJSON(GEO.banks),
    loadGeoJSON(GEO.pantries),
  ]);

  const features = [...banks, ...pantries];

  farmItems = features
    .map((f) => {
      const ll = toLatLng(f);
      if (!ll) return null;

      const p = f?.properties ?? {};
      const name = norm(p.name) || "Food Pantry";
      const address = buildOsmAddress(p) || "N/A";
      const phone = norm(p.phone) || "N/A";
      const hours = norm(p.opening_hours) || "Hours not listed";

      const kind = norm(p.social_facility || p.amenity);
      const operator = norm(p.operator);

      const review = [
        kind && `Type: ${kind}`,
        operator && `Operator: ${operator}`,
      ]
        .filter(Boolean)
        .join(" • ");

      return new Pantry({
        name,
        lat: ll.lat,
        lng: ll.lng,
        address,
        number: phone,
        rating: 0,
        review: review || "",
        hours,
        eligibility: "Eligibility not specified",
        meta: p,
      });
    })
    .filter(Boolean);

  farmFiltered = [...farmItems];
  loadedFarms = true;
}

function renderFood() {
  clearAllMarkers();
  foodFiltered.forEach((item) => {
    const marker = item.toGoogleMarker(mapRef);
    attachMarkerInteractions(marker, item, "boston");
    foodMarkers.push(marker);
  });
  renderList(foodFiltered);
}

function renderMarkets() {
  clearAllMarkers();
  marketFiltered.forEach((item) => {
    const marker = item.toGoogleMarker(mapRef);
    attachMarkerInteractions(marker, item, "market");
    marketMarkers.push(marker);
  });
  renderList(marketFiltered);
}

function renderFarms() {
  clearAllMarkers();
  farmFiltered.forEach((item) => {
    const marker = item.toGoogleMarker(mapRef);
    attachMarkerInteractions(marker, item, "pantry");
    farmMarkers.push(marker);
  });
  renderList(farmFiltered);
}

async function renderCategory(category) {
  if (!mapRef) return;

  currentCategory = category;

  if (category === "food") {
    await loadFoodIfNeeded();
    foodFiltered = filterItems(foodItems, currentQuery);
    renderFood();
    return;
  }

  // Retail + Wholesale both use our Market markers
  if (category === "retail" || category === "wholesale") {
    await loadMarketsIfNeeded();
    marketFiltered = filterItems(marketItems, currentQuery);
    renderMarkets();
    return;
  }

  if (category === "farm") {
    await loadFarmsIfNeeded();
    farmFiltered = filterItems(farmItems, currentQuery);
    renderFarms();
    return;
  }
}

// ---- Public API ----
export function attachMap(map, infoWindow) {
  mapRef = map;
  infoWindowRef = infoWindow;
}

export async function setCategory(category) {
  currentQuery = "";
  const input = document.getElementById("searchBar");
  if (input) input.value = "";
  await renderCategory(category);
}

export async function applySearch(query) {
  currentQuery = query ?? "";
  await renderCategory(currentCategory);
}

export async function sortCurrent(_type, order) {
  // Datasets don't have reliable price/rating; keep UI by sorting by name.
  if (currentCategory === "food") {
    sortItemsByName(foodFiltered, order);
    renderFood();
    return;
  }

  if (currentCategory === "retail" || currentCategory === "wholesale") {
    sortItemsByName(marketFiltered, order);
    renderMarkets();
    return;
  }

  if (currentCategory === "farm") {
    sortItemsByName(farmFiltered, order);
    renderFarms();
    return;
  }
}

export function clearAll() {
  clearAllMarkers();
}