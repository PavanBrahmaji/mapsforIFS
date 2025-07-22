import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import { FormsModule } from '@angular/forms';

const redIcon = L.icon({
  iconUrl: 'images/marker.svg', // Use your local SVG marker
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

@Component({
  selector: 'app-page3',
  imports: [FormsModule],
  templateUrl: './page3.component.html',
  styleUrl: './page3.component.css'
})
export class Page3Component implements OnInit, AfterViewInit, OnChanges {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  @Input() lat: number = 39.8283;
  @Input() lon: number = -98.5795;
  @Output() drawingsChanged = new EventEmitter<any>();

  map!: L.Map;
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
    this.map = L.map(this.mapContainer.nativeElement,{attributionControl: false}).setView([this.lat, this.lon], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.initializeDrawing();
    this.loadPolygonBoundariesFromLocalStorage();
    this.loadMarkerFromLocalStorage();
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

    // Enable marker tool initially if no marker exists
    const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    createDrawControl(!hasMarker);
  }

  private loadMarkerFromLocalStorage(): void {
    const savedSiteData = localStorage.getItem('siteData');
    if (savedSiteData && this.boundaryPolygonLayer) {
      try {
        const siteData = JSON.parse(savedSiteData);
        if (siteData.building) {
          for (const buildingName of Object.keys(siteData.building)) {
            const markerData = siteData.building[buildingName];
            if (
              markerData &&
              typeof markerData.lat === 'number' &&
              typeof markerData.lng === 'number'
            ) {
              const markerLatLng = L.latLng(markerData.lat, markerData.lng);
              if (
                this.boundaryPolygonLayer.getBounds().contains(markerLatLng) &&
                leafletPointInPolygon(markerLatLng, this.boundaryPolygonLayer)
              ) {
                const marker = L.marker([markerData.lat, markerData.lng], { icon: redIcon });
                
                const tooltipHtml = `
                  <span style="
                    display: flex;
                    align-items: center;
                    background: #303030;
                    color: #fff;
                    border-radius: 4px 4px 4px 0;
                    padding: 4px 16px;
                    font-weight: bold;
                    font-size: 14px;
                    line-height: 100%;
                    letter-spacing: -0.05px;
                    height: 32px;
                  ">
                    <img src="images/building_icon.svg" alt="Site Icon" style="width:24px;height:24px;margin-right:8px;vertical-align:middle;">
                    <span style="color:#fff;">${buildingName || 'Building'}</span>
                  </span>
                `;
                
                marker.bindTooltip(tooltipHtml, {
                  permanent: true,
                  direction: 'top',
                  offset: [60, -6],  // Adjust this to position the tooltip precisely
                  sticky: false,     // Set to false for fixed position
                  className: 'custom-tooltip',
                  interactive: false // Set to false if you don't want interaction with the tooltip
                }).openTooltip();
                
                this.drawnItems.addLayer(marker);
              }
            }
          }
          this.saveDrawingsInApp();
          this.updateDrawControl(false);
        }
      } catch (e) {
        console.error('Failed to load building markers:', e);
      }
    }
  }

  private loadPolygonBoundariesFromLocalStorage(): void {
    const savedSiteData = localStorage.getItem('siteData');
    if (savedSiteData) {
      try {
        const siteData = JSON.parse(savedSiteData);
        const geoJson = siteData.globalVar;
        const polygonFeatures = (geoJson.features || []).filter(
          (f: any) => f.geometry && f.geometry.type === 'Polygon'
        );
        const polygonsGeoJson: FeatureCollection = {
          type: "FeatureCollection",
          features: polygonFeatures as Feature[]
        };
        this.drawingsGeoJson = polygonsGeoJson;
        const geoJsonLayer = L.geoJSON(polygonsGeoJson, {
          style: {
            color: '#CC00EC',
            opacity: 0.8,
            fillColor: '#CC00EC',
            fillOpacity: 0.07,
            dashArray: '12, 12'
          }
        });
        geoJsonLayer.eachLayer((layer: any) => {
          this.drawnItems.addLayer(layer);
          if (!this.boundaryPolygonLayer && layer instanceof L.Polygon) {
            this.boundaryPolygonLayer = layer;
          }
        });

        if (polygonFeatures.length > 0) {
          const coords = polygonFeatures[0].geometry.coordinates[0][0];
          if (Array.isArray(coords) && coords.length === 2) {
            this.map.setView([coords[1], coords[0]], 16);
          }
        }

        if (geoJsonLayer.getLayers().length > 0) {
          this.map.fitBounds(geoJsonLayer.getBounds());
        }
        this.emitDrawingsChanged();
      } catch (e) {
        console.error('Failed to load polygon boundaries:', e);
      }
    }
  }

  public saveDrawingsInApp(): void {
    if (this.drawnItems) {
      this.drawingsGeoJson = this.drawnItems.toGeoJSON();
      this.emitDrawingsChanged();
    }
  }

  private updateDrawControl(enableMarker: boolean): void {
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
  }

  private emitDrawingsChanged() {
    this.drawingsChanged.emit(this.drawingsGeoJson);
  }
}

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