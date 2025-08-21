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
  groundOverlay: any;
  bounds: google.maps.LatLngBounds;
  rotation: number;
  controlPoints: google.maps.Marker[];
  rotationHandle: google.maps.Marker;
  centerMarker: google.maps.Marker;
  originalImageUrl: string;
  isSelected: boolean;
  clippingPolygon: google.maps.Polygon;
  domElement?: HTMLElement;
  recreateTimeout?: any;
  opacity?: number;
}

@Component({
  selector: 'app-page11',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-container">
      <div *ngIf="isLoading()" class="loading-overlay">
        <div class="loading-spinner"></div>
        <p>{{ mapStatus() }}</p>
      </div>

      <div *ngIf="errorMessage()" class="error-banner">
        <p>{{ errorMessage() }}</p>
        <button (click)="clearError()" class="close-btn">&times;</button>
      </div>

      <div id="map" class="map-element"></div>

      <div class="control-panel">
        <div class="control-group">
          <h3>Drawing Tools</h3>
          <div class="button-row">
            <button 
              type="button" 
              (click)="setDrawingMode('polygon')"
              [class.active]="drawingMode() === 'polygon'">
              Polygon
            </button>
            <button 
              type="button" 
              (click)="setDrawingMode('rectangle')"
              [class.active]="drawingMode() === 'rectangle'">
              Rectangle
            </button>
            <button 
              type="button" 
              (click)="setDrawingMode(null)"
              [class.active]="drawingMode() === null">
              Select
            </button>
          </div>
        </div>

        <div class="control-group">
          <h3>Image Upload</h3>
          <input 
            type="file" 
            accept="image/*" 
            (change)="onImageUpload($event)"
            class="file-input"
            #fileInput>
          
          <div *ngIf="uploadedImageInfo()" class="image-info">
            <p><strong>Dimensions:</strong> {{ uploadedImageInfo()!.width }}×{{ uploadedImageInfo()!.height }}px</p>
            <p><strong>Aspect Ratio:</strong> {{ uploadedImageInfo()!.aspectRatio.toFixed(2) }}</p>
          </div>

          <button 
            type="button" 
            (click)="overlayImageOnSelected()"
            [disabled]="!selectedPolygon() || !uploadedImageInfo()"
            class="overlay-btn">
            Overlay on Selected Polygon
          </button>

          <div *ngIf="selectedPolygon() && uploadedImageInfo() && !ratiosMatch()" class="ratio-warning">
            Warning: Aspect ratios don't match perfectly (may cause distortion)
          </div>
        </div>

        <div class="control-group" *ngIf="imageOverlays.length > 0">
          <h3>Image Controls</h3>
          
          <div class="edit-mode-controls">
            <button 
              type="button" 
              (click)="toggleImageEditMode()"
              [class.active]="imageEditMode()">
              {{ imageEditMode() ? 'Exit Edit' : 'Edit Mode' }}
            </button>
          </div>

          <div class="drag-controls" *ngIf="imageEditMode()">
            <div class="control-subgroup">
              <label>Drag Sensitivity:</label>
              <select (change)="setDragSensitivity($any($event.target).value)" class="sensitivity-select">
                <option value="low">Low (Less sensitive)</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High (More sensitive)</option>
              </select>
            </div>
            
            <div class="control-subgroup">
              <button 
                type="button" 
                (click)="toggleAspectRatioLock()"
                [class.active]="aspectRatioLocked"
                class="aspect-lock-btn">
                {{ aspectRatioLocked ? 'Locked' : 'Free' }} Aspect Ratio
              </button>
              <small class="tip">Tip: Hold Shift while dragging corners to temporarily lock aspect ratio</small>
            </div>
          </div>

          <div *ngIf="selectedImageOverlay()" class="selected-image-controls">
            <h4>Selected Image</h4>
            <p><strong>Size:</strong> {{ getImageOverlaySize(selectedImageOverlay()!) }}</p>
            <p><strong>Rotation:</strong> {{ selectedImageOverlay()!.rotation.toFixed(1) }}°</p>
            <p><strong>Opacity:</strong> {{ (selectedImageOverlay()!.opacity || 0.8) * 100 }}%</p>
            
            <div class="rotation-controls">
              <button type="button" (click)="rotateSelectedImage(-90)">-90°</button>
              <button type="button" (click)="rotateSelectedImage(-45)">-45°</button>
              <button type="button" (click)="rotateSelectedImage(45)">+45°</button>
              <button type="button" (click)="rotateSelectedImage(90)">+90°</button>
            </div>

            <div class="opacity-controls">
              <label>Opacity:</label>
              <input 
                type="range" 
                min="0" 
                max="100" 
                [value]="(selectedImageOverlay()!.opacity || 0.8) * 100"
                (input)="setImageOpacity($any($event.target).value)"
                class="opacity-slider">
            </div>
          </div>
        </div>

        <div class="control-group">
          <h3>Status</h3>
          <div class="status-grid">
            <div class="status-item">
              <span class="status-label">Polygons:</span>
              <span class="status-value">{{ polygonCount() }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">Images:</span>
              <span class="status-value">{{ imageOverlays.length }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">Map:</span>
              <span class="status-value">{{ mapStatus() }}</span>
            </div>
          </div>
        </div>

        <div class="control-group">
          <h3>Clear Actions</h3>
          <div class="button-row">
            <button type="button" (click)="clearAllPolygons()" class="danger-btn">
              Clear Polygons
            </button>
            <button type="button" (click)="clearAllImages()" class="danger-btn">
              Clear Images
            </button>
          </div>
        </div>

        <div class="control-group">
          <button type="button" (click)="exportCoordinates()" class="export-btn">
            Export Data
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './page11.component.css',
})
export class Page11Component implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private map: google.maps.Map | null = null;
  private drawingManager: google.maps.drawing.DrawingManager | null = null;
  private overlayCompleteListener: google.maps.MapsEventListener | null = null;
  private polygons: google.maps.Polygon[] = [];
  protected imageOverlays: ImageOverlayData[] = [];

  private RotatableImageOverlayClass: any;

  // Enhanced drag control properties
  private dragThreshold = 0.0001;
  private lastDragUpdate = 0;
  private dragUpdateInterval = 16;
  private minImageSize = 0.001;
  protected aspectRatioLocked = false;

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

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Map loading timeout after 15 seconds')), 15000)
      );

      await Promise.race([
        this.zone.runOutsideAngular(async () => {
          await MapLoaderService.load();

          this.RotatableImageOverlayClass = class RotatableImageOverlay extends google.maps.OverlayView {
            private bounds: google.maps.LatLngBounds;
            private image: string;
            private rotation: number;
            private div: HTMLDivElement | null = null;
            private img: HTMLImageElement | null = null;
            private opacity: number;
            private clickable: boolean;
            private clickCallbacks: (() => void)[] = [];
            private rightClickCallbacks: (() => void)[] = [];

            constructor(
              bounds: google.maps.LatLngBounds,
              image: string,
              rotation: number = 0,
              options: { opacity?: number; clickable?: boolean } = {}
            ) {
              super();
              this.bounds = bounds;
              this.image = image;
              this.rotation = rotation;
              this.opacity = options.opacity ?? 0.8;
              this.clickable = options.clickable ?? true;
            }

            onAdd(): void {
              this.div = document.createElement('div');
              this.div.style.borderStyle = 'none';
              this.div.style.borderWidth = '0px';
              this.div.style.position = 'absolute';
              this.div.style.cursor = this.clickable ? 'pointer' : 'default';
              this.div.style.transformOrigin = 'center center';
              this.div.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
              this.div.style.pointerEvents = this.clickable ? 'auto' : 'none';

              this.img = document.createElement('img');
              this.img.src = this.image;
              this.img.style.width = '100%';
              this.img.style.height = '100%';
              this.img.style.position = 'absolute';
              this.img.style.opacity = this.opacity.toString();
              this.img.style.userSelect = 'none';
              this.img.style.display = 'block';

              this.div.appendChild(this.img);

              if (this.clickable) {
                this.div.addEventListener('click', (e) => {
                  e.stopPropagation();
                  this.clickCallbacks.forEach(callback => callback());
                });

                this.div.addEventListener('contextmenu', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  this.rightClickCallbacks.forEach(callback => callback());
                });
              }

              const panes = this['getPanes']();
              if (panes) {
                panes.overlayLayer.appendChild(this.div);
              }
            }

            draw(): void {
              const overlayProjection = this['getProjection']();
              if (!overlayProjection || !this.div) return;

              const sw = overlayProjection.fromLatLngToDivPixel(this.bounds.getSouthWest());
              const ne = overlayProjection.fromLatLngToDivPixel(this.bounds.getNorthEast());

              if (sw && ne) {
                this.div.style.left = sw.x + 'px';
                this.div.style.top = ne.y + 'px';
                this.div.style.width = (ne.x - sw.x) + 'px';
                this.div.style.height = (sw.y - ne.y) + 'px';
                this.div.style.transform = `rotate(${this.rotation}deg)`;
              }
            }

            onRemove(): void {
              if (this.div && this.div.parentNode) {
                this.div.parentNode.removeChild(this.div);
              }
              this.div = null;
              this.img = null;
              this.clickCallbacks = [];
              this.rightClickCallbacks = [];
            }

            setRotation(rotation: number, animate: boolean = true): void {
              this.rotation = rotation;
              if (this.div) {
                if (animate) {
                  this.div.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                } else {
                  this.div.style.transition = 'none';
                }
                this.div.style.transform = `rotate(${this.rotation}deg)`;
              }
            }

            getRotation(): number { return this.rotation; }
            setOpacity(opacity: number): void {
              this.opacity = Math.max(0, Math.min(1, opacity));
              if (this.img) { this.img.style.opacity = this.opacity.toString(); }
            }
            getOpacity(): number { return this.opacity; }
            setBounds(bounds: google.maps.LatLngBounds): void { this.bounds = bounds; this.draw(); }
            getBounds(): google.maps.LatLngBounds { return this.bounds; }
            getDOMElement(): HTMLDivElement | null { return this.div; }
            addClickListener(callback: () => void): void { this.clickCallbacks.push(callback); }
            addRightClickListener(callback: () => void): void { this.rightClickCallbacks.push(callback); }
            setVisible(visible: boolean): void { if (this.div) { this.div.style.display = visible ? 'block' : 'none'; } }
          };

          this.createMap();
          this.setupDrawingManager();
          this.setupEventListeners();
        }),
        timeoutPromise
      ]);

      this.isLoading.set(false);
      this.isMapReady.set(true);
    } catch (error) {
      console.error('Failed to initialize Google Maps:', error);
      this.errorMessage.set(
        error instanceof Error && error.message.includes('timeout')
          ? 'Map loading timed out. Please check your internet connection and try again.'
          : 'Failed to load Google Maps. Please refresh the page and try again.'
      );
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
      mapTypeControl: true,
      fullscreenControl: true,
      zoomControl: true,
      gestureHandling: 'greedy'
    });
  }

  private createClippedImageOverlay(
    bounds: google.maps.LatLngBounds,
    imageUrl: string,
    polygon: google.maps.Polygon,
    rotation: number = 0,
    opacity: number = 0.8
  ): any {
    const ClippedImageOverlay = class extends google.maps.OverlayView {
      private bounds: google.maps.LatLngBounds;
      private image: string;
      private rotation: number;
      private div: HTMLDivElement | null = null;
      private canvas: HTMLCanvasElement | null = null;
      private ctx: CanvasRenderingContext2D | null = null;
      private img: HTMLImageElement | null = null;
      private opacity: number;
      private clickable: boolean;
      private polygon: google.maps.Polygon;
      private clickCallbacks: (() => void)[] = [];
      private rightClickCallbacks: (() => void)[] = [];
      private isClipped: boolean = true;

      constructor(
        bounds: google.maps.LatLngBounds,
        image: string,
        polygon: google.maps.Polygon,
        rotation: number = 0,
        options: { opacity?: number; clickable?: boolean; clipped?: boolean } = {}
      ) {
        super();
        this.bounds = bounds;
        this.image = image;
        this.polygon = polygon;
        this.rotation = rotation;
        this.opacity = options.opacity ?? 0.8;
        this.clickable = options.clickable ?? true;
        this.isClipped = options.clipped ?? true;
      }

      onAdd(): void {
        this.div = document.createElement('div');
        this.div.style.borderStyle = 'none';
        this.div.style.borderWidth = '0px';
        this.div.style.position = 'absolute';
        this.div.style.cursor = this.clickable ? 'pointer' : 'default';
        this.div.style.transformOrigin = 'center center';
        this.div.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
        this.div.style.pointerEvents = this.clickable ? 'auto' : 'none';

        if (this.isClipped) {
          this.canvas = document.createElement('canvas');
          this.ctx = this.canvas.getContext('2d');
          this.canvas.style.width = '100%';
          this.canvas.style.height = '100%';
          this.canvas.style.position = 'absolute';
          this.canvas.style.opacity = this.opacity.toString();
          this.div.appendChild(this.canvas);
        } else {
          // Fallback to regular image for edit mode
          this.img = document.createElement('img');
          this.img.src = this.image;
          this.img.style.width = '100%';
          this.img.style.height = '100%';
          this.img.style.position = 'absolute';
          this.img.style.opacity = this.opacity.toString();
          this.img.style.userSelect = 'none';
          this.img.style.display = 'block';
          this.div.appendChild(this.img);
        }

        if (this.clickable) {
          this.div.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clickCallbacks.forEach(callback => callback());
          });

          this.div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.rightClickCallbacks.forEach(callback => callback());
          });
        }

        const panes = this['getPanes']();
        if (panes) {
          panes.overlayLayer.appendChild(this.div);
        }

        if (this.isClipped) {
          this.loadAndDrawClippedImage();
        }
      }

      private loadAndDrawClippedImage(): void {
        if (!this.canvas || !this.ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
          this.drawClippedImage(img);
        };

        img.onerror = () => {
          console.warn('Failed to load image for clipping, falling back to regular overlay');
          this.fallbackToRegularImage();
        };

        img.src = this.image;
      }

      private drawClippedImage(img: HTMLImageElement): void {
        if (!this.canvas || !this.ctx) return;

        const overlayProjection = this['getProjection']();
        if (!overlayProjection) return;

        // Get canvas dimensions
        const sw = overlayProjection.fromLatLngToDivPixel(this.bounds.getSouthWest());
        const ne = overlayProjection.fromLatLngToDivPixel(this.bounds.getNorthEast());

        if (!sw || !ne) return;

        const canvasWidth = Math.abs(ne.x - sw.x);
        const canvasHeight = Math.abs(sw.y - ne.y);

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;

        // Clear canvas
        this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Create clipping path from polygon
        this.ctx.beginPath();
        const path = this.polygon.getPath();
        const pathArray = path.getArray();

        pathArray.forEach((latLng, index) => {
          const pixel = overlayProjection.fromLatLngToDivPixel(latLng);
          if (pixel) {
            // Convert to canvas coordinates relative to image bounds
            const x = pixel.x - sw.x;
            const y = pixel.y - ne.y;

            if (index === 0) {
              this.ctx!.moveTo(x, y);
            } else {
              this.ctx!.lineTo(x, y);
            }
          }
        });

        this.ctx.closePath();
        this.ctx.clip();

        // Apply rotation if needed
        if (this.rotation !== 0) {
          this.ctx.save();
          this.ctx.translate(canvasWidth / 2, canvasHeight / 2);
          this.ctx.rotate((this.rotation * Math.PI) / 180);
          this.ctx.translate(-canvasWidth / 2, -canvasHeight / 2);
        }

        // Draw the image
        this.ctx.globalAlpha = this.opacity;
        this.ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

        if (this.rotation !== 0) {
          this.ctx.restore();
        }
      }

      private fallbackToRegularImage(): void {
        if (!this.div || !this.canvas) return;

        this.div.removeChild(this.canvas);
        this.canvas = null;
        this.ctx = null;

        this.img = document.createElement('img');
        this.img.src = this.image;
        this.img.style.width = '100%';
        this.img.style.height = '100%';
        this.img.style.position = 'absolute';
        this.img.style.opacity = this.opacity.toString();
        this.img.style.userSelect = 'none';
        this.img.style.display = 'block';
        this.div.appendChild(this.img);
      }

      draw(): void {
        const overlayProjection = this['getProjection']();
        if (!overlayProjection || !this.div) return;

        const sw = overlayProjection.fromLatLngToDivPixel(this.bounds.getSouthWest());
        const ne = overlayProjection.fromLatLngToDivPixel(this.bounds.getNorthEast());

        if (sw && ne) {
          this.div.style.left = sw.x + 'px';
          this.div.style.top = ne.y + 'px';
          this.div.style.width = (ne.x - sw.x) + 'px';
          this.div.style.height = (sw.y - ne.y) + 'px';

          if (!this.isClipped) {
            this.div.style.transform = `rotate(${this.rotation}deg)`;
          }

          // Redraw clipped image if canvas mode and projection changed
          if (this.isClipped && this.canvas && this.ctx) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => this.drawClippedImage(img);
            img.src = this.image;
          }
        }
      }

      onRemove(): void {
        if (this.div && this.div.parentNode) {
          this.div.parentNode.removeChild(this.div);
        }
        this.div = null;
        this.canvas = null;
        this.ctx = null;
        this.img = null;
        this.clickCallbacks = [];
        this.rightClickCallbacks = [];
      }

      setRotation(rotation: number, animate: boolean = true): void {
        this.rotation = rotation;
        if (this.isClipped) {
          // For clipped images, we need to redraw the canvas
          if (this.canvas && this.ctx) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => this.drawClippedImage(img);
            img.src = this.image;
          }
        } else if (this.div) {
          // For unclipped images, use CSS transform
          if (animate) {
            this.div.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          } else {
            this.div.style.transition = 'none';
          }
          this.div.style.transform = `rotate(${this.rotation}deg)`;
        }
      }

      setClipped(clipped: boolean): void {
        if (this.isClipped === clipped) return;

        this.isClipped = clipped;

        // Remove current content
        if (this.div) {
          this.div.innerHTML = '';
        }

        // Recreate content based on clipping mode
        this.onAdd();
      }

      getRotation(): number { return this.rotation; }
      setOpacity(opacity: number): void {
        this.opacity = Math.max(0, Math.min(1, opacity));
        if (this.img) {
          this.img.style.opacity = this.opacity.toString();
        }
        if (this.canvas) {
          // Need to redraw canvas with new opacity
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => this.drawClippedImage(img);
          img.src = this.image;
        }
      }
      getOpacity(): number { return this.opacity; }
      setBounds(bounds: google.maps.LatLngBounds): void {
        this.bounds = bounds;
        this.draw();
      }
      getBounds(): google.maps.LatLngBounds { return this.bounds; }
      getDOMElement(): HTMLDivElement | null { return this.div; }
      addClickListener(callback: () => void): void { this.clickCallbacks.push(callback); }
      addRightClickListener(callback: () => void): void { this.rightClickCallbacks.push(callback); }
      setVisible(visible: boolean): void {
        if (this.div) {
          this.div.style.display = visible ? 'block' : 'none';
        }
      }
    };

    return new ClippedImageOverlay(bounds, imageUrl, polygon, rotation, {
      opacity,
      clickable: true,
      clipped: true
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
    const overlayId = `image_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const overlayBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(bounds.south, bounds.west),
      new google.maps.LatLng(bounds.north, bounds.east)
    );

    // Set edit mode FIRST, then create overlay based on that mode
    this.imageEditMode.set(true);

    // Now create overlay with correct clipping mode (false for edit mode)
    const useClipping = !this.imageEditMode();
    const customOverlay = useClipping
      ? this.createClippedImageOverlay(overlayBounds, this.uploadedImageUrl, polygon, 0, 0.8)
      : new this.RotatableImageOverlayClass(overlayBounds, this.uploadedImageUrl, 0, { opacity: 0.8, clickable: true });

    customOverlay.setMap(this.map);

    const imageOverlayData = this.createImageControlSystem(
      overlayId,
      customOverlay,
      overlayBounds,
      this.uploadedImageUrl,
      polygon
    );

    imageOverlayData.domElement = customOverlay.getDOMElement() || undefined;
    imageOverlayData.opacity = 0.8;

    this.imageOverlays.push(imageOverlayData);

    customOverlay.addClickListener(() => {
      this.zone.run(() => this.selectImageOverlay(imageOverlayData));
    });

    customOverlay.addRightClickListener(() => {
      this.zone.run(() => this.removeImageOverlay(imageOverlayData));
    });

    this.selectImageOverlay(imageOverlayData);
    this.updateImageControlsVisibility();
  }

  // Update the toggleImageEditMode method to switch between clipped and unclipped
  protected toggleImageEditMode(): void {
    this.imageEditMode.update(val => !val);

    // Add small delay to ensure DOM is ready for recreation
    setTimeout(() => {
      this.updateAllOverlaysForEditMode();
      this.updateImageControlsVisibility();
    }, 50);
  }

  private updateAllOverlaysForEditMode(): void {
    const isEditMode = this.imageEditMode();

    this.imageOverlays.forEach(overlay => {
      try {
        // Store current state
        const currentRotation = overlay.rotation;
        const currentOpacity = overlay.opacity || 0.8;
        const currentBounds = overlay.bounds;
        const isSelected = overlay.isSelected;

        // Remove old overlay cleanly
        if (overlay.groundOverlay) {
          if (overlay.groundOverlay.setMap) {
            overlay.groundOverlay.setMap(null);
          }

          // Clear any recreation timeout
          if (overlay.recreateTimeout) {
            clearTimeout(overlay.recreateTimeout);
            overlay.recreateTimeout = undefined;
          }
        }

        // Create new overlay with appropriate clipping mode
        const useClipping = !isEditMode;
        let newOverlay;

        if (useClipping) {
          newOverlay = this.createClippedImageOverlay(
            currentBounds,
            overlay.originalImageUrl,
            overlay.clippingPolygon,
            currentRotation,
            currentOpacity
          );
        } else {
          newOverlay = new this.RotatableImageOverlayClass(
            currentBounds,
            overlay.originalImageUrl,
            currentRotation,
            { opacity: currentOpacity, clickable: true }
          );
        }

        // Set the new overlay on the map
        newOverlay.setMap(this.map);

        // Update overlay data
        overlay.groundOverlay = newOverlay;
        overlay.rotation = currentRotation;
        overlay.opacity = currentOpacity;
        overlay.bounds = currentBounds;
        overlay.isSelected = isSelected;
        overlay.domElement = newOverlay.getDOMElement() || undefined;

        // Re-attach event listeners
        newOverlay.addClickListener(() => {
          this.zone.run(() => this.selectImageOverlay(overlay));
        });

        newOverlay.addRightClickListener(() => {
          this.zone.run(() => this.removeImageOverlay(overlay));
        });

        // Update control handles if this overlay is selected
        if (isSelected) {
          this.selectedImageOverlay.set({ ...overlay });
          // Small delay to ensure overlay is rendered before updating handles
          setTimeout(() => this.updateControlHandles(overlay), 100);
        }

      } catch (error) {
        console.error('Error updating overlay for edit mode:', error);
        // Fallback: try to recreate overlay using the old method
        this.recreateOverlayWithClipping(overlay, !isEditMode);
      }
    });
  }


  private createImageControlSystem(
    id: string,
    groundOverlay: any,
    bounds: google.maps.LatLngBounds,
    imageUrl: string,
    clippingPolygon: google.maps.Polygon
  ): ImageOverlayData {
    const controlPoints: google.maps.Marker[] = [];

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const corners = [
      ne,
      new google.maps.LatLng(ne.lat(), sw.lng()),
      sw,
      new google.maps.LatLng(sw.lat(), ne.lng())
    ];

    corners.forEach((corner, index) => {
      const marker = this.createCornerMarker(corner, index, id);
      controlPoints.push(marker);
    });

    const center = bounds.getCenter();
    const centerMarker = new google.maps.Marker({
      position: center,
      map: this.map,
      icon: {
        path: 'M-8,-8 L8,-8 L8,8 L-8,8 Z M-4,-4 L4,-4 L4,4 L-4,4 Z',
        fillColor: '#34a853',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1
      },
      draggable: true,
      visible: false,
      zIndex: 1000,
      title: 'Move image'
    });

    const rotationHandle = new google.maps.Marker({
      position: new google.maps.LatLng(
        center.lat() + (bounds.getNorthEast().lat() - center.lat()) * 1.3,
        center.lng()
      ),
      map: this.map,
      icon: {
        path: 'M-8,0 A8,8 0 1,1 8,0 A8,8 0 1,1 -8,0 Z M-4,-6 L0,-10 L4,-6 Z',
        fillColor: '#ea4335',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1
      },
      draggable: true,
      visible: false,
      zIndex: 1000,
      title: 'Rotate image'
    });

    google.maps.event.addListener(centerMarker, 'dragstart', (event: google.maps.MapMouseEvent) =>
      this.startImageDrag(this.getImageOverlayById(id)!, 'center', event.latLng!)
    );
    google.maps.event.addListener(centerMarker, 'drag', (event: google.maps.MapMouseEvent) =>
      this.updateImagePosition(event.latLng!)
    );
    google.maps.event.addListener(centerMarker, 'dragend', () => this.endImageDrag());

    google.maps.event.addListener(rotationHandle, 'dragstart', (event: google.maps.MapMouseEvent) =>
      this.startImageDrag(this.getImageOverlayById(id)!, 'rotation', event.latLng!)
    );
    google.maps.event.addListener(rotationHandle, 'drag', (event: google.maps.MapMouseEvent) =>
      this.updateImageRotation(event.latLng!)
    );
    google.maps.event.addListener(rotationHandle, 'dragend', () => this.endImageDrag());

    return {
      id,
      groundOverlay,
      bounds,
      rotation: 0,
      controlPoints,
      rotationHandle,
      centerMarker,
      originalImageUrl: imageUrl,
      isSelected: false,
      clippingPolygon,
      opacity: 0.8
    };
  }

  private createCornerMarker(corner: google.maps.LatLng, index: number, overlayId: string): google.maps.Marker {
    const marker = new google.maps.Marker({
      position: corner,
      map: this.map,
      icon: {
        path: 'M-6,-6 L6,-6 Q8,-6 8,-4 L8,4 Q8,6 6,6 L-6,6 Q-8,6 -8,4 L-8,-4 Q-8,-6 -6,-6 Z',
        fillColor: '#1a73e8',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 1,
        anchor: new google.maps.Point(0, 0)
      },
      draggable: true,
      visible: false,
      zIndex: 1001,
      title: `Resize corner ${index + 1} (Hold Shift to lock aspect ratio)`
    });

    google.maps.event.addListener(marker, 'mouseover', () => {
      marker.setIcon({
        ...marker.getIcon() as google.maps.Symbol,
        fillColor: '#1557b0',
        strokeWeight: 3,
        scale: 1.2,
      });
    });

    google.maps.event.addListener(marker, 'mouseout', () => {
      marker.setIcon({
        ...marker.getIcon() as google.maps.Symbol,
        fillColor: '#1a73e8',
        strokeWeight: 2,
        scale: 1,
      });
    });

    google.maps.event.addListener(marker, 'dragstart', (event: google.maps.MapMouseEvent) => {
      this.aspectRatioLocked = this.isShiftKeyPressed(event);
      this.startImageDrag(this.getImageOverlayById(overlayId)!, 'corner', event.latLng!);

      if (this.aspectRatioLocked) {
        marker.setIcon({
          ...marker.getIcon() as google.maps.Symbol,
          fillColor: '#ff9800',
          strokeWeight: 4,
          scale: 1.3,
        });
      }
    });

    google.maps.event.addListener(marker, 'drag', (event: google.maps.MapMouseEvent) => {
      this.aspectRatioLocked = this.isShiftKeyPressed(event) || this.aspectRatioLocked;
      this.updateImageScale(event.latLng!, index);
    });

    google.maps.event.addListener(marker, 'dragend', () => {
      this.aspectRatioLocked = false;
      this.endImageDrag();
      marker.setIcon({
        ...marker.getIcon() as google.maps.Symbol,
        fillColor: '#1a73e8',
        strokeWeight: 2,
        scale: 1,
      });
    });

    return marker;
  }

  private isShiftKeyPressed(event: google.maps.MapMouseEvent): boolean {
    if (!event.domEvent) return false;
    const domEvent = event.domEvent as MouseEvent;
    return domEvent.shiftKey;
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

      try {
        overlay.controlPoints.forEach(marker => {
          if (marker && marker.setVisible) {
            marker.setVisible(showControls);
          }
        });

        if (overlay.centerMarker && overlay.centerMarker.setVisible) {
          overlay.centerMarker.setVisible(showControls);
        }

        if (overlay.rotationHandle && overlay.rotationHandle.setVisible) {
          overlay.rotationHandle.setVisible(showControls);
        }
      } catch (error) {
        console.warn('Error updating control visibility for overlay:', overlay.id, error);
      }
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

    const now = Date.now();
    if (now - this.lastDragUpdate < this.dragUpdateInterval) return;
    this.lastDragUpdate = now;

    const overlay = this.currentDragData.overlay;

    const currentAspectRatio = (this.uploadedImageInfo()?.aspectRatio)
      ? this.uploadedImageInfo()!.aspectRatio
      : (overlay.bounds.toSpan().lng() / overlay.bounds.toSpan().lat());

    let newBounds: google.maps.LatLngBounds;

    if (this.aspectRatioLocked) {
      newBounds = this.calculateBoundsWithAspectRatio(newPosition, cornerIndex, overlay.bounds, currentAspectRatio);
    } else {
      newBounds = this.calculateBoundsWithConstraints(newPosition, cornerIndex, overlay.bounds);
    }

    const newWidth = newBounds.toSpan().lng();
    const newHeight = newBounds.toSpan().lat();

    if (newWidth < this.minImageSize || newHeight < this.minImageSize) return;

    if (this.boundsChangedSignificantly(overlay.bounds, newBounds)) {
      this.updateCustomOverlayBounds(overlay, newBounds);
      this.updateControlHandles(overlay);
    }
  }

  private calculateBoundsWithAspectRatio(
    newPosition: google.maps.LatLng,
    cornerIndex: number,
    currentBounds: google.maps.LatLngBounds,
    aspectRatio: number
  ): google.maps.LatLngBounds {
    const oppositeCornerIndex = (cornerIndex + 2) % 4;
    const oppositeCorner = this.getCurrentCornerPosition(oppositeCornerIndex, currentBounds);

    const dx = newPosition.lng() - oppositeCorner.lng();
    const dy = newPosition.lat() - oppositeCorner.lat();

    let newWidth, newHeight;
    if (Math.abs(dx) / aspectRatio > Math.abs(dy)) {
      newWidth = Math.abs(dx);
      newHeight = newWidth / aspectRatio;
    } else {
      newHeight = Math.abs(dy);
      newWidth = newHeight * aspectRatio;
    }

    const newSwLat = Math.min(oppositeCorner.lat(), oppositeCorner.lat() + (dy > 0 ? newHeight : -newHeight));
    const newSwLng = Math.min(oppositeCorner.lng(), oppositeCorner.lng() + (dx > 0 ? newWidth : -newWidth));

    return new google.maps.LatLngBounds(
      new google.maps.LatLng(newSwLat, newSwLng),
      new google.maps.LatLng(newSwLat + newHeight, newSwLng + newWidth)
    );
  }

  private calculateBoundsWithConstraints(
    newPosition: google.maps.LatLng,
    cornerIndex: number,
    currentBounds: google.maps.LatLngBounds
  ): google.maps.LatLngBounds {
    const ne = currentBounds.getNorthEast();
    const sw = currentBounds.getSouthWest();

    let newNeLat = ne.lat(), newNeLng = ne.lng(), newSwLat = sw.lat(), newSwLng = sw.lng();

    switch (cornerIndex) {
      case 0: // NE
        newNeLat = newPosition.lat(); newNeLng = newPosition.lng();
        break;
      case 1: // NW
        newNeLat = newPosition.lat(); newSwLng = newPosition.lng();
        break;
      case 2: // SW
        newSwLat = newPosition.lat(); newSwLng = newPosition.lng();
        break;
      case 3: // SE
        newSwLat = newPosition.lat(); newNeLng = newPosition.lng();
        break;
    }

    return new google.maps.LatLngBounds(
      new google.maps.LatLng(Math.min(newNeLat, newSwLat), Math.min(newNeLng, newSwLng)),
      new google.maps.LatLng(Math.max(newNeLat, newSwLat), Math.max(newNeLng, newSwLng))
    );
  }

  private getCurrentCornerPosition(cornerIndex: number, bounds: google.maps.LatLngBounds): google.maps.LatLng {
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    switch (cornerIndex) {
      case 0: return ne;
      case 1: return new google.maps.LatLng(ne.lat(), sw.lng());
      case 2: return sw;
      case 3: return new google.maps.LatLng(sw.lat(), ne.lng());
      default: return ne; // Should not happen
    }
  }

  private boundsChangedSignificantly(oldBounds: google.maps.LatLngBounds, newBounds: google.maps.LatLngBounds): boolean {
    const threshold = 0.00001; // Epsilon for float comparison
    return !oldBounds.equals(newBounds) && (
      Math.abs(oldBounds.getNorthEast().lat() - newBounds.getNorthEast().lat()) > threshold ||
      Math.abs(oldBounds.getNorthEast().lng() - newBounds.getNorthEast().lng()) > threshold ||
      Math.abs(oldBounds.getSouthWest().lat() - newBounds.getSouthWest().lat()) > threshold ||
      Math.abs(oldBounds.getSouthWest().lng() - newBounds.getSouthWest().lng()) > threshold
    );
  }

  private updateCustomOverlayBounds(overlay: ImageOverlayData, newBounds: google.maps.LatLngBounds): void {
    overlay.bounds = newBounds;
    if (overlay.groundOverlay && typeof overlay.groundOverlay.setBounds === 'function') {
      overlay.groundOverlay.setBounds(newBounds);
    }
  }

  private updateImagePosition(newPosition: google.maps.LatLng): void {
    if (!this.currentDragData || this.currentDragData.handleType !== 'center') return;

    const { overlay, startPosition } = this.currentDragData;
    const latDiff = newPosition.lat() - startPosition.lat();
    const lngDiff = newPosition.lng() - startPosition.lng();

    const oldBounds = overlay.bounds;
    const newSW = new google.maps.LatLng(oldBounds.getSouthWest().lat() + latDiff, oldBounds.getSouthWest().lng() + lngDiff);
    const newNE = new google.maps.LatLng(oldBounds.getNorthEast().lat() + latDiff, oldBounds.getNorthEast().lng() + lngDiff);

    const newBounds = new google.maps.LatLngBounds(newSW, newNE);

    this.currentDragData.startPosition = newPosition;
    this.updateCustomOverlayBounds(overlay, newBounds);
    this.updateControlHandles(overlay);
  }

  private updateImageRotation(newPosition: google.maps.LatLng): void {
    if (!this.currentDragData || this.currentDragData.handleType !== 'rotation') return;

    const { overlay } = this.currentDragData;
    const center = overlay.bounds.getCenter();
    const angle = google.maps.geometry.spherical.computeHeading(center, newPosition);

    const rotation = (angle + 90 + 360) % 360; // Normalize to 0-360
    overlay.rotation = rotation;

    if (overlay.groundOverlay && typeof overlay.groundOverlay.setRotation === 'function') {
      overlay.groundOverlay.setRotation(rotation, false);
    }

    this.selectedImageOverlay.set({ ...overlay });
  }

  private endImageDrag(): void {
    const overlay = this.currentDragData?.overlay;
    if (overlay) {
      this.updateControlHandles(overlay); // Final update
    }
    this.currentDragData = null;
  }

  private updateControlHandles(overlay: ImageOverlayData): void {
    const bounds = overlay.bounds;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const center = bounds.getCenter();

    overlay.controlPoints[0].setPosition(ne);
    overlay.controlPoints[1].setPosition(new google.maps.LatLng(ne.lat(), sw.lng()));
    overlay.controlPoints[2].setPosition(sw);
    overlay.controlPoints[3].setPosition(new google.maps.LatLng(sw.lat(), ne.lng()));
    overlay.centerMarker.setPosition(center);

    const rotationHandlePos = google.maps.geometry.spherical.computeOffset(
      center,
      google.maps.geometry.spherical.computeDistanceBetween(center, ne) * 0.7,
      overlay.rotation - 90
    );
    overlay.rotationHandle.setPosition(rotationHandlePos);
  }

  protected onImageUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage.set('Image file is too large. Please select a file smaller than 10MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Please select a valid image file.');
      return;
    }

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
      img.onerror = () => {
        this.zone.run(() => {
          this.errorMessage.set('Failed to load the selected image. Please try a different file.');
        });
      };
      img.src = this.uploadedImageUrl;
    };

    reader.onerror = () => {
      this.errorMessage.set('Failed to read the selected file. Please try again.');
    };

    reader.readAsDataURL(file);
    input.value = ''; // Allow re-uploading the same file
  }

  protected setDrawingMode(mode: 'polygon' | 'rectangle' | null): void {
    if (!this.drawingManager) return;
    this.drawingMode.set(mode);
    const googleMode = mode ? google.maps.drawing.OverlayType[mode.toUpperCase() as keyof typeof google.maps.drawing.OverlayType] : null;
    this.drawingManager.setDrawingMode(googleMode);
  }



  private recreateOverlayWithClipping(overlay: ImageOverlayData, useClipping: boolean): void {
    try {
      // Store current state
      const currentRotation = overlay.rotation;
      const currentOpacity = overlay.opacity || 0.8;
      const currentBounds = overlay.bounds;
      const isSelected = overlay.isSelected;

      // Remove old overlay with timeout cleanup
      if (overlay.groundOverlay) {
        if (overlay.recreateTimeout) {
          clearTimeout(overlay.recreateTimeout);
        }

        if (overlay.groundOverlay.setMap) {
          overlay.groundOverlay.setMap(null);
        }
      }

      // Create new overlay
      const newOverlay = useClipping
        ? this.createClippedImageOverlay(
          currentBounds,
          overlay.originalImageUrl,
          overlay.clippingPolygon,
          currentRotation,
          currentOpacity
        )
        : new this.RotatableImageOverlayClass(
          currentBounds,
          overlay.originalImageUrl,
          currentRotation,
          { opacity: currentOpacity, clickable: true }
        );

      // Set timeout to ensure proper cleanup/recreation
      overlay.recreateTimeout = setTimeout(() => {
        newOverlay.setMap(this.map);

        // Update overlay data
        overlay.groundOverlay = newOverlay;
        overlay.domElement = newOverlay.getDOMElement() || undefined;
        overlay.rotation = currentRotation;
        overlay.opacity = currentOpacity;
        overlay.isSelected = isSelected;

        // Re-attach event listeners
        newOverlay.addClickListener(() => {
          this.zone.run(() => this.selectImageOverlay(overlay));
        });

        newOverlay.addRightClickListener(() => {
          this.zone.run(() => this.removeImageOverlay(overlay));
        });

        // Update selection if needed
        if (isSelected) {
          this.selectedImageOverlay.set({ ...overlay });
        }

        overlay.recreateTimeout = undefined;
      }, 100);

    } catch (error) {
      console.error('Error in recreateOverlayWithClipping:', error);
      this.errorMessage.set('Error updating image overlay. Please try refreshing.');
    }
  }

  protected toggleAspectRatioLock(): void {
    this.aspectRatioLocked = !this.aspectRatioLocked;
  }

  protected setDragSensitivity(sensitivity: 'low' | 'medium' | 'high'): void {
    switch (sensitivity) {
      case 'low':
        this.dragThreshold = 0.0005;
        this.dragUpdateInterval = 32;
        break;
      case 'medium':
        this.dragThreshold = 0.0001;
        this.dragUpdateInterval = 16;
        break;
      case 'high':
        this.dragThreshold = 0.00001;
        this.dragUpdateInterval = 8;
        break;
    }
  }

  protected rotateSelectedImage(angle: number): void {
    const overlay = this.selectedImageOverlay();
    if (!overlay) return;

    overlay.rotation = (overlay.rotation + angle + 360) % 360;

    if (overlay.groundOverlay && typeof overlay.groundOverlay.setRotation === 'function') {
      overlay.groundOverlay.setRotation(overlay.rotation, true);
    }

    this.selectedImageOverlay.set({ ...overlay });
    this.updateControlHandles(overlay);
  }

  protected setImageOpacity(value: string): void {
    const overlay = this.selectedImageOverlay();
    if (!overlay) return;

    const opacity = parseFloat(value) / 100;
    overlay.opacity = opacity;

    if (overlay.groundOverlay && typeof overlay.groundOverlay.setOpacity === 'function') {
      overlay.groundOverlay.setOpacity(opacity);
    }

    this.selectedImageOverlay.set({ ...overlay });
  }

  protected clearAllPolygons(): void {
    if (this.polygons.length === 0) return;

    if (!confirm(`Are you sure you want to delete all ${this.polygons.length} polygons?`)) return;

    [...this.polygons].forEach(p => this.removePolygon(p));
  }

  protected clearAllImages(): void {
    if (this.imageOverlays.length === 0) return;

    if (!confirm(`Are you sure you want to delete all ${this.imageOverlays.length} images?`)) return;

    [...this.imageOverlays].forEach(overlay => this.removeImageOverlay(overlay, true));
  }

  private removeImageOverlayFromMap(overlay: ImageOverlayData): void {
    // Clear any pending recreation timeout
    if (overlay.recreateTimeout) {
      clearTimeout(overlay.recreateTimeout);
      overlay.recreateTimeout = undefined;
    }

    if (overlay.groundOverlay && overlay.groundOverlay.setMap) {
      overlay.groundOverlay.setMap(null);
    }

    overlay.controlPoints.forEach(p => p.setMap(null));
    overlay.rotationHandle.setMap(null);
    overlay.centerMarker.setMap(null);
  }

  private removeImageOverlay(overlayToRemove: ImageOverlayData, skipConfirm = false): void {
    if (!skipConfirm) {
      if (!confirm('Are you sure you want to delete this image overlay?')) return;
    }

    this.removeImageOverlayFromMap(overlayToRemove);
    this.imageOverlays = this.imageOverlays.filter(o => o.id !== overlayToRemove.id);

    if (this.selectedImageOverlay()?.id === overlayToRemove.id) {
      this.selectedImageOverlay.set(null);
    }
  }

  protected exportCoordinates(): void {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        polygons: this.polygons.map((p, index) => ({
          id: index + 1,
          coordinates: this.getPolygonCoordinates(p),
        })),
        images: this.imageOverlays.map(img => {
          const b = img.bounds;
          return {
            id: img.id,
            imageUrl: img.originalImageUrl.substring(0, 50) + '...', // Truncate for export size
            rotation: img.rotation,
            opacity: img.opacity || 0.8,
            bounds: {
              north: b.getNorthEast().lat(),
              east: b.getNorthEast().lng(),
              south: b.getSouthWest().lat(),
              west: b.getSouthWest().lng(),
            },
            size: this.getImageOverlaySize(img)
          };
        }),
        metadata: {
          totalPolygons: this.polygons.length,
          totalImages: this.imageOverlays.length,
          mapCenter: this.map?.getCenter()?.toJSON() || null,
          mapZoom: this.map?.getZoom() || null
        }
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `map_data_${new Date().getTime()}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();

      this.showTemporaryMessage('Data exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      this.errorMessage.set('Failed to export data. Please try again.');
    }
  }

  private showTemporaryMessage(message: string): void {
    const originalErrorMessage = this.errorMessage();
    this.errorMessage.set(message);
    setTimeout(() => {
      if (this.errorMessage() === message) {
        this.errorMessage.set(originalErrorMessage);
      }
    }, 3000);
  }

  protected clearError(): void {
    this.errorMessage.set(null);
  }

  protected getImageOverlaySize(overlay: ImageOverlayData): string {
    const bounds = overlay.bounds;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const se = new google.maps.LatLng(sw.lat(), ne.lng());
    const width = google.maps.geometry.spherical.computeDistanceBetween(se, sw);
    const height = google.maps.geometry.spherical.computeDistanceBetween(ne, se);
    return `${width.toFixed(1)}m × ${height.toFixed(1)}m`;
  }

  private cleanupResources(): void {
    if (this.overlayCompleteListener) {
      google.maps.event.removeListener(this.overlayCompleteListener);
    }

    if (this.map) {
      google.maps.event.clearInstanceListeners(this.map);
    }

    this.clearAllImages();
    this.clearAllPolygons();
  }
}