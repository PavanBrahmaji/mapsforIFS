import { Component } from '@angular/core';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { MapsComponent } from './maps/maps.component';

@Component({
  selector: 'app-page1',
  imports: [SearchBarComponent,MapsComponent],
  templateUrl: './page1.component.html',
  styleUrl: './page1.component.css'
})
export class Page1Component {

}
