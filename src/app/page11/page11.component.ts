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

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

interface PolygonBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  center: { lat: number; lng: number };
  width: number;
  height: number;
  aspectRatio: number;
}

@Component({
  selector: 'app-page11',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container">
      <div class="map-header">
        <h2>Polygon Drawing Tool with Image Overlay</h2>
        <div class="status-indicator" [class.loading]="isLoading()" [class.ready]="isMapReady()">
          {{ mapStatus() }}
        </div>
      </div>
      
      <div id="map" class="map" [class.loading]="isLoading()"></div>
      
      <div class="controls">
        <!-- Image Upload Section -->
        <div class="upload-section">
          <label for="imageUpload" class="btn btn-info">
            <span class="icon">📷</span>
            Upload Image
          </label>
          <input 
            type="file" 
            id="imageUpload"
            accept="image/*" 
            (change)="onImageUpload($event)" 
            style="display: none;" />
          @if (uploadedImageInfo()) {
            <div class="image-info">
              <small>{{ uploadedImageInfo()!.width }}×{{ uploadedImageInfo()!.height }} 
              ({{ uploadedImageInfo()!.aspectRatio.toFixed(2) }}:1)</small>
            </div>
          }
        </div>

        <!-- Drawing Controls -->
        <div class="drawing-section">
          <button 
            (click)="setDrawingMode('polygon')" 
            class="btn btn-primary"
            [class.active]="drawingMode() === 'polygon'"
            [disabled]="!isMapReady()"
            type="button">
            <span class="icon">⬟</span>
            Draw Polygon
          </button>
          
          <button 
            (click)="setDrawingMode('rectangle')" 
            class="btn btn-primary"
            [class.active]="drawingMode() === 'rectangle'"
            [disabled]="!isMapReady()"
            type="button">
            <span class="icon">⬛</span>
            Draw Rectangle
          </button>
          
          <button 
            (click)="setDrawingMode(null)" 
            class="btn btn-secondary"
            [disabled]="!isMapReady()"
            type="button">
            <span class="icon">🚫</span>
            Stop Drawing
          </button>
        </div>

        <!-- Action Controls -->
        <div class="action-section">
          <button 
            (click)="overlayImageOnSelected()" 
            class="btn btn-success"
            [disabled]="!isMapReady() || !uploadedImageInfo() || !selectedPolygon()"
            type="button">
            <span class="icon">🖼️</span>
            Overlay Image
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
            class="btn btn-info"
            [disabled]="!isMapReady() || polygonCount() === 0"
            type="button">
            <span class="icon">💾</span>
            Export Data
          </button>
        </div>
      </div>
      
      <!-- Info Panels -->
      @if (selectedPolygon()) {
        <div class="info-panel">
          <h3>Selected Polygon Info</h3>
          <div class="polygon-info">
            <div>Bounds: {{ getPolygonBounds(selectedPolygon()!).width.toFixed(6) }}° × {{ getPolygonBounds(selectedPolygon()!).height.toFixed(6) }}°</div>
            <div>Aspect Ratio: {{ getPolygonBounds(selectedPolygon()!).aspectRatio.toFixed(2) }}:1</div>
            @if (uploadedImageInfo()) {
              <div class="ratio-comparison" [class.warning]="!ratiosMatch()">
                Image Ratio: {{ uploadedImageInfo()!.aspectRatio.toFixed(2) }}:1
                <span *ngIf="!ratiosMatch()" class="ratio-warning">⚠️ Ratios don't match</span>
              </div>
            }
          </div>
        </div>
      }
      
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

    .controls {
      padding: 1rem;
      background-color: #f8f9fa;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      border-top: 1px solid #dee2e6;
      align-items: center;
    }

    .upload-section, .drawing-section, .action-section {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .upload-section {
      border-right: 1px solid #dee2e6;
      padding-right: 1rem;
    }

    .drawing-section {
      border-right: 1px solid #dee2e6;
      padding-right: 1rem;
    }

    .image-info {
      font-size: 0.75rem;
      color: #6c757d;
      margin-top: 0.25rem;
    }

    .btn {
      padding: 0.5rem 1rem;
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

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .btn.active {
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
      transform: translateY(1px);
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

    .btn-info {
      background: linear-gradient(135deg, #17a2b8, #117a8b);
      color: white;
    }

    .info-panel {
      padding: 1rem;
      background-color: #e3f2fd;
      border-top: 1px solid #bbdefb;
    }

    .info-panel h3 {
      margin: 0 0 0.5rem 0;
      color: #1976d2;
      font-size: 1rem;
    }

    .polygon-info {
      font-size: 0.875rem;
      color: #424242;
    }

    .polygon-info > div {
      margin-bottom: 0.25rem;
    }

    .ratio-comparison.warning {
      color: #f57c00;
    }

    .ratio-warning {
      margin-left: 0.5rem;
      font-weight: bold;
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

    .error-close {
      position: absolute;
      right: 1rem;
      background: none;
      border: none;
      color: #721c24;
      cursor: pointer;
      font-size: 1.2rem;
    }

    @media (max-width: 768px) {
      .controls {
        flex-direction: column;
        align-items: stretch;
      }

      .upload-section, .drawing-section, .action-section {
        border-right: none;
        border-bottom: 1px solid #dee2e6;
        padding-bottom: 1rem;
        justify-content: center;
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
  private groundOverlays: google.maps.GroundOverlay[] = [];

  // Reactive state using signals
  protected readonly isLoading = signal(true);
  protected readonly isMapReady = signal(false);
  protected readonly drawingMode = signal<string | null>(null);
  protected readonly polygonCount = signal(0);
  protected readonly selectedPolygon = signal<google.maps.Polygon | null>(null);
  protected readonly lastPolygonCoordinates = signal<PolygonCoordinate[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly uploadedImageInfo = signal<ImageDimensions | null>(null);

  private uploadedImageUrl: string | null = null;

  protected readonly mapStatus = computed(() => {
    if (this.isLoading()) return 'Loading...';
    if (this.isMapReady()) return 'Ready';
    return 'Initializing...';
  });

  protected readonly ratiosMatch = computed(() => {
    const imageInfo = this.uploadedImageInfo();
    const polygon = this.selectedPolygon();
    if (!imageInfo || !polygon) return true;
    
    const polygonBounds = this.getPolygonBounds(polygon);
    const ratioDiff = Math.abs(imageInfo.aspectRatio - polygonBounds.aspectRatio);
    return ratioDiff < 0.1; // Allow 10% tolerance
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
    });
  }

  private setupDrawingManager(): void {
  if (!this.map) return;

  const drawingManager = new google.maps.drawing.DrawingManager({
    drawingMode: null,
    drawingControl: false,
    polygonOptions: {
      fillColor: '#3367d6',
      fillOpacity: 0.3,
      strokeColor: '#3367d6',
      strokeWeight: 2,
      clickable: true,
      editable: true,
      zIndex: 1,
    },
    rectangleOptions: {
      fillColor: '#ff6b35',
      fillOpacity: 0.3,
      strokeColor: '#ff6b35',
      strokeWeight: 2,
      clickable: true,
      editable: true,
      zIndex: 1,
    }
  });

  drawingManager.setMap(this.map);
  this.drawingManager = drawingManager; // Assign after successful creation
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
    const shape = event.overlay;
    let coordinates: PolygonCoordinate[] = [];

    if (event.type === google.maps.drawing.OverlayType.POLYGON) {
      const polygon = shape as google.maps.Polygon;
      coordinates = this.getPolygonCoordinates(polygon);
      this.polygons.push(polygon);
      this.setupPolygonListeners(polygon);
    } else if (event.type === google.maps.drawing.OverlayType.RECTANGLE) {
      const rectangle = shape as google.maps.Rectangle;
      const bounds = rectangle.getBounds()!;
      const polygon = this.rectangleToPolygon(rectangle);
      coordinates = this.getPolygonCoordinates(polygon);
      this.polygons.push(polygon);
      this.setupPolygonListeners(polygon);
      
      // Remove the rectangle since we converted it to polygon
      rectangle.setMap(null);
    }

    this.lastPolygonCoordinates.set(coordinates);
    this.polygonCount.set(this.polygons.length);
    this.setDrawingMode(null);
  }

  private rectangleToPolygon(rectangle: google.maps.Rectangle): google.maps.Polygon {
    const bounds = rectangle.getBounds()!;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    
    const polygonCoords = [
      { lat: ne.lat(), lng: sw.lng() }, // NW
      { lat: ne.lat(), lng: ne.lng() }, // NE  
      { lat: sw.lat(), lng: ne.lng() }, // SE
      { lat: sw.lat(), lng: sw.lng() }, // SW
    ];

    const polygon = new google.maps.Polygon({
      paths: polygonCoords,
      fillColor: '#ff6b35',
      fillOpacity: 0.3,
      strokeColor: '#ff6b35',
      strokeWeight: 2,
      clickable: true,
      editable: true,
      zIndex: 1,
    });

    polygon.setMap(this.map);
    return polygon;
  }

  private setupPolygonListeners(polygon: google.maps.Polygon): void {
    google.maps.event.addListener(polygon, 'click', () => {
      this.selectedPolygon.set(polygon);
      this.highlightPolygon(polygon);
    });

    google.maps.event.addListener(polygon, 'rightclick', () => {
      this.removePolygon(polygon);
    });
  }

  private highlightPolygon(selectedPolygon: google.maps.Polygon): void {
    // Reset all polygons to normal style
    this.polygons.forEach(polygon => {
      polygon.setOptions({
        strokeWeight: 2,
        strokeOpacity: 1
      });
    });

    // Highlight selected polygon
    selectedPolygon.setOptions({
      strokeWeight: 4,
      strokeOpacity: 1
    });
  }

  private getPolygonCoordinates(polygon: google.maps.Polygon): PolygonCoordinate[] {
    const path = polygon.getPath();
    return path.getArray().map(latLng => ({
      lat: latLng.lat(),
      lng: latLng.lng()
    }));
  }

  protected getPolygonBounds(polygon: google.maps.Polygon): PolygonBounds {
    const path = polygon.getPath();
    const bounds = new google.maps.LatLngBounds();
    
    path.forEach(latLng => {
      bounds.extend(latLng);
    });

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = bounds.getCenter();
    
    const width = ne.lng() - sw.lng();
    const height = ne.lat() - sw.lat();
    
    return {
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
      center: { lat: center.lat(), lng: center.lng() },
      width,
      height,
      aspectRatio: width / height
    };
  }

  private removePolygon(polygon: google.maps.Polygon): void {
    const index = this.polygons.indexOf(polygon);
    if (index > -1) {
      polygon.setMap(null);
      this.polygons.splice(index, 1);
      this.polygonCount.set(this.polygons.length);
      
      if (this.selectedPolygon() === polygon) {
        this.selectedPolygon.set(null);
      }
      
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

    this.groundOverlays.forEach(overlay => {
      overlay.setMap(null);
    });

    this.polygons = [];
    this.groundOverlays = [];
  }

  // Public methods for template
  protected setDrawingMode(mode: string | null): void {
    if (!this.drawingManager) return;

    let drawingMode = null;
    if (mode === 'polygon') {
      drawingMode = google.maps.drawing.OverlayType.POLYGON;
    } else if (mode === 'rectangle') {
      drawingMode = google.maps.drawing.OverlayType.RECTANGLE;
    }

    this.drawingManager.setDrawingMode(drawingMode);
    this.drawingMode.set(mode);
  }

  protected overlayImageOnSelected(): void {
    const polygon = this.selectedPolygon();
    const imageInfo = this.uploadedImageInfo();
    
    if (!polygon || !this.uploadedImageUrl || !imageInfo) return;

    const bounds = this.getPolygonBounds(polygon);
    
    // Calculate the overlay bounds to match polygon bounds
    let overlayBounds;
    
    if (imageInfo.aspectRatio > bounds.aspectRatio) {
      // Image is wider than polygon, fit to polygon width
      const imageHeight = bounds.width / imageInfo.aspectRatio;
      const centerLat = bounds.center.lat;
      overlayBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(centerLat - imageHeight/2, bounds.west),
        new google.maps.LatLng(centerLat + imageHeight/2, bounds.east)
      );
    } else {
      // Image is taller than polygon, fit to polygon height
      const imageWidth = bounds.height * imageInfo.aspectRatio;
      const centerLng = bounds.center.lng;
      overlayBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(bounds.south, centerLng - imageWidth/2),
        new google.maps.LatLng(bounds.north, centerLng + imageWidth/2)
      );
    }

    const groundOverlay = new google.maps.GroundOverlay(
      this.uploadedImageUrl,
      overlayBounds,
      {
        opacity: 0.8,
        clickable: false
      }
    );

    groundOverlay.setMap(this.map);
    this.groundOverlays.push(groundOverlay);

    // Add right-click to remove overlay
    google.maps.event.addListener(groundOverlay, 'rightclick', () => {
      const index = this.groundOverlays.indexOf(groundOverlay);
      if (index > -1) {
        groundOverlay.setMap(null);
        this.groundOverlays.splice(index, 1);
      }
    });
  }

  protected clearAllPolygons(): void {
    this.polygons.forEach(polygon => {
      polygon.setMap(null);
      google.maps.event.clearInstanceListeners(polygon);
    });
    
    this.groundOverlays.forEach(overlay => {
      overlay.setMap(null);
    });
    
    this.polygons = [];
    this.groundOverlays = [];
    this.polygonCount.set(0);
    this.selectedPolygon.set(null);
    this.lastPolygonCoordinates.set([]);
    this.setDrawingMode(null);
  }

  protected exportCoordinates(): void {
    if (this.polygons.length === 0) return;

    const exportData = {
      polygons: this.polygons.map((polygon, index) => ({
        id: index + 1,
        coordinates: this.getPolygonCoordinates(polygon),
        bounds: this.getPolygonBounds(polygon)
      })),
      groundOverlays: this.groundOverlays.map((overlay, index) => ({
        id: index + 1,
        bounds: {
          north: overlay.getBounds()?.getNorthEast().lat(),
          south: overlay.getBounds()?.getSouthWest().lat(),
          east: overlay.getBounds()?.getNorthEast().lng(),
          west: overlay.getBounds()?.getSouthWest().lng()
        }
      })),
      imageInfo: this.uploadedImageInfo()
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `polygon-image-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  protected clearError(): void {
    this.errorMessage.set(null);
  }

  onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        this.uploadedImageInfo.set({
          width: img.width,
          height: img.height,
          aspectRatio: aspectRatio
        });
        this.uploadedImageUrl = e.target.result;
      };
      img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
  }
}