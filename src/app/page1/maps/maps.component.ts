import { Component, Input, ViewChild } from '@angular/core';
import { GlobeComponent } from './globe/globe.component';
import { LeafletMapsComponent } from './leaflet-maps/leaflet-maps.component';

@Component({
  selector: 'app-maps',
  imports: [GlobeComponent, LeafletMapsComponent],
  templateUrl: './maps.component.html',
  styleUrl: './maps.component.css'
})
export class MapsComponent {

  @Input() selectedLocation: { lat: number, lng: number } | null = null;
  @ViewChild(GlobeComponent) globeComponent!: GlobeComponent;
  @ViewChild(LeafletMapsComponent) leafletComponent!: LeafletMapsComponent;

  startGlobeRotation(): void {
    if (this.globeComponent) {
      this.globeComponent.startAutoRotation();
    }
  }

  ngOnChanges() {
    if (this.selectedLocation) {
      console.log('Selected Location:', this.selectedLocation);
      if (this.globeComponent) {
        this.globeComponent.flyTo(this.selectedLocation.lat, this.selectedLocation.lng);
      }
      if (this.leafletComponent) {
        this.leafletComponent.lat = this.selectedLocation.lat;
        this.leafletComponent.lon = this.selectedLocation.lng;
        // Optionally, recenter the map if needed:
        if (this.leafletComponent.map) {
          this.leafletComponent.map.setView([this.selectedLocation.lat, this.selectedLocation.lng], this.leafletComponent.map.getZoom());
        }
      }
    }
  }

  public resetDrawings(): void {
    if (this.leafletComponent) {
      this.leafletComponent.resetDrawings();
    }
  }

  public saveDrawings(): void {
    if (this.leafletComponent) {
      this.leafletComponent.saveDrawings();
    }
  }
}
