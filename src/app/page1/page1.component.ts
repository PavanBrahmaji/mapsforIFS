import { Component } from '@angular/core';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { MapsComponent } from './maps/maps.component';

@Component({
  selector: 'app-page1',
  imports: [SearchBarComponent, MapsComponent],
  templateUrl: './page1.component.html',
  styleUrl: './page1.component.css'
})
export class Page1Component {
  public selectedLocation: { lat: number, lng: number } | null = null;
  public drawingsGeoJson: any = null;

  locationSelect(location: { lat: number, lng: number }) {
    this.selectedLocation = location;
  }

  // This method will be called when (drawingsChanged) is emitted by MapsComponent
  onDrawingsChanged(drawings: any): void {
    this.drawingsGeoJson = drawings;
  }
  
}
