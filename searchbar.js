// Search functionality with Places API
async function initSearch() {
    // Wait for map to be initialized
    let attempts = 0;
    while (!window.map && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!window.map) {
        console.error("Map not initialized");
        return;
    }

    const { PlacesService } = await google.maps.importLibrary("places");
    const input = document.getElementById("pac-input");
    
    // Define Boston area bounds for search
    const bostonBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(42.2, -71.3), // southwest
        new google.maps.LatLng(42.5, -70.8)  // northeast
    );
    
    const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ["establishment", "geocode"],
        bounds: bostonBounds,
        strictBounds: true,
        componentRestrictions: { country: "us" },
    });

    autocomplete.bindTo("bounds", window.map);

    let searchMarkers = [];

    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            console.log("Place has no geometry");
            return;
        }

        // Verify location is within Boston bounds
        const location = place.geometry.location;
        const lat = location.lat();
        const lng = location.lng();
        
        if (lat < 42.2 || lat > 42.5 || lng < -71.3 || lng > -70.8) {
            input.value = "";
            alert("Please search for locations within the Boston area.");
            return;
        }

        // Clear previous search markers
        searchMarkers.forEach(marker => marker.setMap(null));
        searchMarkers = [];

        // Create marker for search result
        const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
        const marker = new AdvancedMarkerElement({
            map: window.map,
            position: place.geometry.location,
            title: place.name
        });

        searchMarkers.push(marker);

        // Center and zoom to location
        window.map.setCenter(place.geometry.location);
        window.map.setZoom(16);

        // Clear input after selection
        input.blur();
    });
}

// Initialize search when page loads
document.addEventListener("DOMContentLoaded", initSearch);
