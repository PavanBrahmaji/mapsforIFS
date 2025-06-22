import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import 'leaflet-draw';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';

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

// Type declaration to fix the GeoSearchControl constructor issue
declare module 'leaflet-geosearch' {
  interface GeoSearchControl {
    new (options: any): any;
  }
}

@Component({
  selector: 'app-leaflet-maps',
  imports: [],
  templateUrl: './leaflet-maps.component.html',
  styleUrl: './leaflet-maps.component.css'
})
export class LeafletMapsComponent implements OnInit, AfterViewInit {
  private destroyRef = inject(DestroyRef);
  
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  
  name = "Angular 20 Leaflet Maps";
  map!: L.Map;
  lat: number = 39.8283; // Center latitude for United States
  lon: number = -98.5795; // Center longitude for United States
  marker!: L.Marker;
  dbMarkers: L.Marker[] = [];
  markers: any[] = [];
  drawnItems!: L.FeatureGroup;
  
  // Sample data
  private readonly myLines = [{
    "type": "Polygon",
    "coordinates": [[
      [105.02517700195314, 19.433801201715198],
      [106.23367309570314, 18.852796311610007],
      [105.61843872070314, 7.768472031139744],
      [105.02517700195314, 19.433801201715198] // Close the polygon
    ]]
  }, {
    "type": "LineString",
    "coordinates": [[-105, 40], [-110, 45], [-115, 55]]
  }];

  private readonly myStyle = {
    "color": "green",
    "weight": 5,
    "opacity": 0.65
  };

  ngOnInit(): void {
    // Component initialization logic
  }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  private initializeMap(): void {
    // Initialize map centered on the United States with zoom level 4
    this.map = L.map(this.mapContainer.nativeElement).setView([this.lat, this.lon], 4);

    // Define base layers
    const baseLayers = {
      "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }),
      "Google Streets": L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google'
      }),
      "Google Hybrid": L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google'
      }),
      "Google Satellite": L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google'
      }),
      "Google Terrain": L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google'
      })
    };

    const overlays = {};

    // Add layer control
    L.control.layers(baseLayers, overlays).addTo(this.map);

    // Set default layer (choose one of the remaining, e.g., OpenStreetMap)
    baseLayers["OpenStreetMap"].addTo(this.map);

    // Initialize drawing
    this.initializeDrawing();

    // Removed static sample data
    // this.addSampleData();

    // Add search control
    this.addSearchControl();
  }

  private initializeDrawing(): void {
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        circle: false,
        circlemarker: false,
        marker: {
          icon: iconDefault
        }
      },
      edit: {
        featureGroup: this.drawnItems
      }
    });

    this.map.addControl(drawControl);

    // Handle draw events
    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const type = e.layerType;
      const layer = e.layer;

      if (type === 'marker') {
        layer.bindPopup('A popup!');
        console.log('Marker coordinates:', layer.getLatLng());
      } else {
        console.log('Shape coordinates:', layer.getLatLngs());
      }

      this.drawnItems.addLayer(layer);
    });
  }

  private addSampleData(): void {
    const layerPostalcodes = L.geoJSON(this.myLines as any, {
      style: this.myStyle
    }).addTo(this.map);

    this.drawnItems.addLayer(layerPostalcodes);
  }

  private addSearchControl(): void {
    const provider = new OpenStreetMapProvider();
    const searchControl = new (GeoSearchControl as any)({
      provider: provider,
      style: 'bar',
      autoComplete: true,
      autoCompleteDelay: 250,
      showMarker: true,
      retainZoomLevel: false,
      animateZoom: true,
      autoClose: true,
      searchLabel: 'Enter address',
      keepResult: true
    });

    this.map.addControl(searchControl);
  }
}