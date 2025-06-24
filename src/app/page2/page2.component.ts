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
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false
    }).setView([this.lat, this.lon], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
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
      if (layer instanceof L.Marker && this.boundaryPolygonLayer) {
        const markerLatLng = layer.getLatLng();
        if (
          !this.boundaryPolygonLayer.getBounds().contains(markerLatLng) ||
          !leafletPointInPolygon(markerLatLng, this.boundaryPolygonLayer)
        ) {
          alert('Marker must be placed inside the boundary.');
          return;
        }
        
        layer.setIcon(redIcon);
       if (this.building && this.building.trim() !== '') {
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
            <span style="color:#fff;">${this.building || 'Building'}</span>
          </span>
        `;
        layer.bindTooltip(tooltipHtml, {
                  permanent: true,
                  direction: 'top',
                  offset: [55, -6],  // Adjust this to position the tooltip precisely
                  sticky: false,     // Set to false for fixed position
                  className: 'custom-tooltip',
                  interactive: false // Set to false if you don't want interaction with the tooltip
                }).openTooltip();
      }
        this.makeMarkerDraggable(layer);
        this.saveMarkerLocationToLocalStorage(layer);
        this.drawnItems.addLayer(layer);
        this.saveDrawingsInApp();
        createDrawControl(false);
      } else if (!(layer instanceof L.Marker)) {
        this.drawnItems.addLayer(layer);
        this.saveDrawingsInApp();
      }
    });
  }

  public onBuildingChange(): void {
    const hasMarker = this.drawnItems?.getLayers().some(l => l instanceof L.Marker);
    this.updateDrawControl(!hasMarker && this.building.trim() !== '');

    const markerLayer = this.drawnItems?.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
    if (markerLayer) {
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
          <img src="images/building_icon.svg" alt="Site Icon" style="vertical-align:middle;margin:10px;">
          <span style="color:#fff;">${this.building || 'Building'}</span>
        </span>
      `;
      markerLayer.unbindTooltip();
      markerLayer.bindTooltip(tooltipHtml, {
        permanent: true,
        direction: 'top',
        offset: [60, -6],  // Adjust this to position the tooltip precisely
        sticky: false,     // Set to false for fixed position
        className: 'custom-tooltip',
        interactive: false // Set to false if you don't want interaction with the tooltip
      }).openTooltip();
    }
  }

  private makeMarkerDraggable(marker: L.Marker): void {
    marker.setIcon(redIcon);
    marker.options.draggable = true;
    marker.dragging?.enable();

    marker
      .on('dragstart', () => {
        marker.setIcon(redIcon);
      })
      .on('dragend', (e) => {
        const draggedMarker = e.target as L.Marker;
        const newLatLng = draggedMarker.getLatLng();

        if (this.boundaryPolygonLayer) {
          if (
            !this.boundaryPolygonLayer.getBounds().contains(newLatLng) ||
            !leafletPointInPolygon(newLatLng, this.boundaryPolygonLayer)
          ) {
            alert('Marker must stay inside the boundary. Moving back to previous position.');
            const savedMarker = this.getSavedMarkerLocation();
            if (savedMarker) {
              draggedMarker.setLatLng([savedMarker.lat, savedMarker.lng]);
            }
            return;
          }
        }

        draggedMarker.setIcon(redIcon);
        this.saveMarkerLocationToLocalStorage(draggedMarker);
        this.saveDrawingsInApp();
      });
  }

  private getSavedMarkerLocation(): {lat: number, lng: number} | null {
    const savedSiteData = localStorage.getItem('siteData');
    if (savedSiteData) {
      try {
        const siteData = JSON.parse(savedSiteData);
        if (siteData['building'] && this.building && siteData['building'][this.building]) {
          return {
            lat: siteData['building'][this.building].lat,
            lng: siteData['building'][this.building].lng
          };
        }
      } catch (e) {
        console.error('Failed to parse saved marker location:', e);
      }
    }
    return null;
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

  public saveDrawingsInApp(): void {
    if (this.drawnItems) {
      this.drawingsGeoJson = this.drawnItems.toGeoJSON();
      this.emitDrawingsChanged();
    }
  }

  public saveMarkerLocationToLocalStorage(marker: L.Marker): void {
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
      alert('Please enter a building name before saving.');
    }
  }

  public saveLocation(): void {
    const markerLayer = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
    if (markerLayer) {
      this.saveMarkerLocationToLocalStorage(markerLayer);
    } else {
      alert('Please place a marker on the map first.');
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

  public hasMarker(): boolean {
    return this.drawnItems.getLayers().some(layer => layer instanceof L.Marker);
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