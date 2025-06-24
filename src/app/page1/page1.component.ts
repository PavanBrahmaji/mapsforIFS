import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { MapsComponent } from './maps/maps.component';
import { GlobalService } from '../global.service'; // <-- Import GlobalService

@Component({
  selector: 'app-page1',
  imports: [FormsModule, SearchBarComponent, MapsComponent],
  templateUrl: './page1.component.html',
  styleUrl: './page1.component.css'
})
export class Page1Component {
  public selectedLocation: { lat: number, lng: number } | null = null;
  public site: string = '';

  constructor(private globalService: GlobalService) {} // <-- Inject GlobalService

  locationSelect(location: { lat: number, lng: number }) {
    this.selectedLocation = location;
  }

  // Call this method whenever you want to save the site value globally
  saveSiteValue() {
    this.globalService.site = this.site;
    }
}
