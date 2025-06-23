import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';

@Component({
  selector: 'app-page2',
  imports: [],
  templateUrl: './page2.component.html',
  styleUrl: './page2.component.css'
})
export class Page2Component implements OnInit, AfterViewInit, OnChanges {

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  @Input() lat: number = 39.8283;
  @Input() lon: number = -98.5795;

  @Output() drawingsChanged = new EventEmitter<any>();

  map!: L.Map;
  marker!: L.Marker;
  dbMarkers: L.Marker[] = [];
  markers: any[] = [];
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw;

  public drawingsGeoJson: any = null;
  private boundaryPolygonLayer?: L.Polygon;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && (changes['lat'] || changes['lon'])) {
      this.map.setView([this.lat, this.lon], 14, { animate: true });
    }
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false
    }).setView([this.lat, this.lon], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Use only OpenStreetMap as the base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.initializeDrawing();
    this.loadPolygonBoundariesFromLocalStorage(); // Only load polygons as boundaries
  }

  private initializeDrawing(): void {
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    const createDrawControl = (enableMarker: boolean) => {
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
      }
      this.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          circle: false,
          circlemarker: false,
          marker: enableMarker ? {} : false, // Enable or disable marker tool
          polygon: false,
          polyline: false,
          rectangle: false
        },
        edit: {
          featureGroup: this.drawnItems,
          edit: false,
          remove: false
        }
      });
      this.map.addControl(this.drawControl);
    };

    // Enable marker tool initially if no marker exists
    const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    createDrawControl(!hasMarker);

    // Restrict marker placement to inside the polygon
    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      if (layer instanceof L.Marker && this.boundaryPolygonLayer) {
        const markerLatLng = layer.getLatLng();
        // Check if marker is inside the polygon
        if (
          !this.boundaryPolygonLayer.getBounds().contains(markerLatLng) ||
          !leafletPointInPolygon(markerLatLng, this.boundaryPolygonLayer)
        ) {
          alert('Marker must be placed inside the boundary.');
          return; // Do not add marker
        }
        // Save marker location to localStorage
        this.saveMarkerLocationToLocalStorage(layer);
        // Add marker to map
        this.drawnItems.addLayer(layer);
        this.saveDrawingsInApp();
        // Disable marker tool after placing one marker
        createDrawControl(false);
      } else if (!(layer instanceof L.Marker)) {
        this.drawnItems.addLayer(layer);
        this.saveDrawingsInApp();
      }
    });
  }

  // Load only polygon boundaries from localStorage and add to map
  private loadPolygonBoundariesFromLocalStorage(): void {
    const savedGeoJson = localStorage.getItem('leafletDrawings');
    if (savedGeoJson) {
      try {
        const geoJson = JSON.parse(savedGeoJson);
        // Filter only Polygon features
        const polygonFeatures = (geoJson.features || []).filter(
          (f: any) => f.geometry && f.geometry.type === 'Polygon'
        );
        // Create a new FeatureCollection with only polygons
        const polygonsGeoJson: FeatureCollection = {
          type: "FeatureCollection",
          features: polygonFeatures as Feature[]
        };
        this.drawingsGeoJson = polygonsGeoJson;
        const geoJsonLayer = L.geoJSON(polygonsGeoJson);
        geoJsonLayer.eachLayer((layer: any) => {
          this.drawnItems.addLayer(layer);
          // Save the first polygon as the boundary
          if (!this.boundaryPolygonLayer && layer instanceof L.Polygon) {
            this.boundaryPolygonLayer = layer;
          }
        });

        // If there is at least one polygon, move the map to its first coordinate
        if (polygonFeatures.length > 0) {
          const coords = polygonFeatures[0].geometry.coordinates[0][0]; // [lng, lat]
          if (Array.isArray(coords) && coords.length === 2) {
            this.map.setView([coords[1], coords[0]], 16); // [lat, lng], zoom 16
          }
        }

        // Fit map to the bounds of the polygons if any exist
        if (geoJsonLayer.getLayers().length > 0) {
          this.map.fitBounds(geoJsonLayer.getBounds());
        }
        this.emitDrawingsChanged();
      } catch (e) {
        console.error('Failed to load polygon boundaries:', e);
      }
    }
  }

  public resetDrawings(): void {
    this.drawnItems.clearLayers();
    localStorage.removeItem('leafletDrawings');
    this.drawingsGeoJson = null;
    if (this.map && this.drawnItems) {
      this.initializeDrawing();
    }
  }

  public saveDrawings(): void {
    if (this.drawnItems) {
      const geoJson = this.drawnItems.toGeoJSON();
      localStorage.setItem('leafletDrawings', JSON.stringify(geoJson));
    }
  }

  // Store drawings in application state (not localStorage)
  public saveDrawingsInApp(): void {
    if (this.drawnItems) {
      this.drawingsGeoJson = this.drawnItems.toGeoJSON();
      this.emitDrawingsChanged();
    }
  }

  public saveMarkerLocationToLocalStorage(marker: L.Marker): void {
    const markerLatLng = marker.getLatLng();
    const markerData = {
      lat: markerLatLng.lat,
      lng: markerLatLng.lng
    };
    localStorage.setItem('markerLocation', JSON.stringify(markerData));
  }

  private emitDrawingsChanged() {
    this.drawingsChanged.emit(this.drawingsGeoJson);
  }
}

// Point-in-polygon helper
function leafletPointInPolygon(latlng: L.LatLng, polygon: L.Polygon): boolean {
  const poly = polygon.getLatLngs()[0] as L.LatLng[];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng;
    const xj = poly[j].lat, yj = poly[j].lng;
    const intersect = ((yi > latlng.lng) !== (yj > latlng.lng)) &&
      (latlng.lat < (xj - xi) * (latlng.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

