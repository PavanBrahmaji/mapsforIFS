import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet-draw';
import { GlobalService } from '../../../global.service'; // Add this import

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

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  @Input() lat: number = 39.8283; // Default: Center latitude for United States
  @Input() lon: number = -98.5795; // Default: Center longitude for United States

  map!: L.Map;
  marker!: L.Marker;
  dbMarkers: L.Marker[] = [];
  markers: any[] = [];
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw; // <-- Make drawControl a class property 

  constructor(private globalService: GlobalService) {} // Inject the service

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

    // Restore drawings from globalService only (no localStorage)
    if (this.globalService.globalVar) {
      try {
        const geoJsonLayer = L.geoJSON(this.globalService.globalVar);
        geoJsonLayer.eachLayer((layer: any) => {
          this.drawnItems.addLayer(layer);
        });
      } catch (e) {
        console.error('Failed to load saved drawings:', e);
      }
    }

    const createDrawControl = (enablePolygon: boolean) => {
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
          rectangle: false
        },
        edit: {
          featureGroup: this.drawnItems,
          remove: false
        }
      });
      this.map.addControl(this.drawControl);
    };

    createDrawControl(true);

    const saveDrawingsInApp = () => {
      const geoJson = this.drawnItems.toGeoJSON();
      this.globalService.globalVar = geoJson;
    };

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
    });

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
    });

    this.map.on(L.Draw.Event.EDITED, () => {
      saveDrawingsInApp();
    });
  }

  public resetDrawings(): void {
    this.drawnItems.clearLayers();
    this.globalService.globalVar = null;
    // Do NOT call this.initializeDrawing() here
  }

  public saveDrawings(): void {
    if (this.drawnItems) {
      const geoJson = this.drawnItems.toGeoJSON();
      this.globalService.globalVar = geoJson; // Store in service only
    }
  }

  // Store drawings in application state (not localStorage)
  public storeDrawingsInApp(): void {
    if (this.drawnItems) {
      this.globalService.globalVar = this.drawnItems.toGeoJSON();
    }
  }
}