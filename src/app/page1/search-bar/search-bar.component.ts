import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { Location, searchLocations } from '../../../utils/location-utils';

@Component({
  selector: 'app-search-bar',
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.css',
  imports: [MatIconModule, ReactiveFormsModule]
})
export class SearchBarComponent implements OnInit, OnDestroy {
  @Output() locationSelect = new EventEmitter<Location>();
  @Output() resetLocations = new EventEmitter<void>();
  @Output() confirmLocations = new EventEmitter<Location[]>();
  @Output() locationSelected = new EventEmitter<{ lat: number, lng: number }>();
  @Output() startGlobeRotation = new EventEmitter<void>();
  @Output() resetDrawings = new EventEmitter<void>();
  @Output() saveDrawings = new EventEmitter<void>();

  @Input() drawingsGeoJson: any;


  searchControl = new FormControl('');
  results: Location[] = [];
  selectedLocations: Location[] = [];
  isLoading = false;
  selectedLocation: Location | null = null;
  showResults = false;
  isOfflineMode = false;
  
  private destroy$ = new Subject<void>();

  constructor(private snackBar: MatSnackBar) {}

  ngOnInit(): void {
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
    console.log('Location selected in search component:', location);
    const isAlreadySelected = this.selectedLocations.some(
      loc => loc.label === location.label || (loc.x === location.x && loc.y === location.y)
    );
    if (!isAlreadySelected) {
      this.selectedLocations.push(location);
      this.selectedLocation = location;
      this.snackBar.open(`Added: ${location.label}`, 'Dismiss', {
        duration: 2000,
      });
      this.locationSelect.emit(location);
      this.locationSelected.emit({ lat: location.y, lng: location.x });
    } else {
      this.snackBar.open(`Location already selected: ${location.label}`, 'Dismiss', {
        duration: 2000,
      });
    }
    // Clear search after selection
    this.searchControl.setValue('');
    this.showResults = false;
    this.results = [];
  }

  removeLocation(location: Location): void {
    this.startGlobeRotation.emit(); // Notify parent to start rotation
    this.selectedLocations = this.selectedLocations.filter(
      loc => loc.label !== location.label
    );
    if (this.selectedLocation?.label === location.label) {
      this.selectedLocation = this.selectedLocations.length > 0 ? this.selectedLocations[this.selectedLocations.length - 1] : null;
    }
    this.snackBar.open(`Removed: ${location.label}`, 'Dismiss', {
      duration: 2000,
    });
  }

  handleClear(): void {
    this.searchControl.setValue('');
    this.results = [];
    this.showResults = false;
    this.startGlobeRotation.emit(); // Notify parent to start rotation
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
    this.selectedLocation = null;
    this.handleClear();
    this.resetLocations.emit();
    this.resetDrawings.emit();
    this.snackBar.open('All locations cleared', 'Dismiss', {
      duration: 2000,
    });
    this.startGlobeRotation.emit(); // Notify parent to start rotation
  }

  handleConfirm(): void {
    if (this.selectedLocations.length > 0) {
      this.confirmLocations.emit(this.selectedLocations);
      this.snackBar.open(`Confirmed ${this.selectedLocations.length} location(s) for site boundary`, 'Dismiss', {
        duration: 3000,
      });
      this.saveDrawings.emit();
    } else {
      this.snackBar.open('Please select at least one location first', 'Dismiss', {
        duration: 2000,
        panelClass: ['error-snackbar']
      });
    }
  }
}