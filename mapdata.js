import { Restaurants } from "./markers.js";

// Fetch Boston food establishments
fetch("https://data.boston.gov/api/3/action/datastore_search?resource_id=f1e13724-284d-478c-b8bc-ef042aa5b70b&limit=5000")
  .then(response => response.json())
  .then(data => {
    const records = data.result.records;

    records.forEach(place => {

      // ✅ FIX 1: lowercase fields (Boston API uses lowercase)
      const lat = Number(place.latitude);
      const lng = Number(place.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      // ✅ Minimal translation into your class
      const restaurant = new Restaurants({
        name: place.businessname ?? "Restaurant",
        lat,
        lng,
        address: `${place.address ?? ""} ${place.city ?? ""}, ${place.state ?? ""} ${place.zip ?? ""}`.trim(),
        number: place.dayphn_cleaned ?? "N/A",
        review: place.descript ?? "No description",
        meta: {
          licstatus: place.licstatus,
          licensecat: place.licensecat,
          property_id: place.property_id
        }
      });

      // ✅ Use your class to create marker
      restaurant.toGoogleMarker(window.map);
    });
  })
  .catch(error => console.error("Error fetching data:", error));