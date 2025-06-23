import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject, Input, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet-draw';

// Fix for default markers - Using CDN URLs (simplest solution)
const iconDefault = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = iconDefault;

declare module 'leaflet-geosearch' {
  interface GeoSearchControl {
    new (options: any): any;
  }
}

@Component({
  selector: 'app-leaflet-maps',
  imports: [CommonModule],
  templateUrl: './leaflet-maps.component.html',
  styleUrl: './leaflet-maps.component.css'
})
export class LeafletMapsComponent implements OnInit, AfterViewInit, OnChanges {
  private destroyRef = inject(DestroyRef);

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  @Input() lat: number = 39.8283; // Default: Center latitude for United States
  @Input() lon: number = -98.5795; // Default: Center longitude for United States

  @Output() drawingsChanged = new EventEmitter<any>();

  map!: L.Map;
  marker!: L.Marker;
  dbMarkers: L.Marker[] = [];
  markers: any[] = [];
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw; // <-- Make drawControl a class property

public drawingsGeoJson: any = null;
 

  ngOnInit(): void {
    // Component initialization logic
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && (changes['lat'] || changes['lon'])) {
      // Zoom to the new location with a reasonable zoom level (e.g., 14 for city/street)
      this.map.setView([this.lat, this.lon], 14, { animate: true });
    }
  }

  private initializeMap(): void {
    // Initialize map centered on the United States with zoom level 4
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false // Disable default zoom control (top left)
    }).setView([this.lat, this.lon], 4);

    // Add zoom control to the bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Use only OpenStreetMap as the base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Remove baseLayers and overlays logic, and do not add L.control.layers

    // Initialize drawing
    this.initializeDrawing();
  }

  private initializeDrawing(): void {
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    // Restore drawings from localStorage if available
    const savedGeoJson = localStorage.getItem('leafletDrawings');
    if (savedGeoJson) {
      try {
        const geoJsonLayer = L.geoJSON(JSON.parse(savedGeoJson));
        geoJsonLayer.eachLayer((layer: any) => {
          this.drawnItems.addLayer(layer);
        });
      } catch (e) {
        console.error('Failed to load saved drawings:', e);
      }
    }

    const createDrawControl = (enablePolygon: boolean) => {
      // Remove previous control if exists
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
      }
      this.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          circle: false,
          circlemarker: false,
          marker: false,
          polygon: enablePolygon ? {} : false,
          polyline: false,
          rectangle: false // <-- Rectangle drawing disabled
        },
        edit: {
          featureGroup: this.drawnItems,
          remove: false // disables the delete button
        }
      });
      this.map.addControl(this.drawControl);
    };

    // Initially enable polygon only
    createDrawControl(true);


    // Save all drawings to application state
    const saveDrawingsInApp = () => {
      this.drawingsGeoJson = this.drawnItems.toGeoJSON();
    };

    // Handle draw events
    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const type = e.layerType;
      const layer = e.layer;

      if (type === 'polygon' || type === 'rectangle') {
        this.drawnItems.addLayer(layer);
        createDrawControl(false);
      } else {
        this.drawnItems.addLayer(layer);
      }
      
      saveDrawingsInApp();
      this.emitDrawingsChanged();
    });

    // Handle delete events: re-enable drawing if all closed boundaries are removed
    this.map.on(L.Draw.Event.DELETED, () => {
      let hasClosedBoundary = false;
      this.drawnItems.eachLayer((layer: any) => {
        if (
          layer instanceof L.Polygon && !(layer instanceof L.Polyline && !(layer instanceof L.Polygon))
        ) {
          hasClosedBoundary = true;
        }
      });
      if (!hasClosedBoundary) {
        createDrawControl(true);
      }
      saveDrawingsInApp();
      this.emitDrawingsChanged();
    });

    // Also save on edit
    this.map.on(L.Draw.Event.EDITED, () => {
      saveDrawingsInApp();
      this.emitDrawingsChanged();
    });
  }

  public resetDrawings(): void {
    // Remove all layers from drawnItems
    this.drawnItems.clearLayers();
    // Remove drawings from localStorage
    localStorage.removeItem('leafletDrawings');
    // Clear in-app drawings
    this.drawingsGeoJson = null;
    // Re-enable polygon and rectangle drawing
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
  public storeDrawingsInApp(): void {
    if (this.drawnItems) {
      this.drawingsGeoJson = this.drawnItems.toGeoJSON();
    }
  }

  private emitDrawingsChanged() {
    this.drawingsChanged.emit(this.drawingsGeoJson);
  }
}