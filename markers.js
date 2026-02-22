export class Marker {
    constructor(name, lat, lng) {
        this.name = name;
        this.lat = lat;
        this.lng = lng;
    }


toGoogleMarker(map) {
    return new google.maps.Marker({
      position: { lat: this.lat, lng: this.lng },
      map,
      title: this.name,
    });
}
}

export class Restaurants extends Marker {
    constructor(name, lat, lng, address, number, rating, review, hours) {
        super(name, lat, lng);
        this.address = address;
        this.number = number;
        this.rating = rating;
        this.review = review;
        this.hours = hours;
    }
}

export class Market extends Marker {
    constructor(name, lat, lng, address, number, rating, review, hours, takeEbt) {
        super(name, lat, lng);
        this.address = address;
        this.number = number;
        this.rating = rating;
        this.review = review;
        this.hours = hours;
        this.takeEbt = takeEbt;
    }
}

export class Pantry extends Restaurants {
    constructor(name, lat, lng, address, number, rating, review, hours, eligibility) {
        super(name, lat, lng, address, number, rating, review, hours);
        this.eligibility  = eligibility;
    }
}

