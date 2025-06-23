import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms'; // <-- Add this import
import { SearchBarComponent } from './search-bar/search-bar.component';
import { MapsComponent } from './maps/maps.component';

@Component({
  selector: 'app-page1',
  imports: [FormsModule, SearchBarComponent, MapsComponent], // <-- Add FormsModule here
  templateUrl: './page1.component.html',
  styleUrl: './page1.component.css'
})
export class Page1Component {
  public selectedLocation: { lat: number, lng: number } | null = null;
  public site: string = '';

  locationSelect(location: { lat: number, lng: number }) {
    this.selectedLocation = location;
  }
}
