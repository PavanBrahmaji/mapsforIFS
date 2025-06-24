import { Component, ViewChild, ElementRef, OnInit, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';
import { FormsModule } from '@angular/forms';
// Import your search bar and maps components if needed
// import { SearchBarComponent } from '../search-bar/search-bar.component';
// import { MapsComponent } from '../maps/maps.component';

const redIcon = L.icon({
  iconUrl: 'images/marker.svg', // Use your local SVG marker
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

@Component({
  selector: 'app-depart-page1',
  imports: [FormsModule /*, SearchBarComponent, MapsComponent */],
  templateUrl: './depart-page1.component.html',
  styleUrl: './depart-page1.component.css'
})
export class DepartPage1Component implements OnInit, AfterViewInit {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;
  public markerLabel: string = ''; // Used as Department
  public site: string = '';
  public selectedLocation: { lat: number, lng: number } | null = null;

  map!: L.Map;
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw;

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  // Called when a location is selected from the search bar
  locationSelect(location: { lat: number, lng: number }) {
    this.selectedLocation = location;
    if (this.map && location) {
      this.map.setView([location.lat, location.lng], 16, { animate: true });
    }
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false
    }).setView([39.8283, -98.5795], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.initializeDrawing();
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

    const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    createDrawControl(!hasMarker);

    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      if (layer instanceof L.Marker) {
        // Set marker icon to red
        layer.setIcon(redIcon);
        // Set tooltip as department name if provided
        if (this.markerLabel && this.markerLabel.trim() !== '') {
          layer.bindTooltip(this.markerLabel, { permanent: true, direction: 'top' });
          layer.openTooltip();
        }
        this.makeMarkerDraggable(layer);
        this.saveMarkerLocationToLocalStorage(layer);
        this.drawnItems.addLayer(layer);
        createDrawControl(false);
      }
    });
  }

  public onMarkerLabelChange(): void {
    const hasMarker = this.drawnItems?.getLayers().some(l => l instanceof L.Marker);
    this.updateDrawControl(!hasMarker && this.markerLabel.trim() !== '');
  }

  private makeMarkerDraggable(marker: L.Marker): void {
    marker.setIcon(redIcon); // Always set the icon to your SVG
    marker.options.draggable = true;
    marker.dragging?.enable();

    marker.on('dragstart', () => {
      marker.setIcon(redIcon); // Ensure icon stays the same while dragging
    });

    marker.on('drag', () => {
      marker.setIcon(redIcon); // Ensure icon stays the same during drag
    });

    marker.on('dragend', (e) => {
      const draggedMarker = e.target as L.Marker;
      draggedMarker.setIcon(redIcon); // Ensure icon stays the same after drag
      this.saveMarkerLocationToLocalStorage(draggedMarker);
    });
  }

  public saveMarkerLocationToLocalStorage(marker: L.Marker): void {
    const markerLatLng = marker.getLatLng();
    const savedData = localStorage.getItem('department');
    let data: any = {};
    if (savedData) {
      try {
        data = JSON.parse(savedData);
      } catch (e) {
        data = {};
      }
    }
    // Save as: { [department]: { lat, lng } }
    if (this.markerLabel && this.markerLabel.trim() !== '') {
      data[this.markerLabel] = {
        lat: markerLatLng.lat,
        lng: markerLatLng.lng
      };
      localStorage.setItem('department', JSON.stringify(data));
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
}
