import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import { FormsModule } from '@angular/forms';

const redIcon = L.icon({
  iconUrl: 'images/marker.svg',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});
L.Marker.prototype.options.icon = redIcon;

@Component({
  selector: 'app-page2',
  imports: [FormsModule],
  templateUrl: './page2.component.html',
  styleUrl: './page2.component.css'
})
export class Page2Component implements OnInit, AfterViewInit, OnChanges {
  public building: string = '';
  private lastValidMarkerPosition: L.LatLng | null = null;

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  @Input() lat: number = 39.8283;
  @Input() lon: number = -98.5795;

  @Output() drawingsChanged = new EventEmitter<any>();

  map!: L.Map;
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw;
  public drawingsGeoJson: any = null;
  private boundaryPolygonLayer?: L.Polygon;
  private boundaryWarning?: HTMLElement;

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
      zoomControl: false,
      attributionControl: false,
    }).setView([this.lat, this.lon], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    }).addTo(this.map);

    this.initializeDrawing();
    this.loadPolygonBoundariesFromLocalStorage();
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
          marker: (enableMarker && this.building.length > 0) ? { icon: redIcon } : false,
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

    const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    createDrawControl(!hasMarker);

    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      if (layer instanceof L.Marker) {
        this.handleMarkerCreation(layer, createDrawControl);
      } else if (!(layer instanceof L.Marker)) {
        this.drawnItems.addLayer(layer);
        this.saveDrawingsInApp();
      }
    });
  }

  private handleMarkerCreation(marker: L.Marker, createDrawControl: (enable: boolean) => void): void {
    if (this.boundaryPolygonLayer) {
      const markerLatLng = marker.getLatLng();
      
      const isInside = this.boundaryPolygonLayer.getBounds().contains(markerLatLng) && 
                      leafletPointInPolygon(markerLatLng, this.boundaryPolygonLayer);
      
      if (!isInside) {
        this.showBoundaryWarning('Marker must be placed inside the boundary polygon.');
        return;
      }

      this.lastValidMarkerPosition = markerLatLng;
    }

    this.setupMarker(marker);
    createDrawControl(false);
  }

  private setupMarker(marker: L.Marker): void {
    marker.setIcon(redIcon);
    
    if (this.building && this.building.trim() !== '') {
      const tooltipHtml = this.createMarkerTooltipHtml();
      marker.bindTooltip(tooltipHtml, {
        permanent: true,
        direction: 'top',
        offset: [55, -6],
        sticky: false,
        className: 'custom-tooltip',
        interactive: false
      }).openTooltip();
    }
    
    this.makeMarkerDraggable(marker);
    this.saveMarkerLocationToLocalStorage(marker);
    this.drawnItems.addLayer(marker);
    this.saveDrawingsInApp();
  }

  private createMarkerTooltipHtml(): string {
    return `
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
        <span style="color:#fff;">${this.building || 'Building'}</span>
      </span>
    `;
  }

  private makeMarkerDraggable(marker: L.Marker): void {
    marker.setIcon(redIcon);
    marker.options.draggable = true;
    marker.dragging?.enable();

    marker
      .on('dragstart', () => {
        if (this.lastValidMarkerPosition) {
          // Store the starting position as the last valid position
          this.lastValidMarkerPosition = marker.getLatLng();
        }
      })
      .on('drag', (e) => {
        if (this.boundaryPolygonLayer) {
          const marker = e.target as L.Marker;
          const newLatLng = marker.getLatLng();
          
          const isInside = this.boundaryPolygonLayer.getBounds().contains(newLatLng) && 
                          leafletPointInPolygon(newLatLng, this.boundaryPolygonLayer);
          
          marker.setOpacity(isInside ? 1 : 0.5);
        }
      })
      .on('dragend', (e) => {
        const marker = e.target as L.Marker;
        const newLatLng = marker.getLatLng();
        marker.setOpacity(1);

        if (this.boundaryPolygonLayer) {
          const isInside = this.boundaryPolygonLayer.getBounds().contains(newLatLng) && 
                          leafletPointInPolygon(newLatLng, this.boundaryPolygonLayer);
          
          if (!isInside) {
            this.showBoundaryWarning('Marker must stay inside the boundary polygon.');
            if (this.lastValidMarkerPosition) {
              marker.setLatLng(this.lastValidMarkerPosition);
            }
            return;
          }

          this.lastValidMarkerPosition = newLatLng;
        }

        this.saveMarkerLocationToLocalStorage(marker);
        this.saveDrawingsInApp();
      });
  }

  private showBoundaryWarning(message: string): void {
    if (this.boundaryWarning) {
      this.boundaryWarning.remove();
    }

    this.boundaryWarning = L.DomUtil.create('div', 'boundary-warning');
    this.boundaryWarning.innerHTML = `
      <div style="
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4444;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        font-size: 14px;
        animation: fadeIn 0.3s;
      ">
        ${message}
      </div>
    `;
    
    const mapContainer = this.map.getContainer();
    mapContainer.appendChild(this.boundaryWarning);

    setTimeout(() => {
      if (this.boundaryWarning) {
        this.boundaryWarning.style.transition = 'opacity 0.5s';
        this.boundaryWarning.style.opacity = '0';
        setTimeout(() => {
          if (this.boundaryWarning) {
            this.boundaryWarning.remove();
            this.boundaryWarning = undefined;
          }
        }, 500);
      }
    }, 3000);
  }

  private saveMarkerLocationToLocalStorage(marker: L.Marker): void {
    const markerLatLng = marker.getLatLng();
    const savedSiteData = localStorage.getItem('siteData');
    let siteData: any = {};
    if (savedSiteData) {
      try {
        siteData = JSON.parse(savedSiteData);
      } catch (e) {
        siteData = {};
      }
    }
    if (this.building && this.building.trim() !== '') {
      siteData['building'] = siteData['building'] || {};
      siteData['building'][this.building] = {
        lat: markerLatLng.lat,
        lng: markerLatLng.lng
      };
      localStorage.setItem('siteData', JSON.stringify(siteData));
    } else {
      this.showBoundaryWarning('Please enter a building name before saving.');
    }
  }

  private saveDrawingsInApp(): void {
    if (this.drawnItems) {
      this.drawingsGeoJson = this.drawnItems.toGeoJSON();
      this.emitDrawingsChanged();
    }
  }

  public onBuildingChange(): void {
    const hasMarker = this.drawnItems?.getLayers().some(l => l instanceof L.Marker);
    this.updateDrawControl(!hasMarker && this.building.trim() !== '');

    const markerLayer = this.drawnItems?.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
    if (markerLayer) {
      const tooltipHtml = this.createMarkerTooltipHtml();
      markerLayer.unbindTooltip();
      markerLayer.bindTooltip(tooltipHtml, {
        permanent: true,
        direction: 'top',
        offset: [60, -6],
        sticky: false,
        interactive: false
      }).openTooltip();
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
        marker: enableMarker ? { icon: redIcon } : false,
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
          style: (feature) => ({
            color: '#CC00EC',
            opacity: 0.8,
            fillColor: '#CC00EC',
            fillOpacity: 0.07,
            dashArray: '12, 12'
          })
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

  private emitDrawingsChanged(): void {
    this.drawingsChanged.emit(this.drawingsGeoJson);
  }

  public resetDrawings(): void {
    this.drawnItems.clearLayers();
    localStorage.removeItem('leafletDrawings');
    this.drawingsGeoJson = null;
    this.updateDrawControl(true);
  }

  public saveDrawings(): void {
    if (this.drawnItems) {
      const geoJson = this.drawnItems.toGeoJSON();
      localStorage.setItem('leafletDrawings', JSON.stringify(geoJson));
    }
  }

  public saveLocation(): void {
    const markerLayer = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
    if (markerLayer) {
      this.saveMarkerLocationToLocalStorage(markerLayer);
    } else {
      this.showBoundaryWarning('Please place a marker on the map first.');
    }
  }

  public removeMarker(): void {
    const layers = this.drawnItems.getLayers();
    layers.forEach(layer => {
      if (layer instanceof L.Marker) {
        this.drawnItems.removeLayer(layer);
      }
    });
    const savedSiteData = localStorage.getItem('siteData');
    if (savedSiteData) {
      try {
        const siteData = JSON.parse(savedSiteData);
        if (siteData['building'] && siteData['building'][this.building]) {
          delete siteData['building'][this.building];
          localStorage.setItem('siteData', JSON.stringify(siteData));
        }
      } catch (e) {
        // ignore
      }
    }
    this.saveDrawingsInApp();
    this.updateDrawControl(true);
    this.lastValidMarkerPosition = null;
  }

  public hasMarker(): boolean {
    return this.drawnItems.getLayers().some(layer => layer instanceof L.Marker);
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