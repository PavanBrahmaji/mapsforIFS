import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';

const redIcon = L.icon({
  iconUrl: 'images/marker.svg',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

@Component({
  selector: 'app-depart-page2',
  templateUrl: './depart-page2.component.html',
  styleUrls: ['./depart-page2.component.css']
})
export class DepartPage2Component implements AfterViewInit {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  @Input() lat: number = 39.8283;
  @Input() lon: number = -98.5795;
  @Output() drawingsChanged = new EventEmitter<any>();

  private map!: L.Map;
  private drawnItems!: L.FeatureGroup;
  private boundaryPolygonLayer?: L.Polygon;
  public drawingsGeoJson: any = null;

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false
    }).setView([this.lat, this.lon], 4);

    L.control.zoom({
      position: 'bottomright'
    }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    this.loadDepartmentMarkerFromLocalStorage();
  }

  private loadDepartmentMarkerFromLocalStorage(): void {
    const departmentMarker = localStorage.getItem('departmentMarker');
    if (!departmentMarker) return;

    try {
      const markerData = JSON.parse(departmentMarker);
      
      // Validate the marker data structure
      if (!markerData || typeof markerData !== 'object' || 
          typeof markerData.lat !== 'number' || typeof markerData.lng !== 'number') {
        console.error('Invalid department marker data structure');
        return;
      }

      // Create and add the marker to the map
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
          <img src="images/building_icon.svg" alt="Department Icon" style="width:24px;height:24px;margin-right:8px;">
          <span style="color:#fff;">${markerData.label || 'Department Location'}</span>
        </span>
      `;
      
      marker.bindTooltip(tooltipHtml, {
        permanent: true,
        direction: 'top',
        offset: [60, -6],
        className: 'custom-tooltip'
      }).openTooltip();
      
      this.drawnItems.addLayer(marker);

      // Center the map on the marker if it's valid
      if (!isNaN(markerData.lat) && !isNaN(markerData.lng)) {
        this.map.setView([markerData.lat, markerData.lng], 16);
      }

    } catch (e) {
      console.error('Failed to load department marker:', e);
    }
  }
}