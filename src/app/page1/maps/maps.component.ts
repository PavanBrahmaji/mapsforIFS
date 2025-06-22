import { Component, Input, ViewChild } from '@angular/core';
import { GlobeComponent } from './globe/globe.component';

@Component({
  selector: 'app-maps',
  imports: [GlobeComponent],
  templateUrl: './maps.component.html',
  styleUrl: './maps.component.css'
})
export class MapsComponent {

  @Input() selectedLocation: { lat: number, lng: number } | null = null;
  @ViewChild(GlobeComponent) globeComponent!: GlobeComponent;

  startGlobeRotation(): void {
    if (this.globeComponent) {
      this.globeComponent.startAutoRotation();
    }
  }

  ngOnChanges() {
    if (this.selectedLocation && this.globeComponent) {
      this.globeComponent.flyTo(this.selectedLocation.lat, this.selectedLocation.lng);
    }
  }

}
