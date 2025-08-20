// page11.component.ts
import { 
  Component, 
  AfterViewInit, 
  NgZone, 
  OnDestroy, 
  inject,
  signal,
  computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapLoaderService } from '../services/map-loader.service';

declare var google: any;

interface PolygonCoordinate {
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-page11',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container">
      <div class="map-header">
        <h2>Polygon Drawing Tool</h2>
        <div class="status-indicator" [class.loading]="isLoading()" [class.ready]="isMapReady()">
          {{ mapStatus() }}
        </div>
      </div>
      
      <div id="map" class="map" [class.loading]="isLoading()"></div>
      
      <div class="controls">
        <button 
          (click)="toggleDrawing(true)" 
          class="btn btn-primary"
          [disabled]="!isMapReady() || isDrawingEnabled()"
          type="button">
          <span class="icon">✏️</span>
          Enable Drawing
        </button>
        
        <button 
          (click)="toggleDrawing(false)" 
          class="btn btn-secondary"
          [disabled]="!isMapReady() || !isDrawingEnabled()"
          type="button">
          <span class="icon">🚫</span>
          Disable Drawing
        </button>
        
        <button 
          (click)="clearAllPolygons()" 
          class="btn btn-danger"
          [disabled]="!isMapReady() || polygonCount() === 0"
          type="button">
          <span class="icon">🗑️</span>
          Clear All ({{ polygonCount() }})
        </button>
        
        <button 
          (click)="exportCoordinates()" 
          class="btn btn-success"
          [disabled]="!isMapReady() || polygonCount() === 0"
          type="button">
          <span class="icon">💾</span>
          Export Coordinates
        </button>
      </div>
      
      @if (lastPolygonCoordinates().length > 0) {
        <div class="coordinates-panel">
          <h3>Latest Polygon Coordinates</h3>
          <div class="coordinates-list">
            @for (coord of lastPolygonCoordinates(); track $index) {
              <div class="coordinate-item">
                <span class="coord-label">Point {{ $index + 1 }}:</span>
                <span class="coord-value">{{ coord.lat.toFixed(6) }}, {{ coord.lng.toFixed(6) }}</span>
              </div>
            }
          </div>
        </div>
      }
      
