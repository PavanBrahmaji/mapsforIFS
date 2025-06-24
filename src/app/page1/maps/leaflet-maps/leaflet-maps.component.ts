import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet-draw';
import { GlobalService } from '../../../global.service'; // Add this import

// Use a red marker icon for all markers
const iconRed = L.icon({
  iconUrl: 'images/site_marker.svg', // Use your local SVG marker
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});


L.Marker.prototype.options.icon = iconRed;

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
  @Input() site: string = ''; // Add this if not already present

  map!: L.Map;
  marker!: L.Marker;
  dbMarkers: L.Marker[] = [];
  markers: any[] = [];
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw; // <-- Make drawControl a class property 
  private originalMarkerPosition?: L.LatLng; // Store original marker position for validation 

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
      this.map.setView([this.lat, this.lon], 17, { animate: true });
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
        const geoJsonLayer = L.geoJSON(this.globalService.globalVar, {
          style: (feature) => ({
            color: '#CC00EC',
            opacity: 0.8,
            fillColor: '#CC00EC',
            fillOpacity: 0.07, // <-- Set to 0.07
            dashArray: '6, 6' // Dotted line
          })
        });
        geoJsonLayer.eachLayer((layer: any) => {
          this.drawnItems.addLayer(layer);
        });
      } catch (e) {
        console.error('Failed to load saved drawings:', e);
      }
    }

    const createDrawControl = (enableMarker: boolean, enableEdit: boolean) => {
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
      }
      // Disable polygon tool if a polygon already exists or if there is no marker
      const polygonExists = this.drawnItems.getLayers().some(l => l instanceof L.Polygon);
      const markerExists = this.drawnItems.getLayers().some(l => l instanceof L.Marker);

      this.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          circle: false,
          circlemarker: false,
          marker: enableMarker ? { icon: iconRed } : false,
          polygon: (!markerExists || polygonExists) ? false : {
            shapeOptions: {
              color: '#CC00EC',
              opacity: 0.8,
              fillColor: '#CC00EC',
              fillOpacity: 0.07
            }
          },
          polyline: false,
          rectangle: false
        },
        edit: {
          featureGroup: this.drawnItems,
          remove: false,
          edit: enableEdit ? {} : false
        }
      });
      this.map.addControl(this.drawControl);
    };

    // Helper to check if a marker exists
    const hasMarker = () => this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    // Helper to check if a polygon exists
    const hasPolygon = () => this.drawnItems.getLayers().some(l => l instanceof L.Polygon);

    // Initial draw control: only marker tool enabled if no marker exists, edit disabled
    createDrawControl(!hasMarker(), false);

    const enableOtherTools = () => {
      // Enable polygon tool, enable edit only if both marker and polygon exist
      const enableEdit = hasMarker() && hasPolygon();
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
        
      }
      const polygonExists = this.drawnItems.getLayers().some(l => l instanceof L.Polygon);
      const markerExists = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
      this.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          circle: false,
          circlemarker: false,
          marker: false,
          polygon: (!markerExists || polygonExists) ? false : {
            shapeOptions: {
              color: '#CC00EC',
              opacity: 0.8,
              fillColor: '#CC00EC',
              fillOpacity: 0.07
            }
          },
          polyline: false,
          rectangle: false
        },
        edit: {
          featureGroup: this.drawnItems,
          remove: false,
          edit: enableEdit ? {} : false // <-- Fix: Use object or false instead of boolean
        }
      });
      this.map.addControl(this.drawControl);
    };

    const saveDrawingsInApp = () => {
      const geoJson = this.drawnItems.toGeoJSON();
      this.globalService.globalVar = geoJson;
    };

    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const type = e.layerType;
      const layer = e.layer;

      if (type === 'marker') {
        // Check if a polygon exists
        const polygonLayer = this.drawnItems.getLayers().find(l => l instanceof L.Polygon) as L.Polygon | undefined;
        if (polygonLayer) {
          // If a polygon exists, only allow marker if inside the polygon
          const markerLatLng = layer.getLatLng();
          if (!leafletPointInPolygon(markerLatLng, polygonLayer)) {
            alert('Marker must be placed inside the boundary.');
            return; // Do not add the marker
          }
        }
        this.drawnItems.addLayer(layer);
        // Tooltip HTML with icon and site name
        const tooltipHtml = `
          <div style="
            display: flex;
            align-items: center;
            background: #BD3EF4;
            color: #fff;
            border-radius: 4px;
            padding: 6px 12px;
            font-weight: bold;
            
          ">
            <img src="images/site_icon.svg" alt="Site Icon" style="width:20px;height:20px;margin-right:8px;vertical-align:middle;">
            <span style="color:#fff;">${this.site || 'Site'}</span>
          </div>
        `;
        layer.bindTooltip(tooltipHtml, {
          direction: 'top',
          permanent: true,
          sticky: true,
          className: '' // No custom class needed, all styling is inline
        }).openTooltip();
        enableOtherTools();
      } else if (type === 'polygon' || type === 'rectangle') {
        // Check if a marker exists and is inside the new polygon
        const markerLayer = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
        if (markerLayer) {
          const markerLatLng = markerLayer.getLatLng();
          // Use leafletPointInPolygon to check if marker is inside the polygon
          const tempPolygon = layer as L.Polygon;
          if (leafletPointInPolygon(markerLatLng, tempPolygon)) {
            layer.setStyle?.({
              color: '#CC00EC',
              opacity: 0.8,
              fillColor: '#CC00EC',
              fillOpacity: 0.07,
              dashArray: '6, 6'
            });
            this.drawnItems.addLayer(layer);
            enableOtherTools();
          } else {
            // Marker is not inside the polygon, show alert and do not add the polygon
            alert('Marker must be inside the boundary. Please draw the boundary around the marker.');
          }
        } else {
          // No marker exists, show alert and do not add the polygon
          alert('Please add a marker before drawing a boundary.');
        }
      } else {
        this.drawnItems.addLayer(layer);
      }

      saveDrawingsInApp();
    });

    this.map.on(L.Draw.Event.DELETED, () => {
      // After delete, update edit button state
      const enableEdit = hasMarker() && hasPolygon();
      createDrawControl(!hasMarker(), enableEdit);
      saveDrawingsInApp();
    });

    // Handle edit events to prevent marker from moving outside boundary
    this.map.on(L.Draw.Event.EDITED, (e: any) => {
      const layers = e.layers;
      let isValid = true;
      
      layers.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) {
          const markerLatLng = layer.getLatLng();
          // Check if marker is still inside any polygon
          const polygonLayer = this.drawnItems.getLayers().find(l => l instanceof L.Polygon) as L.Polygon | undefined;
          
          if (polygonLayer && !leafletPointInPolygon(markerLatLng, polygonLayer)) {
            isValid = false;
            // Reset marker to its original position (we'll store this before editing starts)
            const originalMarker = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker;
            if (originalMarker && this.originalMarkerPosition) {
              layer.setLatLng(this.originalMarkerPosition);
            }
            alert('Marker cannot be moved outside the boundary.');
          }
        }
      });
      
      if (isValid) {
        saveDrawingsInApp();
        // If there is no marker after editing, enable marker tool so user can add a new marker
        const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
        const hasPolygon = this.drawnItems.getLayers().some(l => l instanceof L.Polygon);
        if (!hasMarker && hasPolygon) {
          createDrawControl(true, true); // Enable marker tool and edit
        }
      }
    });

    // Add this before the EDITSTART event handler inside initializeDrawing():
    this.map.on(L.Draw.Event.EDITSTART, () => {
      // Check if both marker and polygon exist
      const markerLayer = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
      const polygonLayer = this.drawnItems.getLayers().find(l => l instanceof L.Polygon) as L.Polygon | undefined;

      if (markerLayer && polygonLayer) {
        const proceed = confirm(
          'Warning: If you edit the boundary, the marker will be removed. You will need to add a new marker inside the boundary after saving. Continue?'
        );
        if (!proceed) {
          // Cancel editing mode
          this.map.fire('draw:editstop');
          return;
        } else {
          // Remove the marker if user clicks OK
          this.drawnItems.removeLayer(markerLayer);
          // DO NOT call createDrawControl here!
          // Let the user finish editing and click Save/Cancel
        }
      }

      // Store original marker position before editing starts (if marker still exists)
      const markerAfterRemoval = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
      if (markerAfterRemoval) {
        this.originalMarkerPosition = markerAfterRemoval.getLatLng();
      }
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

// Add this helper function at the bottom of your file (outside the class):
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