import { Component, ViewChild, ElementRef, Input, OnInit, AfterViewInit, Renderer2, ChangeDetectorRef, inject } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import type { FeatureCollection, Feature } from 'geojson';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

declare module 'leaflet' {
  namespace ImageOverlay {
    interface Rotated extends L.ImageOverlay {
      reposition(topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng): void;
      setOpacity(opacity: number): this;
      setUrl(url: string): this;
    }
  }
  namespace imageOverlay {
    function rotated(
      imgSrc: string | HTMLImageElement | HTMLCanvasElement,
      topleft: L.LatLng,
      topright: L.LatLng,
      bottomleft: L.LatLng,
      options?: L.ImageOverlayOptions
    ): L.ImageOverlay.Rotated;
  }
}

export interface ImageConfig {
  fileName: string;
  aspectRatio: number;
  scale: number;
  rotation: number;
  opacity: number;
  center: { lat: number, lng: number };
  originalWidthMeters: number;
  originalHeightMeters: number;
}

interface SiteData {
  site: string;
  globalVar: FeatureCollection;
  selectedLocations: any[];
  imageConfigs?: {
    original?: ImageConfig;
    annotated?: ImageConfig;
  };
}

@Component({
  selector: 'app-page-10',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './page10.component.html',
  styleUrls: ['./page10.component.css']
})
export class Page10Component implements OnInit, AfterViewInit {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  @ViewChild('originalImageInput', { static: false }) originalImageInput!: ElementRef;
  @ViewChild('annotatedImageInput', { static: false }) annotatedImageInput!: ElementRef;

  @Input() lat: number = 20.5937;
  @Input() lon: number = 78.9629;

  map!: L.Map;
  drawnItems!: L.FeatureGroup;
  public boundaryPolygonLayer?: L.Polygon;
  public imageOverlay?: L.ImageOverlay.Rotated;
  private drawControl: L.Control.Draw | null = null;

  public siteData: SiteData = {
    site: 'international',
    globalVar: { type: 'FeatureCollection', features: [] },
    selectedLocations: [],
    imageConfigs: {}
  };

  public activeImageType: 'original' | 'annotated' | 'none' = 'none';
  private lastActiveImageType: 'original' | 'annotated' | 'none' = 'none';

  public imageScale: number = 1;
  public imageRotation: number = 0;
  public imageOpacity: number = 0.8;
  public imageCenter: L.LatLng | null = null;

  public showUploadModal: boolean = false;
  public isEditMode: boolean = true;
  public showControlsModal: boolean = false;

