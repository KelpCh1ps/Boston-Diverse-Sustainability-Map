// markers.js
export class Marker {
  constructor({ name = "Marker", lat = 0, lng = 0 } = {}) {
    this.name = name;
    this.lat = Number(lat);
    this.lng = Number(lng);
  }

  // Default = Google red marker
  getIcon() {
    return null;
  }

  toGoogleMarker(map) {
    const icon = this.getIcon();

    return new google.maps.Marker({
      position: { lat: this.lat, lng: this.lng },
      map,
      title: this.name,
      ...(icon && {
        icon: {
          url: icon,
          scaledSize: new google.maps.Size(35, 35),
        },
      }),
    });
  }
}

export class Restaurants extends Marker {
  constructor({
    name = "Restaurant",
    lat = 0,
    lng = 0,
    address = "Address not available",
    number = "N/A",
    rating = 0,
    review = "No reviews",
    hours = "Hours not listed",
    takeEbt = false,
    meta = {},
  } = {}) {
    super({ name, lat, lng });
    this.address = address;
    this.number = number;
    this.rating = rating;
    this.review = review;
    this.hours = hours;
    this.takeEbt = takeEbt;
    this.meta = meta;
  }

  getIcon() {
    return new URL("./icons/restaurant_logo.png", import.meta.url).href;
  }
}

export class Market extends Marker {
  constructor({
    name = "Market",
    lat = 0,
    lng = 0,
    address = "Address not available",
    number = "N/A",
    rating = 0,
    review = "No reviews",
    hours = "Hours not listed",
    takeEbt = false,
    meta = {},
  } = {}) {
    super({ name, lat, lng });
    this.address = address;
    this.number = number;
    this.rating = rating;
    this.review = review;
    this.hours = hours;
    this.takeEbt = takeEbt;
    this.meta = meta;
  }

  getIcon() {
    return new URL("./icons/Market_Logo.png", import.meta.url).href;
  }
}

export class Pantry extends Restaurants {
  constructor({
    name = "Pantry",
    lat = 0,
    lng = 0,
    address = "Address not available",
    number = "N/A",
    rating = 0,
    review = "No reviews",
    hours = "Hours not listed",
    eligibility = "Eligibility not specified",
    meta = {},
  } = {}) {
    super({ name, lat, lng, address, number, rating, review, hours, meta });
    this.eligibility = eligibility;
  }

  getIcon() {
    return new URL("./icons/Food_Pantry_Logo.png", import.meta.url).href;
  }
}
