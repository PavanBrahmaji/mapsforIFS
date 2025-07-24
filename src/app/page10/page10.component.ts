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

interface ResizeStartInfo {
  mouseStart: { x: number, y: number };
  scaleStart: number;
  center: L.LatLng;
  handleIndex: number;
  anchorCorner?: { x: number, y: number };
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
  private rotationConnector: HTMLElement | null = null;
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
  private dragMoveHandler?: (e: MouseEvent) => void;
  private dragEndHandler?: (e: MouseEvent) => void;
  public extracting: boolean = false;

  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);
  private apiService = inject(ApiService);

  private resizeHandles: HTMLElement[] = [];
  private resizing: boolean = false;
  private resizeStartInfo: ResizeStartInfo | null = null;

  private rotationHandle: HTMLElement | null = null;
  private rotating: boolean = false;
  private rotateStartInfo: { mouseStart: { x: number, y: number }, angleStart: number, center: { x: number, y: number } } | null = null;

  ngOnInit(): void {
    this.pluginReady = this.loadScript('https://unpkg.com/leaflet-imageoverlay-rotated@0.1.4/Leaflet.ImageOverlay.Rotated.js');
    // Inject styles for resize handles (only once)
    if (!document.getElementById('resize-handle-style')) {
      const style = document.createElement('style');
      style.id = 'resize-handle-style';
      style.innerHTML = `
        .resize-handle {
          transition: background 0.2s;
        }
        .resize-handle:hover {
          background: #007bff;
        }
      `;
      document.head.appendChild(style);
    }
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

    // Update interactive state and styling
    this.imageOverlay.options.interactive = this.isEditMode;

    this.updateImageBorder();

    // Ensure clipping is applied after update in view mode
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
      {
        opacity: config.opacity,
        interactive: this.isEditMode,
        bubblingMouseEvents: false,
        // Add custom class for styling
        className: this.isEditMode ? 'leaflet-image-edit-mode' : ''
      }
    ).addTo(this.map);

    if (this.isEditMode) {
      // Set interactive and attach drag handler
      this.imageOverlay.options.interactive = true;
      this.setupImageDrag();
      this.addResizeHandles();
      this.updateImageBorder();
    } else {
      // Ensure clipping is applied after creation
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
      // Only start drag if not clicking a handle
      const target = e.originalEvent.target as HTMLElement;
      if (target.classList.contains('resize-handle') ||
        target.classList.contains('rotation-handle') ||
        target.closest('.resize-handle') ||
        target.closest('.rotation-handle')) {
        return;
      }
      if (!this.isEditMode) return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      this.isDragging = true;
      this.dragStartLatLng = e.latlng;
      this.dragStartCenter = this.imageCenter ? L.latLng(this.imageCenter.lat, this.imageCenter.lng) : null;
      // Assign handlers as MouseEvent listeners
      this.dragMoveHandler = this.onImageDrag as (e: MouseEvent) => void;
      this.dragEndHandler = this.onImageDragEnd as (e: MouseEvent) => void;
      this.map.dragging.disable();
      this.map.getContainer().style.cursor = 'move';
      // Use document instead of map for better event handling
      document.addEventListener('mousemove', this.dragMoveHandler!);
      document.addEventListener('mouseup', this.dragEndHandler!);
      document.addEventListener('mouseleave', this.dragEndHandler!);
    });
  }

  private onImageDrag = (e: MouseEvent): void => {
    if (!this.isDragging || !this.dragStartLatLng || !this.dragStartCenter) return;
    // Convert mouse position to map coordinates
    const mouseLatLng = this.map.mouseEventToLatLng(e as any);
    const latDelta = mouseLatLng.lat - this.dragStartLatLng.lat;
    const lngDelta = mouseLatLng.lng - this.dragStartLatLng.lng;
    this.imageCenter = L.latLng(
      this.dragStartCenter.lat + latDelta,
      this.dragStartCenter.lng + lngDelta
    );
    this.updateImageTransform();
    this.updateImageBorder();
    // Update handles/connector position after image move
    if ((this as any)._resizeHandlesUpdate) {
      (this as any)._resizeHandlesUpdate();
    }
  }

  private onImageDragEnd = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.dragMoveHandler) {
      document.removeEventListener('mousemove', this.dragMoveHandler);
    }
    if (this.dragEndHandler) {
      document.removeEventListener('mouseup', this.dragEndHandler);
      document.removeEventListener('mouseleave', this.dragEndHandler);
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
    this.updateImageBorder();
    if ((this as any)._resizeHandlesUpdate) {
      (this as any)._resizeHandlesUpdate();
    }
    this.validateAndCorrectImagePosition();
  }
  public onRotationChange(): void {
    this.updateImageTransform();
    this.updateImageBorder();
    if ((this as any)._resizeHandlesUpdate) {
      (this as any)._resizeHandlesUpdate();
    }
    this.validateAndCorrectImagePosition();
  }
  public toggleControlsModal(): void { this.showControlsModal = !this.showControlsModal; }
  public closeControlsModal(): void { this.showControlsModal = false; }

  public enableEditing(): void {
    this.isEditMode = true;
    this.setupDrawControls();

    if (this.imageOverlay) {
      // Set interactive and re-attach drag handler
      this.imageOverlay.options.interactive = true;
      this.removeClipping();
      this.map.off('move', this.applyClipping, this);
      this.imageOverlay.off('mousedown');
      this.setupImageDrag();
      this.addResizeHandles();
      this.updateImageBorder();
    }

    if (this.boundaryPolygonLayer) {
      if (!this.drawnItems.hasLayer(this.boundaryPolygonLayer)) {
        this.drawnItems.addLayer(this.boundaryPolygonLayer);
      }
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
      this.removeResizeHandles();

      // Remove red border
      setTimeout(() => {
        const imageElement = this.imageOverlay?.getElement();
        if (imageElement) {
          imageElement.style.border = 'none';
          imageElement.style.boxShadow = 'none';
        }
      }, 100);
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

  private updateRotationConnector(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.rotationConnector) return;

    const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    this.rotationConnector.style.left = `${x1}px`;
    this.rotationConnector.style.top = `${y1}px`;
    this.rotationConnector.style.width = `${length}px`;
    this.rotationConnector.style.transform = `rotate(${angle}rad)`;
  }
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
  private createRotationConnector(): void {
    if (this.rotationConnector) {
      this.rotationConnector.remove();
    }

    this.rotationConnector = document.createElement('div');
    this.rotationConnector.className = 'rotation-connector';
    Object.assign(this.rotationConnector.style, {
      position: 'absolute',
      height: '2px',
      background: 'rgba(40, 167, 69, 0.6)',
      zIndex: 10000,
      pointerEvents: 'none',
      transformOrigin: 'left center'
    });

    document.body.appendChild(this.rotationConnector);
  }
  /**
   * Add resize handles to the image overlay for scaling
   */
  private addResizeHandles(): void {
    this.removeResizeHandles();
    if (!this.imageOverlay || !this.isEditMode) return;

    const imageElement = this.imageOverlay.getElement();
    if (!imageElement) return;

    const handlePositions = [
      { x: 0, y: 0, cursor: 'nw-resize' },   // top-left
      { x: 1, y: 0, cursor: 'ne-resize' },   // top-right
      { x: 1, y: 1, cursor: 'se-resize' },   // bottom-right
      { x: 0, y: 1, cursor: 'sw-resize' }    // bottom-left
    ];

    const handleSize = 16;
    const rotationHandleOffset = 25; // Distance from corner for rotation handle

    const updateHandles = () => {
      const rect = imageElement.getBoundingClientRect();
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;

      // Update resize handles
      handlePositions.forEach((pos, i) => {
        const handle = this.resizeHandles[i];
        if (!handle) return;

        const left = rect.left + scrollX + pos.x * rect.width - handleSize / 2;
        const top = rect.top + scrollY + pos.y * rect.height - handleSize / 2;

        handle.style.left = `${left}px`;
        handle.style.top = `${top}px`;
      });

      // Update rotation handle - attached to top-right corner
      if (this.rotationHandle) {
        const topRightX = rect.left + scrollX + rect.width - handleSize / 2;
        const topRightY = rect.top + scrollY - handleSize / 2;

        // Position rotation handle at an offset from top-right corner
        const rotationX = topRightX + rotationHandleOffset * Math.cos(-Math.PI / 4);
        const rotationY = topRightY + rotationHandleOffset * Math.sin(-Math.PI / 4);

        this.rotationHandle.style.left = `${rotationX}px`;
        this.rotationHandle.style.top = `${rotationY}px`;

        // Add a connecting line visual indicator
        this.updateRotationConnector(topRightX + handleSize / 2, topRightY + handleSize / 2, rotationX + 12, rotationY + 12);
      }
    };

    // Create resize handles
    this.resizeHandles = handlePositions.map((pos, i) => {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      Object.assign(handle.style, {
        position: 'absolute',
        width: `${handleSize}px`,
        height: `${handleSize}px`,
        background: '#fff',
        border: '3px solid #007bff',
        borderRadius: '50%',
        zIndex: 10001,
        cursor: pos.cursor,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        pointerEvents: 'auto',
        userSelect: 'none',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      });

      // Add corner indicator for better visual feedback
      const indicator = document.createElement('div');
      indicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 6px;
      background: #007bff;
      border-radius: 50%;
    `;
      handle.appendChild(indicator);

      // Prevent event bubbling to image
      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onResizeHandleMouseDown(e, i);
      });

      document.body.appendChild(handle);
      return handle;
    });

    // Create rotation handle - attached to top-right corner
    this.rotationHandle = document.createElement('div');
    this.rotationHandle.className = 'rotation-handle';
    Object.assign(this.rotationHandle.style, {
      position: 'absolute',
      width: '24px',
      height: '24px',
      background: '#fff',
      border: '3px solid #28a745',
      borderRadius: '50%',
      zIndex: 10002,
      cursor: 'grab',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      pointerEvents: 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      userSelect: 'none',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
    });

    this.rotationHandle.title = 'Rotate Image';
    this.rotationHandle.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 2a6 6 0 1 1-6 6" fill="none" stroke="#28a745" stroke-width="2"/>
      <polygon points="8,0 10,3 6,3" fill="#28a745"/>
    </svg>
  `;

    // Prevent event bubbling to image
    this.rotationHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onRotationHandleMouseDown(e);
    });

    document.body.appendChild(this.rotationHandle);

    // Create connector line element
    this.createRotationConnector();

    updateHandles();

    // Event listeners for handle updates
    window.addEventListener('scroll', updateHandles);
    window.addEventListener('resize', updateHandles);
    this.map.on('move zoom viewreset', updateHandles);

    // Save for cleanup
    (this as any)._resizeHandlesUpdate = updateHandles;
  }

  private removeResizeHandles(): void {
    this.resizeHandles.forEach(h => h.remove());
    this.resizeHandles = [];

    if (this.rotationHandle) {
      this.rotationHandle.remove();
      this.rotationHandle = null;
    }

    if (this.rotationConnector) {
      this.rotationConnector.remove();
      this.rotationConnector = null;
    }

    // Remove event listeners
    window.removeEventListener('mousemove', this.onResizeHandleMouseMove);
    window.removeEventListener('mouseup', this.onResizeHandleMouseUp);
    window.removeEventListener('mousemove', this.onRotationHandleMouseMove);
    window.removeEventListener('mouseup', this.onRotationHandleMouseUp);
    window.removeEventListener('scroll', (this as any)._resizeHandlesUpdate);
    window.removeEventListener('resize', (this as any)._resizeHandlesUpdate);

    if (this.map && (this as any)._resizeHandlesUpdate) {
      this.map.off('move zoom viewreset', (this as any)._resizeHandlesUpdate);
    }

    (this as any)._resizeHandlesUpdate = undefined;
    this.resizing = false;
    this.resizeStartInfo = null;
    this.rotating = false;
    this.rotateStartInfo = null;
  }

  /**
   * Updates the red border and box shadow for the image overlay in edit mode
   */
  private updateImageBorder(): void {
    if (!this.imageOverlay) return;
    const imageElement = this.imageOverlay.getElement();
    if (!imageElement) return;
    if (this.isEditMode) {
      imageElement.style.border = '3px solid #dc3545';
      imageElement.style.boxShadow = '0 0 10px rgba(220, 53, 69, 0.5)';
    } else {
      imageElement.style.border = 'none';
      imageElement.style.boxShadow = 'none';
    }
  }

  private onRotationHandleMouseDown = (e: MouseEvent) => {
    if (!this.isEditMode || !this.imageOverlay) return;
    e.preventDefault();
    e.stopPropagation();
    this.rotating = true;
    const imageElement = this.imageOverlay.getElement();
    if (!imageElement) return;
    const rect = imageElement.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    // Center of the image
    const center = {
      x: rect.left + scrollX + rect.width / 2,
      y: rect.top + scrollY + rect.height / 2
    };
    this.rotateStartInfo = {
      mouseStart: { x: e.pageX, y: e.pageY },
      angleStart: this.imageRotation,
      center
    };
    document.body.style.cursor = 'grabbing';
    if (this.rotationHandle) this.rotationHandle.style.cursor = 'grabbing';
    window.addEventListener('mousemove', this.onRotationHandleMouseMove);
    window.addEventListener('mouseup', this.onRotationHandleMouseUp);
  };

  private onRotationHandleMouseMove = (e: MouseEvent) => {
    if (!this.rotating || !this.rotateStartInfo || !this.imageOverlay) return;
    const { mouseStart, angleStart, center } = this.rotateStartInfo;
    // Calculate angle from center to mouse positions
    const startAngle = Math.atan2(mouseStart.y - center.y, mouseStart.x - center.x);
    const currentAngle = Math.atan2(e.pageY - center.y, e.pageX - center.x);
    // Calculate rotation delta in degrees
    let deltaAngle = (currentAngle - startAngle) * (180 / Math.PI);
    let newRotation = angleStart + deltaAngle;
    // Normalize angle to 0-360 degrees
    newRotation = ((newRotation % 360) + 360) % 360;
    this.imageRotation = newRotation;
    this.updateImageTransform();
    this.updateImageBorder();
    if ((this as any)._resizeHandlesUpdate) {
      (this as any)._resizeHandlesUpdate();
    }
    this.validateAndCorrectImagePosition();
  };

  private onRotationHandleMouseUp = (e: MouseEvent) => {
    if (!this.rotating) return;

    this.rotating = false;
    this.rotateStartInfo = null;

    document.body.style.cursor = '';
    if (this.rotationHandle) {
      this.rotationHandle.style.cursor = 'grab';
    }

    window.removeEventListener('mousemove', this.onRotationHandleMouseMove);
    window.removeEventListener('mouseup', this.onRotationHandleMouseUp);
  };

  private onResizeHandleMouseDown = (e: MouseEvent, handleIndex: number) => {
    if (!this.isEditMode || !this.imageOverlay) return;

    e.preventDefault();
    e.stopPropagation();

    this.resizing = true;

    const imageElement = this.imageOverlay.getElement();
    if (!imageElement) return;

    const rect = imageElement.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // Get the opposite corner as the anchor point
    const corners = [
      { x: rect.left + scrollX, y: rect.top + scrollY },                    // top-left
      { x: rect.left + scrollX + rect.width, y: rect.top + scrollY },       // top-right
      { x: rect.left + scrollX + rect.width, y: rect.top + scrollY + rect.height }, // bottom-right
      { x: rect.left + scrollX, y: rect.top + scrollY + rect.height }       // bottom-left
    ];

    const oppositeCornerIndex = (handleIndex + 2) % 4;
    const anchorCorner = corners[oppositeCornerIndex];

    this.resizeStartInfo = {
      mouseStart: { x: e.pageX, y: e.pageY },
      scaleStart: this.imageScale,
      center: this.imageCenter ? L.latLng(this.imageCenter.lat, this.imageCenter.lng) : L.latLng(0, 0),
      handleIndex,
      anchorCorner
    };

    // Set appropriate cursor
    const cursors = ['nw-resize', 'ne-resize', 'se-resize', 'sw-resize'];
    document.body.style.cursor = cursors[handleIndex];

    window.addEventListener('mousemove', this.onResizeHandleMouseMove);
    window.addEventListener('mouseup', this.onResizeHandleMouseUp);
  };

  private onResizeHandleMouseMove = (e: MouseEvent) => {
    if (!this.resizing || !this.resizeStartInfo || !this.imageOverlay) return;
    const imageElement = this.imageOverlay.getElement();
    if (!imageElement) return;
    const { mouseStart, scaleStart, anchorCorner } = this.resizeStartInfo;
    if (!anchorCorner) return;
    // Calculate distances from anchor corner
    const startDistance = Math.hypot(
      mouseStart.x - anchorCorner.x,
      mouseStart.y - anchorCorner.y
    );
    const currentDistance = Math.hypot(
      e.pageX - anchorCorner.x,
      e.pageY - anchorCorner.y
    );
    if (startDistance === 0) return;
    // Calculate scale factor
    let scaleFactor = currentDistance / startDistance;
    let newScale = scaleStart * scaleFactor;
    // Clamp scale to reasonable limits
    newScale = Math.max(0.1, Math.min(10, newScale));
    this.imageScale = newScale;
    this.updateImageTransform();
    this.updateImageBorder();
    if ((this as any)._resizeHandlesUpdate) {
      (this as any)._resizeHandlesUpdate();
    }
    this.validateAndCorrectImagePosition();
  };

  private onResizeHandleMouseUp = (e: MouseEvent) => {
    if (!this.resizing) return;

    this.resizing = false;
    this.resizeStartInfo = null;

    document.body.style.cursor = '';

    window.removeEventListener('mousemove', this.onResizeHandleMouseMove);
    window.removeEventListener('mouseup', this.onResizeHandleMouseUp);
  };
}