      @if (errorMessage()) {
        <div class="error-message">
          <span class="error-icon">⚠️</span>
          {{ errorMessage() }}
          <button (click)="clearError()" class="error-close" type="button">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .map-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    .map-header {
      padding: 1rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .map-header h2 {
      margin: 0;
      font-weight: 300;
    }

    .status-indicator {
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.3s ease;
    }

    .status-indicator.loading {
      background-color: rgba(255, 193, 7, 0.2);
      border: 1px solid #ffc107;
      color: #856404;
    }

    .status-indicator.ready {
      background-color: rgba(40, 167, 69, 0.2);
      border: 1px solid #28a745;
      color: #155724;
    }

    .map {
      flex: 1;
      min-height: 400px;
      position: relative;
      transition: opacity 0.3s ease;
    }

    .map.loading {
      opacity: 0.7;
    }

    .map.loading::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 40px;
      height: 40px;
      margin: -20px 0 0 -20px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      z-index: 1000;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .controls {
      padding: 1rem;
      background-color: #f8f9fa;
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      border-top: 1px solid #dee2e6;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }

    .btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .btn-primary {
      background: linear-gradient(135deg, #007bff, #0056b3);
      color: white;
    }

    .btn-secondary {
      background: linear-gradient(135deg, #6c757d, #545b62);
      color: white;
    }

    .btn-danger {
      background: linear-gradient(135deg, #dc3545, #bd2130);
      color: white;
    }

    .btn-success {
      background: linear-gradient(135deg, #28a745, #1e7e34);
      color: white;
    }

    .icon {
      font-size: 1rem;
    }

    .coordinates-panel {
      max-height: 200px;
      overflow-y: auto;
      background-color: #ffffff;
      border-top: 1px solid #dee2e6;
      padding: 1rem;
    }

    .coordinates-panel h3 {
      margin: 0 0 1rem 0;
      color: #495057;
      font-size: 1rem;
      font-weight: 600;
    }

    .coordinates-list {
      display: grid;
      gap: 0.5rem;
    }

    .coordinate-item {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem;
      background-color: #f8f9fa;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
    }

    .coord-label {
      font-weight: 600;
      color: #6c757d;
    }

    .coord-value {
      color: #495057;
    }

    .error-message {
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
      padding: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      position: relative;
    }

    .error-icon {
      font-size: 1.2rem;
    }

    .error-close {
      position: absolute;
      right: 1rem;
      background: none;
      border: none;
      color: #721c24;
      cursor: pointer;
      font-size: 1.2rem;
      font-weight: bold;
    }

    .error-close:hover {
      color: #491217;
    }

    @media (max-width: 768px) {
      .map-header {
        flex-direction: column;
        gap: 0.5rem;
      }

      .controls {
        justify-content: center;
      }

      .btn {
        flex: 1;
        min-width: 140px;
      }
    }
  `]
})
export class Page11Component implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private map: google.maps.Map | null = null;
  private drawingManager: google.maps.drawing.DrawingManager | null = null;
  private overlayCompleteListener: google.maps.MapsEventListener | null = null;
  private polygons: google.maps.Polygon[] = [];

  // Reactive state using signals
  protected readonly isLoading = signal(true);
  protected readonly isMapReady = signal(false);
  protected readonly isDrawingEnabled = signal(false);
  protected readonly polygonCount = signal(0);
  protected readonly lastPolygonCoordinates = signal<PolygonCoordinate[]>([]);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly mapStatus = computed(() => {
    if (this.isLoading()) return 'Loading...';
    if (this.isMapReady()) return 'Ready';
    return 'Initializing...';
  });

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnDestroy(): void {
    this.cleanupResources();
  }

  private async initializeMap(): Promise<void> {
    try {
      this.isLoading.set(true);
      this.errorMessage.set(null);

      await this.zone.runOutsideAngular(async () => {
        await MapLoaderService.load();
        this.createMap();
        this.setupDrawingManager();
        this.setupEventListeners();
      });

      this.isLoading.set(false);
      this.isMapReady.set(true);
    } catch (error) {
      console.error('Failed to initialize Google Maps:', error);
      this.errorMessage.set('Failed to load Google Maps. Please refresh the page and try again.');
      this.isLoading.set(false);
    }
  }

  private createMap(): void {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      throw new Error('Map element not found');
    }

    this.map = new google.maps.Map(mapElement, {
      center: { lat: -34.397, lng: 150.644 },
      zoom: 8,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: [
        {
          featureType: 'water',
          elementType: 'geometry.fill',
          stylers: [{ color: '#d3d3d3' }]
        },
        {
          featureType: 'transit',
          stylers: [{ color: '#808080' }, { visibility: 'off' }]
        }
      ]
    });
  }

  private setupDrawingManager(): void {
    if (!this.map) return;

    this.drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null, // Start with drawing disabled
      drawingControl: false, // We'll use our custom controls
      polygonOptions: {
        fillColor: '#3367d6',
        fillOpacity: 0.3,
        strokeColor: '#3367d6',
        strokeWeight: 2,
        clickable: true,
        editable: true,
        zIndex: 1,
      },
    });

    if (this.drawingManager && this.map) {
      this.drawingManager.setMap(this.map);
    }
  }

  private setupEventListeners(): void {
    if (!this.drawingManager) return;

    this.overlayCompleteListener = google.maps.event.addListener(
      this.drawingManager,
      'overlaycomplete',
      (event: google.maps.drawing.OverlayCompleteEvent) => {
        this.zone.run(() => {
          this.handleOverlayComplete(event);
        });
      }
    );
  }

  private handleOverlayComplete(event: google.maps.drawing.OverlayCompleteEvent): void {
    if (event.type === google.maps.drawing.OverlayType.POLYGON) {
      const polygon = event.overlay as google.maps.Polygon;
      this.polygons.push(polygon);
      
      const coordinates = this.getPolygonCoordinates(polygon);
      this.lastPolygonCoordinates.set(coordinates);
      this.polygonCount.set(this.polygons.length);

      // Automatically disable drawing after completing a polygon
      this.toggleDrawing(false);

      // Add click listener to polygon for deletion
      google.maps.event.addListener(polygon, 'click', () => {
        this.removePolygon(polygon);
      });

      console.log('New polygon created with coordinates:', coordinates);
    }
  }

  private getPolygonCoordinates(polygon: google.maps.Polygon): PolygonCoordinate[] {
    const path = polygon.getPath();
    return path.getArray().map(latLng => ({
      lat: latLng.lat(),
      lng: latLng.lng()
    }));
  }

  private removePolygon(polygon: google.maps.Polygon): void {
    const index = this.polygons.indexOf(polygon);
    if (index > -1) {
      polygon.setMap(null);
      this.polygons.splice(index, 1);
      this.polygonCount.set(this.polygons.length);
      
      if (this.polygons.length === 0) {
        this.lastPolygonCoordinates.set([]);
      }
    }
  }

  private cleanupResources(): void {
    if (this.overlayCompleteListener) {
      google.maps.event.removeListener(this.overlayCompleteListener);
    }

    this.polygons.forEach(polygon => {
      google.maps.event.clearInstanceListeners(polygon);
    });

    this.polygons = [];
  }

  // Public methods for template
  protected toggleDrawing(enable: boolean): void {
    if (!this.drawingManager) return;

    this.drawingManager.setDrawingMode(
      enable ? google.maps.drawing.OverlayType.POLYGON : null
    );
    this.isDrawingEnabled.set(enable);
  }

  protected clearAllPolygons(): void {
    this.polygons.forEach(polygon => {
      polygon.setMap(null);
      google.maps.event.clearInstanceListeners(polygon);
    });
    
    this.polygons = [];
    this.polygonCount.set(0);
    this.lastPolygonCoordinates.set([]);
    this.isDrawingEnabled.set(false);
    this.drawingManager?.setDrawingMode(null);
  }

  protected exportCoordinates(): void {
    if (this.polygons.length === 0) return;

    const allCoordinates = this.polygons.map((polygon, index) => ({
      polygonId: index + 1,
      coordinates: this.getPolygonCoordinates(polygon)
    }));

    const dataStr = JSON.stringify(allCoordinates, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `polygon-coordinates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  protected clearError(): void {
    this.errorMessage.set(null);
  }
}

// services/map-loader.service.ts
