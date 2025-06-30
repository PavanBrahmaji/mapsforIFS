import { CommonModule } from '@angular/common';
import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as L from 'leaflet';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { Location, searchLocations } from '../../../utils/location-utils';
import { GlobalService } from '../../global.service';
import { FlyAnimationService } from '../../services/fly-animation.service';

const redIcon = L.icon({
  iconUrl: 'images/marker.svg',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

@Component({
  selector: 'app-depart-page1',
  templateUrl: './depart-page1.component.html',
  styleUrls: ['./depart-page1.component.css'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule]
})
export class DepartPage1Component implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  // Search functionality properties
  searchControl = new FormControl('');
  results: Location[] = [];
  selectedLocations: Location[] = [];
  isLoading = false;
  showResults = false;
  isOfflineMode = false;
  private destroy$ = new Subject<void>();

  // Existing properties
  public searchQuery: string = '';
  public markerLabel: string = '';
  public selectedLocation: { lat: number, lng: number } | null = null;
  public defaultLat: number = 39.8283;
  public defaultLon: number = -98.5795;

  private map!: L.Map;
  private drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw;
  private selectedLocationMarker?: L.Marker;

  // Dropdown properties
  public selectedCountry: string = '';
  public selectedRegion: string = '';
  public selectedCounty: string = '';
  public selectedTownCity: string = '';

  // Data arrays for dropdowns
  public countries: string[] = [
    'United States',
    'Canada',
    'Mexico',
    'United Kingdom',
    'Germany',
    'France',
    'Australia'
  ];

  public regions: string[] = [];
  public counties: string[] = [];
  public townCities: string[] = [];

  // Sample data structure for cascading dropdowns
  private locationData: any = {
    'United States': {
      'Washington': {
        'King': ['Seattle', 'Bellevue', 'Redmond', 'Kirkland'],
        'Pierce': ['Tacoma', 'Lakewood', 'Puyallup'],
        'Snohomish': ['Everett', 'Lynnwood', 'Edmonds']
      },
      'California': {
        'Los Angeles': ['Los Angeles', 'Long Beach', 'Glendale'],
        'San Francisco': ['San Francisco', 'Oakland', 'Berkeley'],
        'Orange': ['Anaheim', 'Santa Ana', 'Irvine']
      },
      'New York': {
        'New York': ['New York City', 'Brooklyn', 'Queens'],
        'Nassau': ['Hempstead', 'Oyster Bay', 'North Hempstead'],
        'Suffolk': ['Islip', 'Brookhaven', 'Huntington']
      }
    },
    'Canada': {
      'Ontario': {
        'Toronto': ['Toronto', 'Mississauga', 'Brampton'],
        'Ottawa': ['Ottawa', 'Kanata', 'Nepean']
      },
      'British Columbia': {
        'Vancouver': ['Vancouver', 'Surrey', 'Burnaby'],
        'Victoria': ['Victoria', 'Saanich', 'Esquimalt']
      }
    },
    'United Kingdom': {
      'England': {
        'Greater London': ['London', 'Westminster', 'Camden'],
        'Greater Manchester': ['Manchester', 'Salford', 'Stockport']
      },
      'Scotland': {
        'Glasgow': ['Glasgow', 'East Renfrewshire', 'Renfrewshire'],
        'Edinburgh': ['Edinburgh', 'Midlothian', 'East Lothian']
      }
    }
  };

  constructor(
    private snackBar: MatSnackBar,
    public globalService: GlobalService,
    private flyAnimationService: FlyAnimationService // Inject the service
  ) { }

  ngAfterViewInit(): void {
    this.initializeMap();
    this.flyAnimationService.setMap(this.map); // Set the map instance for the service
    this.checkOnlineStatus();
    this.setupSearchListener();
    window.addEventListener('online', this.updateOnlineStatus);
    window.addEventListener('offline', this.updateOnlineStatus);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('online', this.updateOnlineStatus);
    window.removeEventListener('offline', this.updateOnlineStatus);
  }

  private checkOnlineStatus(): void {
    this.isOfflineMode = !navigator.onLine;
    if (this.isOfflineMode) {
      this.showOfflineWarning();
    }
  }

  private updateOnlineStatus = () => {
    this.isOfflineMode = !navigator.onLine;
    if (this.isOfflineMode) {
      this.showOfflineWarning();
    }
  };

  private showOfflineWarning(): void {
    this.snackBar.open('Working in offline mode. Limited search results available.', 'Dismiss', {
      duration: 3000,
      panelClass: ['offline-warning']
    });
  }

  private setupSearchListener(): void {
    this.searchControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      if (query && query.length >= 3) {
        this.performSearch(query);
      } else {
        this.results = [];
        this.showResults = false;
      }
    });
  }

  private performSearch(query: string): void {
    this.isLoading = true;
    searchLocations(query).then(locations => {
      this.results = locations;
      this.showResults = true;
      if (locations.length === 0) {
        this.showNoResultsWarning();
      }
      if (this.isOfflineMode && locations.length > 0) {
        this.showOfflineDataWarning();
      }
    }).catch(error => {
      console.error("Error during search:", error);
      this.showSearchError();
    }).finally(() => {
      this.isLoading = false;
    });
  }

  private showNoResultsWarning(): void {
    this.snackBar.open('No results found. Try a different search term.', 'Dismiss', {
      duration: 3000,
    });
  }

  private showOfflineDataWarning(): void {
    this.snackBar.open('Using offline data. Limited locations are available in offline mode.', 'Dismiss', {
      duration: 3000,
    });
  }

  private showSearchError(): void {
    this.snackBar.open('Search error: Could not complete the search request', 'Dismiss', {
      duration: 3000,
      panelClass: ['error-snackbar']
    });
  }

  handleSelect(location: Location): void {
    const isAlreadySelected = this.selectedLocations.some(
      loc => loc.label === location.label || (loc.x === location.x && loc.y === location.y)
    );

    if (!isAlreadySelected) {
      this.selectedLocations = [location];
      this.snackBar.open(`Added: ${location.label}`, 'Dismiss', {
        duration: 2000,
      });

      this.addMarkerForSelectedLocation(location);

      if (this.map && location.x && location.y) {
        // Use the flyAnimationService here
        this.flyAnimationService.flyToLocation([location.y, location.x], {
          targetZoom: 16,
          duration: 1500, // Customize duration
          showLoadingIndicator: true,
          mapContainerRef: this.mapContainer.nativeElement
        }).subscribe(() => {
          console.log('Fly animation completed!');
        });
      }
    } else {
      this.snackBar.open(`Location already selected: ${location.label}`, 'Dismiss', {
        duration: 2000,
      });
    }

    this.searchControl.setValue('');
    this.showResults = false;
    this.results = [];
  }

  private addMarkerForSelectedLocation(location: Location): void {
    if (this.selectedLocationMarker) {
      this.map.removeLayer(this.selectedLocationMarker);
    }

    if (location.x && location.y) {
      this.selectedLocationMarker = L.marker([location.y, location.x], { icon: redIcon })
        .addTo(this.map)
        .bindTooltip(`<div >${location.label}</div>`, {
          permanent: true,
          direction: 'top',
          className: 'custom-tooltip-dept',
          interactive: false
        })
        .openTooltip();

      this.selectedLocationMarker.options.draggable = true;
      this.selectedLocationMarker.dragging?.enable();

      this.selectedLocationMarker.on('dragend', (e: any) => {
        const marker = e.target;
        const position = marker.getLatLng();

        if (this.selectedLocations.length > 0) {
          this.selectedLocations[0].x = position.lng;
          this.selectedLocations[0].y = position.lat;
        }

        this.snackBar.open(`Location updated to: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`, 'Dismiss', {
          duration: 3000,
        });
      });
    }
  }

  handleClear(): void {
    this.searchControl.setValue('');
    this.results = [];
    this.showResults = false;
  }

  handleSubmit(event: Event): void {
    event.preventDefault();
    const query = this.searchControl.value;
    if (this.results.length > 0) {
      this.handleSelect(this.results[0]);
    } else if (query && query.length >= 3) {
      this.isLoading = true;
      searchLocations(query).then(locations => {
        this.isLoading = false;
        if (locations.length > 0) {
          this.handleSelect(locations[0]);
        } else {
          this.snackBar.open('No locations found. Try entering a more specific address.', 'Dismiss', {
            panelClass: ['error-snackbar']
          });
        }
      }).catch(error => {
        this.isLoading = false;
        this.showSearchError();
      });
    }
  }

  handleReset(): void {
    this.selectedLocations = [];
    this.handleClear();

    if (this.selectedLocationMarker) {
      this.map.removeLayer(this.selectedLocationMarker);
      this.selectedLocationMarker = undefined;
    }

    this.snackBar.open('Location cleared', 'Dismiss', {
      duration: 2000,
    });
  }

  handleConfirm(): void {
    if (this.selectedLocations.length > 0) {
      const newMarker = {
        label: this.selectedLocations[0].label,
        lat: this.selectedLocations[0].y,
        lng: this.selectedLocations[0].x,
        timestamp: new Date().toISOString()
      };

      localStorage.setItem('departmentMarker', JSON.stringify(newMarker));

      this.snackBar.open(`Confirmed location for site boundary`, 'Dismiss', {
        duration: 3000,
      });
    } else {
      this.snackBar.open('Please select at least one location first', 'Dismiss', {
        duration: 2000,
        panelClass: ['error-snackbar']
      });
    }
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false
    }).setView([this.defaultLat, this.defaultLon], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.initializeDrawing();
  }

  private initializeDrawing(): void {
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    this.updateDrawControl(true);

    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      if (layer instanceof L.Marker) {
        this.handleNewMarker(layer);
      }
    });
  }

  private handleNewMarker(marker: L.Marker): void {
    marker.setIcon(redIcon);

    if (this.markerLabel.trim()) {
      marker.bindTooltip(this.markerLabel, {
        permanent: true,
        direction: 'top',
        className: 'custom-tooltip',
        interactive: false
      }).openTooltip();
    }

    this.makeMarkerDraggable(marker);
    this.drawnItems.addLayer(marker);
    this.updateDrawControl(false);
  }

  public onMarkerLabelChange(): void {
    const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    this.updateDrawControl(!hasMarker && this.markerLabel.trim() !== '');
  }

  private makeMarkerDraggable(marker: L.Marker): void {
    marker.options.draggable = true;
    marker.dragging?.enable();
  }

  private updateDrawControl(enableMarker: boolean): void {
    if (this.drawControl) {
      this.map.removeControl(this.drawControl);
    }

    this.drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        marker: false,
        circle: false,
        circlemarker: false,
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

  public onCountryChange(): void {
    this.selectedRegion = '';
    this.selectedCounty = '';
    this.selectedTownCity = '';
    this.counties = [];
    this.townCities = [];

    if (this.selectedCountry && this.locationData[this.selectedCountry]) {
      this.regions = Object.keys(this.locationData[this.selectedCountry]);
    } else {
      this.regions = [];
    }
  }

  public onRegionChange(): void {
    this.selectedCounty = '';
    this.selectedTownCity = '';
    this.townCities = [];

    if (this.selectedCountry && this.selectedRegion &&
      this.locationData[this.selectedCountry] &&
      this.locationData[this.selectedCountry][this.selectedRegion]) {
      this.counties = Object.keys(this.locationData[this.selectedCountry][this.selectedRegion]);
    } else {
      this.counties = [];
    }
  }

  public onCountyChange(): void {
    this.selectedTownCity = '';

    if (this.selectedCountry && this.selectedRegion && this.selectedCounty &&
      this.locationData[this.selectedCountry] &&
      this.locationData[this.selectedCountry][this.selectedRegion] &&
      this.locationData[this.selectedCountry][this.selectedRegion][this.selectedCounty]) {
      this.townCities = this.locationData[this.selectedCountry][this.selectedRegion][this.selectedCounty];
    } else {
      this.townCities = [];
    }
  }

  onSearch(): void {
    if (this.searchQuery.trim()) {
      this.performSearch(this.searchQuery);
    }
  }
}