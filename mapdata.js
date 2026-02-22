// Fetch Boston food establishments and add markers to an existing Google Map
fetch("https://data.boston.gov/api/3/action/datastore_search?resource_id=f1e13724-284d-478c-b8bc-ef042aa5b70b&limit=5000")
  .then(response => response.json())
  .then(data => {
    const records = data.result.records;

    records.forEach(place => {
      const name = place.BUSINESSNAME;
      const address = place.ADDRESS;
      const city = place.CITY;
      const lat = parseFloat(place.LATITUDE);
      const lng = parseFloat(place.LONGITUDE);

      // Only add markers if coordinates exist
      if (!isNaN(lat) && !isNaN(lng)) {
        const marker = new google.maps.Marker({
          position: { lat: lat, lng: lng },
          map: map,        // assumes your existing map variable is called 'map'
          title: name
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<strong>${name}</strong><br>${address}<br>${city}`
        });

        marker.addListener("click", () => {
          infoWindow.open(map, marker);
        });
      }
    });
  })
  .catch(error => console.error("Error fetching data:", error));