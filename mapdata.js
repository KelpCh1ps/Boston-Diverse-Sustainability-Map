// mapdata.js
import { Restaurants } from "./markers.js";
import { checkSnap } from "./snapMatcher.js";

let classRestaurants = [];
let classRestaurantMarkers = [];
let loaded = false;

function getMapInstance() {
  // index.html uses a "let map;" in script; mapdata.js can't see it directly.
  // But it IS on window in most setups only if you set window.map.
  // We'll support both patterns:
  return window.map || window.__map || null;
}

async function waitForMap(maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const m = getMapInstance();
    if (m) return m;
    await new Promise((r) => setTimeout(r, 100));
  }
  console.warn("[mapdata] Map not found on window.map (or window.__map).");
  return null;
}

function clearSidebar() {
  if (typeof window.clearSidebarDetails === "function") {
    window.clearSidebarDetails();
  }
}

function showRestaurantDetails(r) {
  const panel = document.getElementById("placeDetailsPanel");
  if (!panel) return;

  panel.innerHTML = `
    <h3 class="place-details-title">${r.name}</h3>
    <div class="place-details-meta"><strong>Address:</strong> ${r.address || "N/A"}</div>
    <div class="place-details-meta"><strong>Phone:</strong> ${r.number || "N/A"}</div>
    <div class="place-details-meta"><strong>EBT:</strong> ${r.takeEbt ? "Accepts SNAP" : "No SNAP"}</div>
    ${
      r.review
        ? `<div class="place-details-meta"><strong>Description:</strong> ${r.review}</div>`
        : ""
    }
  `;
}

async function loadClassRestaurants() {
  if (loaded) return classRestaurants;

  const url =
    "https://data.boston.gov/api/3/action/datastore_search?resource_id=f1e13724-284d-478c-b8bc-ef042aa5b70b&limit=5000";

  const response = await fetch(url);
  const data = await response.json();
  const records = data?.result?.records || [];

  classRestaurants = records
    .map((place) => {
      const lat = Number(place.latitude);
      const lng = Number(place.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const takesSnap = checkSnap(place.businessname, place.zip);

      return new Restaurants({
        name: place.businessname ?? "Restaurant",
        lat,
        lng,
        address: `${place.address ?? ""} ${place.city ?? ""}, ${place.state ?? ""} ${place.zip ?? ""}`.trim(),
        number: place.dayphn_cleaned ?? "N/A",
        review: place.descript ?? "",
        takeEbt: takesSnap,
        meta: {
          licstatus: place.licstatus,
          licensecat: place.licensecat,
          property_id: place.property_id,
        },
      });
    })
    .filter(Boolean);

  loaded = true;
  return classRestaurants;
}

function clearClassRestaurantMarkers() {
  classRestaurantMarkers.forEach((m) => m.setMap(null));
  classRestaurantMarkers = [];
}

async function renderClassRestaurants() {
  const map = await waitForMap();
  if (!map) return;

  await loadClassRestaurants();

  // Remove previous class markers (if any) before drawing again
  clearClassRestaurantMarkers();
  clearSidebar();

  classRestaurants.forEach((r) => {
    const marker = r.toGoogleMarker(map);

    marker.addListener("mouseover", () => showRestaurantDetails(r));
    marker.addListener("mouseout", () => clearSidebar());
    marker.addListener("click", () => showRestaurantDetails(r));

    classRestaurantMarkers.push(marker);
  });
}

// expose to index.html
window.renderClassRestaurants = renderClassRestaurants;
window.clearClassRestaurants = function clearClassRestaurants() {
  clearClassRestaurantMarkers();
  clearSidebar();
};

// OPTIONAL: if you want restaurants to show by default on load (since activeCategory starts as "food")
document.addEventListener("DOMContentLoaded", () => {
  // don’t force it if you change default category later
  renderClassRestaurants();
});