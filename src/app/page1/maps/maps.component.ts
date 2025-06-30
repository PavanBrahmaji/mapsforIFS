import { Component, Input, ViewChild, AfterViewInit } from '@angular/core';
import { GlobeComponent } from './globe/globe.component';
import { LeafletMapsComponent } from './leaflet-maps/leaflet-maps.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-maps',
  templateUrl: './maps.component.html',
  styleUrls: ['./maps.component.css'],
  imports: [GlobeComponent, LeafletMapsComponent,CommonModule]
})
export class MapsComponent {
  @Input() selectedLocation: { lat: number, lng: number } | null = null;
  @ViewChild(GlobeComponent) globeComponent!: GlobeComponent;
  @ViewChild(LeafletMapsComponent) leafletComponent!: LeafletMapsComponent;

  showGlobe = false; // <-- control which component is visible

  ngOnChanges() {
  if (this.selectedLocation) {
    // Trigger globe fly first
    if (this.globeComponent) {
      this.globeComponent.flyTo(this.selectedLocation.lat, this.selectedLocation.lng, () => {
        this.showGlobe = false;

        // Now trigger leaflet fly after globe completes
        setTimeout(() => {
          if (this.leafletComponent?.map) {
            this.leafletComponent.flyToLocation([
              this.selectedLocation!.lat,
              this.selectedLocation!.lng,
            ]);
          }
        }, 500); // short delay to ensure component is rendered
      });
    }
  }
}

  startGlobeRotation(): void {
    if (this.globeComponent) {
      this.globeComponent.startAutoRotation();
    }
  }

  public resetDrawings(): void {
    this.leafletComponent?.resetDrawings();
  }

  public saveDrawings(): void {
    this.leafletComponent?.saveDrawings();
  }
}
