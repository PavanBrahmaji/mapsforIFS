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
    this.loadMarkerFromLocalStorage(); // Load saved marker if exists
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
        // Make marker draggable
        this.makeMarkerDraggable(layer);
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

  // Make marker draggable and handle drag events
  private makeMarkerDraggable(marker: L.Marker): void {
    marker.options.draggable = true;
    marker.dragging?.enable();

    // Handle drag start
    marker.on('dragstart', (e) => {
      console.log('Marker drag started');
    });

    // Handle drag
    marker.on('drag', (e) => {
      const draggedMarker = e.target as L.Marker;
      const newLatLng = draggedMarker.getLatLng();
      
      // Optional: Show coordinates while dragging
      console.log(`Dragging to: ${newLatLng.lat.toFixed(6)}, ${newLatLng.lng.toFixed(6)}`);
    });

    // Handle drag end - validate position and save
    marker.on('dragend', (e) => {
      const draggedMarker = e.target as L.Marker;
      const newLatLng = draggedMarker.getLatLng();
      
      // Check if new position is still inside the polygon boundary
      if (this.boundaryPolygonLayer) {
        if (
          !this.boundaryPolygonLayer.getBounds().contains(newLatLng) ||
          !leafletPointInPolygon(newLatLng, this.boundaryPolygonLayer)
        ) {
          alert('Marker must stay inside the boundary. Moving back to previous position.');
          // Revert to previous position (you could store the last valid position)
          const savedMarker = this.getSavedMarkerLocation();
          if (savedMarker) {
            draggedMarker.setLatLng([savedMarker.lat, savedMarker.lng]);
          }
          return;
        }
      }
      
      // Save new position
      this.saveMarkerLocationToLocalStorage(draggedMarker);
      this.saveDrawingsInApp();
      console.log(`Marker moved to: ${newLatLng.lat.toFixed(6)}, ${newLatLng.lng.toFixed(6)}`);
    });
  }

  // Load marker from localStorage if it exists
  private loadMarkerFromLocalStorage(): void {
    const savedMarkerData = this.getSavedMarkerLocation();
    if (savedMarkerData && this.boundaryPolygonLayer) {
      const markerLatLng = L.latLng(savedMarkerData.lat, savedMarkerData.lng);
      
      // Verify the saved marker is still within bounds
      if (
        this.boundaryPolygonLayer.getBounds().contains(markerLatLng) &&
        leafletPointInPolygon(markerLatLng, this.boundaryPolygonLayer)
      ) {
        const marker = L.marker([savedMarkerData.lat, savedMarkerData.lng]);
        this.makeMarkerDraggable(marker);
        this.drawnItems.addLayer(marker);
        this.saveDrawingsInApp();
        
        // Disable marker tool since we have a marker
        const createDrawControl = (enableMarker: boolean) => {
          if (this.drawControl) {
            this.map.removeControl(this.drawControl);
          }
          this.drawControl = new L.Control.Draw({
            position: 'topright',
            draw: {
              circle: false,
              circlemarker: false,
              marker: enableMarker ? {} : false,
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
        createDrawControl(false);
      }
    }
  }

  // Get saved marker location from localStorage
  private getSavedMarkerLocation(): {lat: number, lng: number} | null {
    const savedMarkerData = localStorage.getItem('markerLocation');
    if (savedMarkerData) {
      try {
        return JSON.parse(savedMarkerData);
      } catch (e) {
        console.error('Failed to parse saved marker location:', e);
      }
    }
    return null;
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
    localStorage.removeItem('markerLocation'); // Also remove saved marker
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

  // Public method to remove existing marker and enable placing a new one
  public removeMarker(): void {
    const layers = this.drawnItems.getLayers();
    layers.forEach(layer => {
      if (layer instanceof L.Marker) {
        this.drawnItems.removeLayer(layer);
      }
    });
    localStorage.removeItem('markerLocation');
    this.saveDrawingsInApp();
    
    // Re-enable marker tool
    if (this.drawControl) {
      this.map.removeControl(this.drawControl);
    }
    this.drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        circle: false,
        circlemarker: false,
        marker: {}, // Enable marker tool
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