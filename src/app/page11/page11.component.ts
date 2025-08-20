import {
  Component,
  AfterViewInit,
  NgZone,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy
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

interface ImageOverlayData {
  id: string;
  groundOverlay: google.maps.GroundOverlay;
  bounds: google.maps.LatLngBounds;
  rotation: number;
  controlPoints: google.maps.Marker[];
  rotationHandle: google.maps.Marker;
  centerMarker: google.maps.Marker;
  originalImageUrl: string;
  isSelected: boolean;
}

@Component({
  selector: 'app-page11',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-container">
      <div class="map-header">
        <h2>Advanced Polygon & Image Tool</h2>
        <div class="status-indicator" [class.loading]="isLoading()" [class.ready]="isMapReady()">
          {{ mapStatus() }}
        </div>
      </div>
      
      <div id="map" class="map" [class.loading]="isLoading()"></div>
      
      <div class="controls">
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

        <div class="image-section">
          <button 
            (click)="overlayImageOnSelected()" 
            class="btn btn-success"
            [disabled]="!isMapReady() || !uploadedImageInfo() || !selectedPolygon()"
            type="button">
            <span class="icon">🖼️</span>
            Add Image
          </button>
          
          <button 
            (click)="toggleImageEditMode()" 
            class="btn btn-warning"
            [class.active]="imageEditMode()"
            [disabled]="!isMapReady() || imageOverlays.length === 0"
            type="button">
            <span class="icon">✏️</span>
            Edit Images
          </button>

          @if (selectedImageOverlay()) {
            <div class="rotation-controls">
              <button 
                (click)="rotateSelectedImage(-15)" 
                class="btn btn-sm btn-secondary"
                type="button">
                <span class="icon">↺</span>
                -15°
              </button>
              <span class="rotation-display">{{ selectedImageOverlay()!.rotation.toFixed(0) }}°</span>
              <button 
                (click)="rotateSelectedImage(15)" 
                class="btn btn-sm btn-secondary"
                type="button">
                <span class="icon">↻</span>
                +15°
              </button>
            </div>
          }
        </div>

        <div class="action-section">
          <button 
            (click)="clearAllPolygons()" 
            class="btn btn-danger"
            [disabled]="!isMapReady() || polygonCount() === 0"
            type="button">
            <span class="icon">🗑️</span>
            Clear Polygons ({{ polygonCount() }})
          </button>

          <button 
            (click)="clearAllImages()" 
            class="btn btn-danger"
            [disabled]="!isMapReady() || imageOverlays.length === 0"
            type="button">
            <span class="icon">🖼️🗑️</span>
            Clear Images ({{ imageOverlays.length }})
          </button>
          
          <button 
            (click)="exportCoordinates()" 
            class="btn btn-info"
            [disabled]="!isMapReady() || (polygonCount() === 0 && imageOverlays.length === 0)"
            type="button">
            <span class="icon">💾</span>
            Export Data
          </button>
        </div>
      </div>
      
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

      @if (selectedImageOverlay()) {
        <div class="info-panel image-info-panel">
          <h3>Selected Image Info</h3>
          <div class="image-overlay-info">
            <div>Rotation: {{ selectedImageOverlay()!.rotation.toFixed(1) }}°</div>
            <div>Size: {{ getImageOverlaySize(selectedImageOverlay()!) }}</div>
            <div class="image-instructions">
              <small>• Drag corners to resize • Drag rotation handle to rotate • Right-click to delete</small>
            </div>
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
    :host {
      display: block;
      height: 100vh;
      width: 100vw;
    }
    .map-container {
      height: 100%;
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

    .upload-section, .drawing-section, .image-section, .action-section {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .upload-section, .drawing-section, .image-section {
      border-right: 1px solid #dee2e6;
      padding-right: 1rem;
    }

    .image-info {
      font-size: 0.75rem;
      color: #6c757d;
      margin-top: 0.25rem;
    }

    .rotation-controls {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-left: 0.5rem;
      padding: 0.25rem;
      background-color: rgba(0,0,0,0.05);
      border-radius: 4px;
    }

    .rotation-display {
      font-size: 0.75rem;
      font-weight: bold;
      color: #495057;
      min-width: 35px;
      text-align: center;
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

    .btn-sm {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
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

    .btn-warning {
      background: linear-gradient(135deg, #ffc107, #e0a800);
      color: #212529;
    }

    .info-panel {
      padding: 1rem;
      background-color: #e3f2fd;
      border-top: 1px solid #bbdefb;
    }

    .image-info-panel {
      background-color: #fff3e0;
      border-top: 1px solid #ffcc02;
    }

    .info-panel h3 {
      margin: 0 0 0.5rem 0;
      color: #1976d2;
      font-size: 1rem;
    }

    .image-info-panel h3 {
      color: #f57c00;
    }

    .polygon-info, .image-overlay-info {
      font-size: 0.875rem;
      color: #424242;
    }

    .polygon-info > div, .image-overlay-info > div {
      margin-bottom: 0.25rem;
    }

    .image-instructions {
      margin-top: 0.5rem;
      color: #666;
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

      .upload-section, .drawing-section, .image-section, .action-section {
        border-right: none;
        border-bottom: 1px solid #dee2e6;
        padding-bottom: 1rem;
        justify-content: center;
      }

      .rotation-controls {
        margin-left: 0;
        margin-top: 0.5rem;
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
  protected imageOverlays: ImageOverlayData[] = [];

  // Reactive state using signals
  protected readonly isLoading = signal(true);
  protected readonly isMapReady = signal(false);
  protected readonly drawingMode = signal<string | null>(null);
  protected readonly polygonCount = signal(0);
  protected readonly selectedPolygon = signal<google.maps.Polygon | null>(null);
  protected readonly selectedImageOverlay = signal<ImageOverlayData | null>(null);
  protected readonly lastPolygonCoordinates = signal<PolygonCoordinate[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly uploadedImageInfo = signal<ImageDimensions | null>(null);
  protected readonly imageEditMode = signal(false);

  private uploadedImageUrl: string | null = null;
  private currentDragData: {
    overlay: ImageOverlayData;
    handleType: 'corner' | 'rotation' | 'center';
    initialBounds: google.maps.LatLngBounds;
    startPosition: google.maps.LatLng;
  } | null = null;

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
    return ratioDiff < 0.1;
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
      streetViewControl: false,
      mapTypeControl: false,
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
    this.drawingManager = drawingManager;
  }

  private setupEventListeners(): void {
    if (!this.drawingManager) {
      console.warn('Drawing manager not initialized, cannot setup event listeners');
      return;
    }

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
      const polygon = this.rectangleToPolygon(rectangle);
      coordinates = this.getPolygonCoordinates(polygon);
      this.polygons.push(polygon);
      this.setupPolygonListeners(polygon);
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
      { lat: ne.lat(), lng: sw.lng() },
      { lat: ne.lat(), lng: ne.lng() }, 
      { lat: sw.lat(), lng: ne.lng() },
      { lat: sw.lat(), lng: sw.lng() },
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
      this.zone.run(() => {
        this.selectedPolygon.set(polygon);
        this.selectedImageOverlay.set(null);
        this.highlightPolygon(polygon);
      });
    });

    google.maps.event.addListener(polygon, 'rightclick', () => {
      this.zone.run(() => {
        this.removePolygon(polygon);
      });
    });
  }

  private highlightPolygon(selectedPolygon: google.maps.Polygon): void {
    this.polygons.forEach(polygon => {
      polygon.setOptions({ strokeWeight: 2 });
    });
    selectedPolygon.setOptions({ strokeWeight: 4 });
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

  protected overlayImageOnSelected(): void {
    const polygon = this.selectedPolygon();
    const imageInfo = this.uploadedImageInfo();
    
    if (!polygon || !this.uploadedImageUrl || !imageInfo) return;

    const bounds = this.getPolygonBounds(polygon);
    const overlayId = `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const overlayBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(bounds.south, bounds.west),
      new google.maps.LatLng(bounds.north, bounds.east)
    );

    const groundOverlay = new google.maps.GroundOverlay(
      this.uploadedImageUrl,
      overlayBounds,
      { opacity: 0.8, clickable: true }
    );

    groundOverlay.setMap(this.map);

    const imageOverlayData = this.createImageControlSystem(overlayId, groundOverlay, overlayBounds, this.uploadedImageUrl);
    this.imageOverlays.push(imageOverlayData);

    this.selectImageOverlay(imageOverlayData);
    this.imageEditMode.set(true);
    this.updateImageControlsVisibility();
  }

  private createImageControlSystem(id: string, groundOverlay: google.maps.GroundOverlay, bounds: google.maps.LatLngBounds, imageUrl: string): ImageOverlayData {
    const controlPoints: google.maps.Marker[] = [];
    
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const corners = [
      ne,                                         // NE
      new google.maps.LatLng(ne.lat(), sw.lng()), // NW
      sw,                                         // SW
      new google.maps.LatLng(sw.lat(), ne.lng())  // SE
    ];

    corners.forEach((corner, index) => {
      const marker = new google.maps.Marker({
        position: corner,
        map: this.map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#4285f4',
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
        draggable: true,
        visible: false,
        zIndex: 1000
      });

      google.maps.event.addListener(marker, 'dragstart', (event: google.maps.MapMouseEvent) => this.startImageDrag(this.getImageOverlayById(id)!, 'corner', event.latLng!));
      google.maps.event.addListener(marker, 'drag', (event: google.maps.MapMouseEvent) => this.updateImageScale(event.latLng!, index));
      google.maps.event.addListener(marker, 'dragend', () => this.endImageDrag());

      controlPoints.push(marker);
    });

    const center = bounds.getCenter();
    const centerMarker = new google.maps.Marker({
      position: center,
      map: this.map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#34a853',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
      },
      draggable: true,
      visible: false,
      zIndex: 1000
    });

    google.maps.event.addListener(centerMarker, 'dragstart', (event: google.maps.MapMouseEvent) => this.startImageDrag(this.getImageOverlayById(id)!, 'center', event.latLng!));
    google.maps.event.addListener(centerMarker, 'drag', (event: google.maps.MapMouseEvent) => this.updateImagePosition(event.latLng!));
    google.maps.event.addListener(centerMarker, 'dragend', () => this.endImageDrag());

    const rotationHandle = new google.maps.Marker({
      position: new google.maps.LatLng(center.lat() + (bounds.getNorthEast().lat() - center.lat()) * 1.3, center.lng()),
      map: this.map,
      icon: {
        path: 'M-8,-8 L8,-8 L8,8 L-8,8 Z M-4,-4 L4,-4 L4,4 L-4,4 Z',
        fillColor: '#ea4335',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2,
        scale: 1
      },
      draggable: true,
      visible: false,
      zIndex: 1000
    });

    google.maps.event.addListener(rotationHandle, 'dragstart', (event: google.maps.MapMouseEvent) => this.startImageDrag(this.getImageOverlayById(id)!, 'rotation', event.latLng!));
    google.maps.event.addListener(rotationHandle, 'drag', (event: google.maps.MapMouseEvent) => this.updateImageRotation(event.latLng!));
    google.maps.event.addListener(rotationHandle, 'dragend', () => this.endImageDrag());

    const imageOverlayData: ImageOverlayData = { id, groundOverlay, bounds, rotation: 0, controlPoints, rotationHandle, centerMarker, originalImageUrl: imageUrl, isSelected: false };

    google.maps.event.addListener(groundOverlay, 'click', () => this.zone.run(() => this.selectImageOverlay(imageOverlayData)));
    google.maps.event.addListener(groundOverlay, 'rightclick', () => this.zone.run(() => this.removeImageOverlay(imageOverlayData)));

    return imageOverlayData;
  }

  private getImageOverlayById(id: string): ImageOverlayData | null {
    return this.imageOverlays.find(overlay => overlay.id === id) || null;
  }

  private selectImageOverlay(overlay: ImageOverlayData): void {
    this.imageOverlays.forEach(o => { o.isSelected = false; });
    overlay.isSelected = true;
    this.selectedImageOverlay.set(overlay);
    this.selectedPolygon.set(null);
    this.updateImageControlsVisibility();
  }

  private updateImageControlsVisibility(): void {
    this.imageOverlays.forEach(overlay => {
      const showControls = this.imageEditMode() && overlay.isSelected;
      overlay.controlPoints.forEach(marker => { marker.setVisible(showControls); });
      overlay.centerMarker.setVisible(showControls);
      overlay.rotationHandle.setVisible(showControls);
    });
  }

  private startImageDrag(overlay: ImageOverlayData, handleType: 'corner' | 'rotation' | 'center', startPosition: google.maps.LatLng): void {
    this.currentDragData = {
      overlay,
      handleType,
      initialBounds: overlay.bounds,
      startPosition
    };
  }

  private updateImageScale(newPosition: google.maps.LatLng, cornerIndex: number): void {
    if (!this.currentDragData || this.currentDragData.handleType !== 'corner') return;

    const overlay = this.currentDragData.overlay;
    const currentBounds = overlay.bounds;
    const ne = currentBounds.getNorthEast();
    const sw = currentBounds.getSouthWest();
    const nw = new google.maps.LatLng(ne.lat(), sw.lng());
    const se = new google.maps.LatLng(sw.lat(), ne.lng());

    let newBounds: google.maps.LatLngBounds;
    
    switch (cornerIndex) {
      case 0: newBounds = new google.maps.LatLngBounds(sw, newPosition); break;
      case 1: newBounds = new google.maps.LatLngBounds(new google.maps.LatLng(se.lat(), newPosition.lng()), new google.maps.LatLng(newPosition.lat(), se.lng())); break;
      case 2: newBounds = new google.maps.LatLngBounds(newPosition, ne); break;
      case 3: newBounds = new google.maps.LatLngBounds(new google.maps.LatLng(newPosition.lat(), nw.lng()), new google.maps.LatLng(nw.lat(), newPosition.lng())); break;
      default: return;
    }
    
    this.recreateGroundOverlay(overlay, newBounds);
    this.updateControlHandles(overlay);
  }
  
  private updateImagePosition(newPosition: google.maps.LatLng) {
    if (!this.currentDragData || this.currentDragData.handleType !== 'center') return;
    const { overlay, startPosition } = this.currentDragData;
    const latDiff = newPosition.lat() - startPosition.lat();
    const lngDiff = newPosition.lng() - startPosition.lng();

    const oldBounds = overlay.bounds;
    const newSW = new google.maps.LatLng(oldBounds.getSouthWest().lat() + latDiff, oldBounds.getSouthWest().lng() + lngDiff);
    const newNE = new google.maps.LatLng(oldBounds.getNorthEast().lat() + latDiff, oldBounds.getNorthEast().lng() + lngDiff);
    
    const newBounds = new google.maps.LatLngBounds(newSW, newNE);

    this.recreateGroundOverlay(overlay, newBounds);
    this.updateControlHandles(overlay);
  }

  private updateImageRotation(newPosition: google.maps.LatLng) {
    if (!this.currentDragData || this.currentDragData.handleType !== 'rotation') return;
    const { overlay } = this.currentDragData;
    const center = overlay.bounds.getCenter();
    const angle = google.maps.geometry.spherical.computeHeading(center, newPosition);
    
    // Normalize angle to be degrees from North, not bearing
    const rotation = (angle < 0) ? (angle + 360) : angle;
    overlay.rotation = rotation;

    // This part is complex: for true rotation, you'd apply a CSS transform or use a canvas.
    // For simplicity, we just update the signal. Visually rotating a GroundOverlay is non-trivial.
    this.selectedImageOverlay.set({ ...overlay }); // Trigger signal update
  }

  private endImageDrag(): void {
    this.currentDragData = null;
  }
  
  private recreateGroundOverlay(overlay: ImageOverlayData, newBounds: google.maps.LatLngBounds): void {
    overlay.groundOverlay.setMap(null);
    
    const newGroundOverlay = new google.maps.GroundOverlay(
        overlay.originalImageUrl,
        newBounds,
        { opacity: overlay.groundOverlay.getOpacity(), clickable: true }
    );
    newGroundOverlay.setMap(this.map);

    overlay.groundOverlay = newGroundOverlay;
    overlay.bounds = newBounds;

    google.maps.event.clearInstanceListeners(overlay.groundOverlay);
    google.maps.event.addListener(newGroundOverlay, 'click', () => this.zone.run(() => this.selectImageOverlay(overlay)));
    google.maps.event.addListener(newGroundOverlay, 'rightclick', () => this.zone.run(() => this.removeImageOverlay(overlay)));
  }

  private updateControlHandles(overlay: ImageOverlayData) {
    const bounds = overlay.bounds;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = bounds.getCenter();

    overlay.controlPoints[0].setPosition(ne);
    overlay.controlPoints[1].setPosition(new google.maps.LatLng(ne.lat(), sw.lng()));
    overlay.controlPoints[2].setPosition(sw);
    overlay.controlPoints[3].setPosition(new google.maps.LatLng(sw.lat(), ne.lng()));
    overlay.centerMarker.setPosition(center);
    overlay.rotationHandle.setPosition(new google.maps.LatLng(center.lat() + (ne.lat() - center.lat()) * 1.3, center.lng()));
  }

  protected onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.uploadedImageUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        this.zone.run(() => {
          this.uploadedImageInfo.set({
            width: img.width,
            height: img.height,
            aspectRatio: img.width / img.height
          });
        });
      };
      img.src = this.uploadedImageUrl;
    };
    reader.readAsDataURL(file);
  }

  protected setDrawingMode(mode: 'polygon' | 'rectangle' | null): void {
    if (!this.drawingManager) return;
    this.drawingMode.set(mode);
    const googleMode = mode ? google.maps.drawing.OverlayType[mode.toUpperCase()] : null;
    this.drawingManager.setDrawingMode(googleMode);
  }

  protected toggleImageEditMode(): void {
    this.imageEditMode.update(val => !val);
    this.updateImageControlsVisibility();
  }

  protected rotateSelectedImage(angle: number): void {
    const overlay = this.selectedImageOverlay();
    if (overlay) {
      overlay.rotation = (overlay.rotation + angle) % 360;
      this.selectedImageOverlay.set({ ...overlay });
    }
  }

  protected clearAllPolygons(): void {
    this.polygons.forEach(p => p.setMap(null));
    this.polygons = [];
    this.polygonCount.set(0);
    this.selectedPolygon.set(null);
    this.lastPolygonCoordinates.set([]);
  }

  protected clearAllImages(): void {
    this.imageOverlays.forEach(overlay => this.removeImageOverlayFromMap(overlay));
    this.imageOverlays = [];
    this.selectedImageOverlay.set(null);
  }

  private removeImageOverlayFromMap(overlay: ImageOverlayData) {
    overlay.groundOverlay.setMap(null);
    overlay.controlPoints.forEach(p => p.setMap(null));
    overlay.rotationHandle.setMap(null);
    overlay.centerMarker.setMap(null);
  }

  private removeImageOverlay(overlayToRemove: ImageOverlayData): void {
    this.removeImageOverlayFromMap(overlayToRemove);
    this.imageOverlays = this.imageOverlays.filter(o => o.id !== overlayToRemove.id);
    if (this.selectedImageOverlay()?.id === overlayToRemove.id) {
        this.selectedImageOverlay.set(null);
    }
  }
  
  protected exportCoordinates(): void {
    const data = {
      polygons: this.polygons.map(p => this.getPolygonCoordinates(p)),
      images: this.imageOverlays.map(img => {
        const b = img.bounds;
        return {
          id: img.id,
          imageUrl: img.originalImageUrl,
          rotation: img.rotation,
          bounds: {
            north: b.getNorthEast().lat(),
            east: b.getNorthEast().lng(),
            south: b.getSouthWest().lat(),
            west: b.getSouthWest().lng(),
          }
        };
      })
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "map_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  protected clearError(): void {
    this.errorMessage.set(null);
  }

  protected getImageOverlaySize(overlay: ImageOverlayData): string {
    const bounds = overlay.bounds;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const se = new google.maps.LatLng(sw.lat(), ne.lng());
    const nw = new google.maps.LatLng(ne.lat(), sw.lng());
    const width = google.maps.geometry.spherical.computeDistanceBetween(se, sw);
    const height = google.maps.geometry.spherical.computeDistanceBetween(ne, se);
    return `${width.toFixed(1)}m × ${height.toFixed(1)}m`;
  }

  private cleanupResources(): void {
    if (this.overlayCompleteListener) {
      google.maps.event.removeListener(this.overlayCompleteListener);
    }
    this.clearAllPolygons();
    this.clearAllImages();
  }
}