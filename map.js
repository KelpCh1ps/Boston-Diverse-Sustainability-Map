import { loadSnapIndex } from "./snapMatcher.js";

let map;
let markers = [];

// Boston coordinates
const bostonCenter = { lat: 42.3601, lng: -71.0589 };

// Define Boston area bounds (Greater Boston region)
const bostonBounds = {
    north: 42.5,
    south: 42.2,
    east: -70.8,
    west: -71.3
};

async function initMap() {

    await loadSnapIndex();

    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    // Create map with clean, minimalist styling
    map = new google.maps.Map(document.getElementById("map"), {
        center: bostonCenter,
        zoom: 13,
        mapId: "1907e1268c94d0034153c21a",
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        restriction: {
            latLngBounds: bostonBounds,
            strictBounds: false
        }
    });

    // Add initial marker
    const marker = new AdvancedMarkerElement({
        map: map,
        position: bostonCenter,
        title: "Boston Center"
    });

    markers.push(marker);
    window.map = map;
}

// Initialize map when page loads
document.addEventListener("DOMContentLoaded", initMap);