  private serverUrl = 'http://localhost:3000';
  private pluginReady!: Promise<void>;
  private isDragging: boolean = false;
  private dragStartLatLng: L.LatLng | null = null;
  private dragStartCenter: L.LatLng | null = null;
  private dragMoveHandler?: (e: L.LeafletMouseEvent) => void;
  private dragEndHandler?: () => void;
  public extracting: boolean = false;

  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);
  private apiService = inject(ApiService);

  ngOnInit(): void {
    this.pluginReady = this.loadScript('https://unpkg.com/leaflet-imageoverlay-rotated@0.1.4/Leaflet.ImageOverlay.Rotated.js');
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.pluginReady;
      this.initializeMap();
      this.loadStateFromLocalStorage();
    } catch (error) {
      console.error("Plugin failed to load, cannot initialize the map.", error);
    }
  }

  public switchImageType(): void {
    if (this.lastActiveImageType === this.activeImageType) return;

    if (this.isEditMode && this.lastActiveImageType !== 'none') {
      this.saveCurrentConfig();
    }

    this.loadConfigForType(this.activeImageType);

    if (this.activeImageType === 'none') {
      if (this.imageOverlay) {
        this.imageOverlay.remove();
        this.imageOverlay = undefined;
      }
    } else {
      if (this.imageOverlay) {
        this.updateImageOverlay();
      } else {
        this.createImageOverlay();
      }
      // --- Ensure clipping is applied after switching image type ---
      if (!this.isEditMode && this.imageOverlay) {
        this.applyClipping();
      }
    }
    this.lastActiveImageType = this.activeImageType;
  }

  /**
   * ✨ FIXED: This method is now simpler and more robust.
   * It creates the image config, then delegates the state transition
   * and view update to the switchImageType() method.
   */
  public onImageFileSelected(event: any, type: 'original' | 'annotated'): void {
    if (!this.isEditMode || !this.boundaryPolygonLayer) return;
    const file = event.target?.files?.[0];
    if (!file) return;

    this.apiService.uploadImage(file).subscribe({
      next: (response) => {
        const img = new Image();
        img.onload = () => {
          const center = this.siteData.imageConfigs?.[type]?.center
            ? L.latLng(this.siteData.imageConfigs[type]!.center)
            : this.boundaryPolygonLayer!.getBounds().getCenter();

          const aspectRatio = img.naturalWidth / img.naturalHeight;
          const initialDimensions = this.calculateInitialImageDimensions(aspectRatio);

          const newConfig: ImageConfig = {
            fileName: response.url.split('/').pop() || '',
            aspectRatio: aspectRatio,
            scale: 1,
            rotation: 0,
            opacity: 0.8,
            center: { lat: center.lat, lng: center.lng },
            originalWidthMeters: initialDimensions.width,
            originalHeightMeters: initialDimensions.height,
          };

          if (!this.siteData.imageConfigs) this.siteData.imageConfigs = {};
          this.siteData.imageConfigs[type] = newConfig;

          // Set the active type and call the main switch function
          // to handle the view change correctly.
          this.activeImageType = type;
          this.switchImageType();

          if (!this.showControlsModal) this.showControlsModal = true;
          this.cdr.detectChanges();
        };
        img.src = `${this.serverUrl}${response.url}`;
      },
      error: (err) => console.error('Upload failed', err)
    });
  }

  private saveCurrentConfig(): void {
    if (this.lastActiveImageType === 'none' || !this.siteData.imageConfigs) return;

    const config = this.siteData.imageConfigs[this.lastActiveImageType];
    if (config && this.imageCenter) {
      config.scale = this.imageScale;
      config.rotation = this.imageRotation;
      config.opacity = this.imageOpacity;
      config.center = { lat: this.imageCenter.lat, lng: this.imageCenter.lng };
    }
  }

  private loadConfigForType(type: 'original' | 'annotated' | 'none'): void {
    if (type === 'none' || !this.siteData.imageConfigs?.[type]) {
      this.imageScale = 1;
      this.imageRotation = 0;
      this.imageOpacity = 0.8;
      this.imageCenter = null;
      return;
    }
    const config = this.siteData.imageConfigs[type]!;
    this.imageScale = config.scale;
    this.imageRotation = config.rotation;
    this.imageOpacity = config.opacity;
    this.imageCenter = L.latLng(config.center.lat, config.center.lng);
  }

  private updateImageOverlay(): void {
    if (this.activeImageType === 'none' || !this.imageOverlay || !this.siteData.imageConfigs?.[this.activeImageType]) return;
    const config = this.siteData.imageConfigs[this.activeImageType]!;
    const url = `${this.serverUrl}/images/${config.fileName}`;
    const corners = this.calculateImageCorners(config);
    this.imageOverlay.setUrl(url);
    this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);
    this.imageOverlay.setOpacity(config.opacity);
    // --- Ensure clipping is applied after update ---
    if (!this.isEditMode) {
      this.applyClipping();
    }
  }

  private createImageOverlay(): void {
    if (this.activeImageType === 'none' || !this.siteData.imageConfigs?.[this.activeImageType]) return;
    const config = this.siteData.imageConfigs[this.activeImageType]!;
    const imageUrl = `${this.serverUrl}/images/${config.fileName}`;

    if (this.imageOverlay) this.imageOverlay.remove();

    this.imageCenter = L.latLng(config.center.lat, config.center.lng);
    const corners = this.calculateImageCorners(config);

    this.imageOverlay = L.imageOverlay.rotated(
      imageUrl,
      corners.topleft, corners.topright, corners.bottomleft,
      { opacity: config.opacity, interactive: true, bubblingMouseEvents: false }
    ).addTo(this.map);

    if (this.isEditMode) {
      // Always set interactive and attach drag handler
      this.imageOverlay.options.interactive = true;
      this.imageOverlay.off('mousedown');
      this.setupImageDrag();
    } else {
      // --- Ensure clipping is applied after creation ---
      this.applyClipping();
    }
  }

  private calculateImageCorners(config: ImageConfig): { topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng } {
    const center = L.latLng(config.center.lat, config.center.lng);
    const lat = center.lat;
    const metersPerDegreeLat = 111132.954 - 559.822 * Math.cos(2 * lat * Math.PI / 180) + 1.175 * Math.cos(4 * lat * Math.PI / 180);
    const metersPerDegreeLng = 111320 * Math.cos(lat * Math.PI / 180);
    const imageHeightDegrees = (config.originalHeightMeters * config.scale) / metersPerDegreeLat;
    const imageWidthDegrees = (config.originalWidthMeters * config.scale) / metersPerDegreeLng;
    const halfWidth = imageWidthDegrees / 2;
    const halfHeight = imageHeightDegrees / 2;
    const topleft = L.latLng(center.lat + halfHeight, center.lng - halfWidth);
    const topright = L.latLng(center.lat + halfHeight, center.lng + halfWidth);
    const bottomleft = L.latLng(center.lat - halfHeight, center.lng - halfWidth);
    const angleRad = config.rotation * (Math.PI / 180);
    const rotatePoint = (point: L.LatLng) => {
      const dx = point.lng - center.lng;
      const dy = point.lat - center.lat;
      const newLng = center.lng + (dx * Math.cos(angleRad) - dy * Math.sin(angleRad));
      const newLat = center.lat + (dx * Math.sin(angleRad) + dy * Math.cos(angleRad));
      return L.latLng(newLat, newLng);
    };
    return { topleft: rotatePoint(topleft), topright: rotatePoint(topright), bottomleft: rotatePoint(bottomleft) };
  }

  public updateImageTransform(): void {
    if (this.activeImageType === 'none' || !this.imageOverlay || !this.siteData.imageConfigs?.[this.activeImageType]) return;

    const config = this.siteData.imageConfigs[this.activeImageType]!;
    config.scale = this.imageScale;
    config.rotation = this.imageRotation;
    if (this.imageCenter) {
      config.center = { lat: this.imageCenter.lat, lng: this.imageCenter.lng };
    }

    const corners = this.calculateImageCorners(config);
    this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);
  }

  public onOpacityChange(): void {
    if (this.imageOverlay) this.imageOverlay.setOpacity(this.imageOpacity);
  }

  public saveConfiguration(): void {
    try {
      if (this.activeImageType !== 'none') {
        this.saveCurrentConfig();
      }
      localStorage.setItem('siteData', JSON.stringify(this.siteData));
      this.isEditMode = false;
      this.disableEditing();
      // --- Add this line ---
      this.validateAndCorrectImagePosition();
      alert('Configuration saved successfully!');
    } catch (error) { console.error('Error saving configuration:', error); }
  }

  /**
   * Ensures the image center is within the boundary after saving
   */
  private validateAndCorrectImagePosition(): void {
    if (
      this.activeImageType === 'none' ||
      !this.imageCenter ||
      !this.boundaryPolygonLayer ||
      !this.siteData.imageConfigs?.[this.activeImageType]
    ) {
      return;
    }
    const bounds = this.boundaryPolygonLayer.getBounds();
    const center = bounds.getCenter();
    // Check if current position is valid
    if (!this.isImageCenterWithinBounds(this.imageCenter)) {
      // Move image to boundary center
      this.imageCenter = center;
      // Update config
      const config = this.siteData.imageConfigs[this.activeImageType]!
      config.center = { lat: center.lat, lng: center.lng };
      // Update overlay
      this.updateImageTransform();
    }
  }

  private isImageCenterWithinBounds(center: L.LatLng): boolean {
    if (!this.boundaryPolygonLayer) return true;
    try {
      const bounds = this.boundaryPolygonLayer.getBounds();
      const padding = 0.001;
      return (
        center.lat >= bounds.getSouth() + padding &&
        center.lat <= bounds.getNorth() - padding &&
        center.lng >= bounds.getWest() + padding &&
        center.lng <= bounds.getEast() - padding
      );
    } catch (error) {
      return true;
    }
  }

  private loadStateFromLocalStorage(): void {
    const siteDataString = localStorage.getItem('siteData');
    if (!siteDataString) {
      this.isEditMode = true;
      return;
    }
    try {
      const loadedData = JSON.parse(siteDataString) as SiteData;
      this.siteData = loadedData;
      if (!this.siteData.imageConfigs) this.siteData.imageConfigs = {};

      if (this.siteData.globalVar?.features) {
        const polygonFeature = this.siteData.globalVar.features.find(f => f.geometry?.type === 'Polygon');
        if (polygonFeature) {
          const layer = L.geoJSON(polygonFeature).getLayers()[0] as L.Polygon;
          this.drawnItems.addLayer(layer);
          this.boundaryPolygonLayer = layer;
          this.map.fitBounds(layer.getBounds());
        }
      }

      this.isEditMode = false;
      this.disableEditing();
      this.setupDrawControls();

      if (this.siteData.imageConfigs?.original) {
        this.activeImageType = 'original';
      } else if (this.siteData.imageConfigs?.annotated) {
        this.activeImageType = 'annotated';
      } else {
        this.activeImageType = 'none';
      }

      this.loadConfigForType(this.activeImageType);
      // --- Always validate and correct image position before creating overlay ---
      this.validateAndCorrectImagePosition();
      this.createImageOverlay();
      this.lastActiveImageType = this.activeImageType;

    } catch (error) {
      console.error('Error loading state:', error);
      this.isEditMode = true;
    }
  }

  public removeImage(typeToRemove: 'original' | 'annotated'): void {
    if (!this.siteData.imageConfigs?.[typeToRemove]) return;

    delete this.siteData.imageConfigs[typeToRemove];

    if (this.activeImageType === typeToRemove) {
      const nextType = this.siteData.imageConfigs?.original ? 'original'
        : this.siteData.imageConfigs?.annotated ? 'annotated'
          : 'none';
      this.activeImageType = nextType;
      this.switchImageType();
    }
    this.cdr.detectChanges();
  }

  public handleUploadClick(): void {
    if (!this.isEditMode) {
      alert('Please enable Edit Mode to upload images.');
      return;
    }
    this.toggleUploadModal();
  }

  public toggleUploadModal(): void {
    if (!this.boundaryPolygonLayer) {
      alert('Please draw a boundary polygon on the map first.');
      return;
    }
    this.showUploadModal = !this.showUploadModal;
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, { attributionControl: false }).setView([this.lat, this.lon], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map,);
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);
    this.setupDrawControls();
    this.setupMapEvents();
  }

  private setupDrawControls(): void {
    if (this.drawControl) {
      this.map.removeControl(this.drawControl);
      this.drawControl = null;
    }
    if (!this.isEditMode) return;
    const drawOptions: L.Control.DrawConstructorOptions = {
      position: 'topleft',
      draw: {
        polygon: this.boundaryPolygonLayer ? false : {
          shapeOptions: { color: '#f06eaa', weight: 3, opacity: 0.8, fillOpacity: 0.2 }
        },
        polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false,
      },
      edit: this.boundaryPolygonLayer ? { featureGroup: this.drawnItems, remove: true } : undefined
    };
    this.drawControl = new L.Control.Draw(drawOptions);
    this.map.addControl(this.drawControl);
  }

  private setupMapEvents(): void {
    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      if (!this.isEditMode) return;
      const layer = e.layer;
      if (layer instanceof L.Polygon) {
        this.drawnItems.clearLayers();
        this.drawnItems.addLayer(layer);
        this.boundaryPolygonLayer = layer;
        this.setupBoundaryInteraction(layer);
        this.setupDrawControls();
      }
    });
    this.map.on(L.Draw.Event.EDITED, () => { if (this.boundaryPolygonLayer && !this.isEditMode) { this.applyClipping(); } });
    this.map.on(L.Draw.Event.DELETED, () => {
      if (!this.isEditMode) return;
      this.boundaryPolygonLayer = undefined;
      this.siteData.imageConfigs = {};
      this.activeImageType = 'none';
      this.switchImageType();
      this.setupDrawControls();
    });
    this.map.on('draw:editstart', () => { if (this.imageOverlay) this.removeClipping(); });
    this.map.on('draw:editstop', () => { if (this.imageOverlay && !this.isEditMode) this.applyClipping(); });

    // --- Add these lines ---
    this.map.on('zoomend moveend', () => {
      this.updateImageOverlayPositionOnMapChange();
    });
  }

  /**
   * Ensures the image overlay is repositioned and clipped after map zoom/pan
   */
  private updateImageOverlayPositionOnMapChange(): void {
    if (
      this.activeImageType === 'none' ||
      !this.imageOverlay ||
      !this.siteData.imageConfigs?.[this.activeImageType]
    ) return;
    const config = this.siteData.imageConfigs[this.activeImageType]!;
    const corners = this.calculateImageCorners(config);
    this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);
    if (!this.isEditMode) {
      this.applyClipping();
    }
  }

  private setupBoundaryInteraction(layer: L.Polygon): void {
    const element = layer.getElement();
    if (element) {
      (element as HTMLElement).style.cursor = this.isEditMode ? 'pointer' : 'default';
    }
  }

  private setupImageDrag(): void {
    if (!this.imageOverlay || !this.isEditMode) return;
    this.imageOverlay.off('mousedown');
    this.imageOverlay.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (!this.isEditMode) return;
      e.originalEvent.preventDefault();
      this.isDragging = true;
      this.dragStartLatLng = e.latlng;
      this.dragStartCenter = this.imageCenter ? L.latLng(this.imageCenter.lat, this.imageCenter.lng) : null;
      this.dragMoveHandler = this.onImageDrag.bind(this);
      this.dragEndHandler = this.onImageDragEnd.bind(this);
      this.map.dragging.disable();
      this.map.getContainer().style.cursor = 'move';
      this.map.on('mousemove', this.dragMoveHandler);
      this.map.on('mouseup', this.dragEndHandler);
      this.map.on('mouseout', this.dragEndHandler);
    });
  }

  private onImageDrag(e: L.LeafletMouseEvent): void {
    if (!this.isDragging || !this.dragStartLatLng || !this.dragStartCenter) return;
    const newLatLng = e.latlng;
    const latDelta = newLatLng.lat - this.dragStartLatLng.lat;
    const lngDelta = newLatLng.lng - this.dragStartLatLng.lng;
    this.imageCenter = L.latLng(this.dragStartCenter.lat + latDelta, this.dragStartCenter.lng + lngDelta);
    this.updateImageTransform();
  }

  private onImageDragEnd(): void {
  if (!this.isDragging) return;
  this.isDragging = false;
  if (this.dragMoveHandler) { this.map.off('mousemove', this.dragMoveHandler); }
  if (this.dragEndHandler) {
    this.map.off('mouseup', this.dragEndHandler);
    this.map.off('mouseout', this.dragEndHandler);
  }
  this.map.dragging.enable();
  this.map.getContainer().style.cursor = '';
  // Ensure image is inside boundary after drag
  this.validateAndCorrectImagePosition();
  }

  private calculateInitialImageDimensions(aspectRatio: number): { width: number, height: number } {
    const DEFAULT_IMAGE_WIDTH_METERS = 500;
    return {
      width: DEFAULT_IMAGE_WIDTH_METERS,
      height: DEFAULT_IMAGE_WIDTH_METERS / aspectRatio
    };
  }

  public onScaleChange(): void {
    this.updateImageTransform();
    this.validateAndCorrectImagePosition();
  }
  public onRotationChange(): void {
    this.updateImageTransform();
    this.validateAndCorrectImagePosition();
  }
  public toggleControlsModal(): void { this.showControlsModal = !this.showControlsModal; }
  public closeControlsModal(): void { this.showControlsModal = false; }

  public enableEditing(): void {
    this.isEditMode = true;
    this.setupDrawControls();
    if (this.imageOverlay) {
      // Always set interactive and re-attach drag handler
      this.imageOverlay.options.interactive = true;
      this.removeClipping();
      this.map.off('move', this.applyClipping, this);
      this.imageOverlay.off('mousedown');
      this.setupImageDrag();
    }
    if (this.boundaryPolygonLayer) {
      if (!this.drawnItems.hasLayer(this.boundaryPolygonLayer)) this.drawnItems.addLayer(this.boundaryPolygonLayer);
      this.setupBoundaryInteraction(this.boundaryPolygonLayer);
    }
    this.cdr.detectChanges();
  }

  private disableEditing(): void {
    if (this.drawControl) {
      this.map.removeControl(this.drawControl);
      this.drawControl = null;
    }
    if (this.imageOverlay) {
      this.imageOverlay.options.interactive = false;
      this.imageOverlay.off('mousedown');
      this.applyClipping();
      this.map.on('move', this.applyClipping, this);
    }
  }

  private getClipPathForPolygon(): string {
    if (!this.boundaryPolygonLayer || !this.imageOverlay) return 'none';
    const imageElement = this.imageOverlay.getElement();
    if (!imageElement) return 'none';
    const imageBounds = imageElement.getBoundingClientRect();
    const latLngs = this.boundaryPolygonLayer.getLatLngs()[0] as L.LatLng[];
    const pixelPoints = latLngs.map(latLng => {
      const point = this.map.latLngToContainerPoint(latLng);
      const relativeX = point.x - imageBounds.left;
      const relativeY = point.y - imageBounds.top;
      return `${relativeX.toFixed(2)}px ${relativeY.toFixed(2)}px`;
    });
    return `polygon(${pixelPoints.join(', ')})`;
  }

  private applyClipping(): void {
    if (!this.imageOverlay) return;
    const imageElement = this.imageOverlay.getElement();
    if (imageElement) {
      const clipPath = this.getClipPathForPolygon();
      this.renderer.setStyle(imageElement, 'clip-path', clipPath);
      this.renderer.setStyle(imageElement, '-webkit-clip-path', clipPath);
    }
  }

  private removeClipping(): void {
    if (!this.imageOverlay) return;
    const imageElement = this.imageOverlay.getElement();
    if (imageElement) {
      this.renderer.removeStyle(imageElement, 'clip-path');
      this.renderer.removeStyle(imageElement, '-webkit-clip-path');
    }
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = this.renderer.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = (e: any) => reject(e);
      this.renderer.appendChild(document.head, script);
    });
  }
  public async extractMapImage(): Promise<void> {
    if (!this.boundaryPolygonLayer || this.extracting) {
      console.warn('No boundary polygon found or extraction already in progress');
      return;
    }

    this.extracting = true;

    try {
      // Get the boundary polygon bounds
      const bounds = this.boundaryPolygonLayer.getBounds();

      // Temporarily hide the boundary polygon and image overlay for cleaner capture
      const originalBoundaryDisplay = this.boundaryPolygonLayer.options.opacity;
      const originalImageDisplay = this.imageOverlay?.options.opacity;

      // Hide elements temporarily
      this.boundaryPolygonLayer.setStyle({ opacity: 0, fillOpacity: 0 });
      if (this.imageOverlay) {
        this.imageOverlay.setOpacity(0);
      }

      // Hide draw controls temporarily
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
      }

      // Wait for the map to render without the hidden elements
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fit map to boundary bounds for better capture
      const originalView = {
        center: this.map.getCenter(),
        zoom: this.map.getZoom()
      };

      this.map.fitBounds(bounds, { padding: [20, 20] });

      // Wait for map to finish panning/zooming
      await new Promise(resolve => setTimeout(resolve, 500));

      // Create canvas for the extracted image
      const canvas = await this.captureMapWithinBoundary();

      // Restore original map view
      this.map.setView(originalView.center, originalView.zoom);

      // Restore visibility of elements
      this.boundaryPolygonLayer.setStyle({
        opacity: originalBoundaryDisplay || 0.8,
        fillOpacity: 0.2
      });

      if (this.imageOverlay && originalImageDisplay !== undefined) {
        this.imageOverlay.setOpacity(originalImageDisplay);
      }

      // Restore draw controls
      if (this.isEditMode) {
        this.setupDrawControls();
      }

      // Download the extracted image
      this.downloadCanvas(canvas, 'extracted-map-image.png');

    } catch (error) {
      console.error('Error extracting map image:', error);
      alert('Failed to extract map image. Please try again.');
    } finally {
      this.extracting = false;
    }
  }

  /**
   * Capture the map content within the boundary polygon
   */
  private async captureMapWithinBoundary(): Promise<HTMLCanvasElement> {
    const mapContainer = this.mapContainer.nativeElement;
    const bounds = this.boundaryPolygonLayer!.getBounds();

    // Get the polygon points in pixel coordinates
    const polygonPoints = (this.boundaryPolygonLayer!.getLatLngs()[0] as L.LatLng[])
      .map(latLng => this.map.latLngToContainerPoint(latLng));

    // Create a temporary canvas to capture the map
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Calculate the bounding box of the polygon
    const minX = Math.min(...polygonPoints.map(p => p.x));
    const maxX = Math.max(...polygonPoints.map(p => p.x));
    const minY = Math.min(...polygonPoints.map(p => p.y));
    const maxY = Math.max(...polygonPoints.map(p => p.y));

    const width = maxX - minX;
    const height = maxY - minY;

    canvas.width = width;
    canvas.height = height;

    // Use html2canvas to capture the map
    const html2canvas = await this.loadHtml2Canvas();

    try {
      const mapCanvas = await html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: true,
        scale: 1,
        width: mapContainer.offsetWidth,
        height: mapContainer.offsetHeight,
        backgroundColor: null
      });

      // Create clipping path for the polygon
      ctx.save();
      ctx.beginPath();

      // Adjust polygon points relative to the cropping area
      const adjustedPoints = polygonPoints.map(p => ({
        x: p.x - minX,
        y: p.y - minY
      }));

      ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
      for (let i = 1; i < adjustedPoints.length; i++) {
        ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
      }
      ctx.closePath();
      ctx.clip();

      // Draw the captured map image, cropped to the bounding box
      ctx.drawImage(
        mapCanvas,
        minX, minY, width, height,  // Source rectangle
        0, 0, width, height         // Destination rectangle
      );

      ctx.restore();

      return canvas;

    } catch (error) {
      console.error('Error capturing map with html2canvas:', error);

      // Fallback: create a simple canvas with boundary info
      return this.createFallbackCanvas(width, height);
    }
  }

  /**
   * Load html2canvas library dynamically
   */
  private async loadHtml2Canvas(): Promise<any> {
    return new Promise((resolve, reject) => {
      if ((window as any).html2canvas) {
        resolve((window as any).html2canvas);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve((window as any).html2canvas);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Create a fallback canvas when html2canvas fails
   */
  private createFallbackCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#333';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Map capture failed', width / 2, height / 2);
    ctx.fillText('Please try again', width / 2, height / 2 + 20);

    return canvas;
  }

  /**
   * Download the canvas as an image file
   */
  private downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }

  /**
   * Alternative method using Leaflet's built-in screenshot capabilities
   * This method captures just the map tiles within the boundary
   */
  public async extractMapImageAlternative(): Promise<void> {
    if (!this.boundaryPolygonLayer || this.extracting) {
      console.warn('No boundary polygon found or extraction already in progress');
      return;
    }

    this.extracting = true;

    try {
      // Get boundary bounds
      const bounds = this.boundaryPolygonLayer.getBounds();

      // Create a temporary map container
      const tempMapDiv = document.createElement('div');
      tempMapDiv.style.width = '800px';
      tempMapDiv.style.height = '600px';
      tempMapDiv.style.position = 'absolute';
      tempMapDiv.style.left = '-9999px';
      tempMapDiv.style.top = '-9999px';
      document.body.appendChild(tempMapDiv);

      // Create temporary map
      const tempMap = L.map(tempMapDiv).fitBounds(bounds);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(tempMap);

      // Wait for tiles to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Capture the temporary map
      const html2canvas = await this.loadHtml2Canvas();
      const canvas = await html2canvas(tempMapDiv, {
        useCORS: true,
        allowTaint: true,
        scale: 1
      });

      // Clean up
      tempMap.remove();
      document.body.removeChild(tempMapDiv);

      // Download the image
      this.downloadCanvas(canvas, 'extracted-map-tiles.png');

    } catch (error) {
      console.error('Error with alternative extraction:', error);
      alert('Failed to extract map image. Please try again.');
    } finally {
      this.extracting = false;
    }
  }
}