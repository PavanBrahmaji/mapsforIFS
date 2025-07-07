import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import type { FeatureCollection, Feature } from 'geojson';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page6',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './page6.component.html',
  styleUrl: './page6.component.css'
})
export class Page6Component implements OnInit, AfterViewInit, OnChanges {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef;
  @ViewChild('adjustmentCanvas', { static: false }) adjustmentCanvas!: ElementRef<HTMLCanvasElement>;

  private _imageInput!: ElementRef;
  @ViewChild('imageInput', { static: false })
  set imageInput(el: ElementRef) {
    if (el) {
      this._imageInput = el;
    }
  }
  get imageInput(): ElementRef {
    return this._imageInput;
  }

  @Input() lat: number = 39.8283;
  @Input() lon: number = -98.5795;

  @Output() drawingsChanged = new EventEmitter<any>();

  map!: L.Map;
  drawnItems!: L.FeatureGroup;
  public drawingsGeoJson: any = null;
  private boundaryPolygonLayer?: L.Polygon;
  private boundaryWarning?: HTMLElement;

  public imageOverlay?: L.ImageOverlay;

  public showBoundaryModel: boolean = false;
  public boundaryModelContent: string = '';
  public previewImageUrl: string | ArrayBuffer | null | undefined = null;

  private originalImageFile: File | null = null;
  private imageLoadedForAdjustment: HTMLImageElement | null = null;

  private canvasCtx!: CanvasRenderingContext2D;
  public tempImageRotationAngle: number = 0;
  public tempImageScale: number = 1;
  public tempImageOffsetX: number = 0;
  public tempImageOffsetY: number = 0;

  private isDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  private readonly CANVAS_WIDTH = 400;
  private readonly CANVAS_HEIGHT = 300;

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    this.initializeMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && (changes['lat'] || changes['lon'])) {
      this.map.setView([this.lat, this.lon], 14, { animate: true });
    }
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      attributionControl: false,
    }).setView([this.lat, this.lon], 4);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {}).addTo(this.map);

    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    this.loadPolygonBoundariesFromLocalStorage();
  }

  private showBoundaryWarning(message: string): void {
    if (this.boundaryWarning) this.boundaryWarning.remove();
    this.boundaryWarning = L.DomUtil.create('div', 'boundary-warning');
    this.boundaryWarning.innerHTML = `<div style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: #ff4444; color: white; padding: 8px 16px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); z-index: 1000; font-size: 14px; animation: fadeIn 0.3s;">${message}</div>`;
    this.map.getContainer().appendChild(this.boundaryWarning);
    setTimeout(() => {
      if (this.boundaryWarning) {
        this.boundaryWarning.style.transition = 'opacity 0.5s';
        this.boundaryWarning.style.opacity = '0';
        setTimeout(() => this.boundaryWarning?.remove(), 500);
      }
    }, 3000);
  }

  private getSiteData = (): any => JSON.parse(localStorage.getItem('siteData') || '{}');
  private setSiteData = (data: any): void => localStorage.setItem('siteData', JSON.stringify(data));

  public triggerFileInput(): void {
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.click();
    } else {
      console.error('fileInput element not found.');
      this.showBoundaryWarning('Error: Could not trigger file upload.');
    }
  }

  public triggerImageInput(): void {
    if (this._imageInput && this._imageInput.nativeElement) {
      this._imageInput.nativeElement.click();
    } else {
      console.error('imageInput element not found or not ready.');
      this.showBoundaryWarning('Error: Image input not available.');
    }
  }

  public onBoundaryFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geoJson = JSON.parse(e.target?.result as string) as FeatureCollection;
        let siteData = this.getSiteData();
        siteData.globalVar = geoJson;
        this.setSiteData(siteData);
        this.renderBoundaries(geoJson);
        this.loadOverlayFromLocalStorage();
      } catch (error) {
        this.showBoundaryWarning('Invalid GeoJSON file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  public onImageFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    if (!this.boundaryPolygonLayer) {
        this.showBoundaryWarning('Please load a boundary file first.');
        event.target.value = '';
        return;
    }

    this.originalImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        let siteData = this.getSiteData();
        siteData.originalImageUrl = imageUrl;
        this.setSiteData(siteData);

        this.previewImageUrl = imageUrl;
        this.imageLoadedForAdjustment = new Image();
        this.imageLoadedForAdjustment.onload = () => {
            this.tempImageRotationAngle = 0;
            this.tempImageScale = 1;
            this.tempImageOffsetX = 0;
            this.tempImageOffsetY = 0;
            this.setupImageAdjustmentCanvas();
        };
        this.imageLoadedForAdjustment.src = imageUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  private setupImageAdjustmentCanvas(): void {
    if (!this.adjustmentCanvas || !this.imageLoadedForAdjustment) {
      setTimeout(() => this.setupImageAdjustmentCanvas(), 50);
      return;
    }

    const canvas = this.adjustmentCanvas.nativeElement;
    this.canvasCtx = canvas.getContext('2d')!;
    canvas.width = this.CANVAS_WIDTH;
    canvas.height = this.CANVAS_HEIGHT;

    if (this.tempImageScale === 1 && this.tempImageOffsetX === 0 && this.tempImageOffsetY === 0) {
      const imgAspect = this.imageLoadedForAdjustment.width / this.imageLoadedForAdjustment.height;
      const canvasAspect = this.CANVAS_WIDTH / this.CANVAS_HEIGHT;
      if (imgAspect > canvasAspect) {
        this.tempImageScale = this.CANVAS_WIDTH / this.imageLoadedForAdjustment.width;
      } else {
        this.tempImageScale = this.CANVAS_HEIGHT / this.imageLoadedForAdjustment.height;
      }
      this.tempImageOffsetX = (this.CANVAS_WIDTH - this.imageLoadedForAdjustment.width * this.tempImageScale) / 2;
      this.tempImageOffsetY = (this.CANVAS_HEIGHT - this.imageLoadedForAdjustment.height * this.tempImageScale) / 2;
    }

    this.drawAdjustmentCanvas();
  }

  public drawAdjustmentCanvas(): void {
    if (!this.canvasCtx || !this.imageLoadedForAdjustment || !this.boundaryPolygonLayer) return;

    const ctx = this.canvasCtx;
    const canvas = this.adjustmentCanvas.nativeElement;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(this.tempImageRotationAngle * Math.PI / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    ctx.drawImage(
      this.imageLoadedForAdjustment,
      this.tempImageOffsetX,
      this.tempImageOffsetY,
      this.imageLoadedForAdjustment.width * this.tempImageScale,
      this.imageLoadedForAdjustment.height * this.tempImageScale
    );
    ctx.restore();

    const polygonLatLngs = this.boundaryPolygonLayer.getLatLngs()[0] as L.LatLng[];
    if (polygonLatLngs && polygonLatLngs.length > 0) {
      const mapBounds = this.boundaryPolygonLayer.getBounds();
      const mapWest = mapBounds.getWest();
      const mapEast = mapBounds.getEast();
      const mapNorth = mapBounds.getNorth();
      const mapSouth = mapBounds.getSouth();
      ctx.beginPath();
      polygonLatLngs.forEach((latlng, index) => {
        const normalizedX = (latlng.lng - mapWest) / (mapEast - mapWest);
        const normalizedY = (mapNorth - latlng.lat) / (mapNorth - mapSouth);
        const pixelX = normalizedX * canvas.width;
        const pixelY = normalizedY * canvas.height;
        if (index === 0) ctx.moveTo(pixelX, pixelY);
        else ctx.lineTo(pixelX, pixelY);
      });
      ctx.closePath();
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  handleCanvasMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.adjustmentCanvas.nativeElement.style.cursor = 'grabbing';
    }
  }

  handleCanvasMouseMove(e: MouseEvent): void {
    if (this.isDragging) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.tempImageOffsetX += dx;
      this.tempImageOffsetY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.drawAdjustmentCanvas();
    }
  }

  handleCanvasMouseUp(e: MouseEvent): void {
    this.isDragging = false;
    this.adjustmentCanvas.nativeElement.style.cursor = 'grab';
  }

  handleCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    const scaleAmount = 1.1;
    const rect = this.adjustmentCanvas.nativeElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const newScale = e.deltaY < 0 ? this.tempImageScale * scaleAmount : this.tempImageScale / scaleAmount;
    this.tempImageOffsetX = mouseX - ((mouseX - this.tempImageOffsetX) * (newScale / this.tempImageScale));
    this.tempImageOffsetY = mouseY - ((mouseY - this.tempImageOffsetY) * (newScale / this.tempImageScale));
    this.tempImageScale = Math.max(0.1, Math.min(10, newScale));
    this.drawAdjustmentCanvas();
  }

  public async saveAdjustedImageOverlay(): Promise<void> {
    const siteData = this.getSiteData();
    const imageToClipSrc = siteData.originalImageUrl;

    if (!imageToClipSrc || !this.boundaryPolygonLayer) {
      this.showBoundaryWarning('No image or boundary loaded for adjustment.');
      return;
    }

    try {
      this.showBoundaryWarning('Processing image...');
      const imageElement = await this.loadImage(imageToClipSrc);

      const clippedImageUrl = await this.clipImageToPolygon(
        imageElement,
        this.boundaryPolygonLayer,
        this.tempImageScale,
        this.tempImageOffsetX,
        this.tempImageOffsetY,
        this.tempImageRotationAngle
      );

      const bounds = this.boundaryPolygonLayer!.getBounds();
      if (this.imageOverlay) this.removeImage();
      this.imageOverlay = L.imageOverlay(clippedImageUrl, bounds, { opacity: 0.7, interactive: true }).addTo(this.map);
      this.imageOverlay.on('click', () => {
        this.openBoundaryModel();
      });

      let updatedSiteData = this.getSiteData();
      updatedSiteData.imageOverlayUrl = clippedImageUrl;
      updatedSiteData.imageRotationAngle = this.tempImageRotationAngle;
      updatedSiteData.imageScale = this.tempImageScale;
      updatedSiteData.imageOffsetX = this.tempImageOffsetX;
      updatedSiteData.imageOffsetY = this.tempImageOffsetY;
      this.setSiteData(updatedSiteData);

      this.closeBoundaryModel();
      this.showBoundaryWarning('Image successfully uploaded and clipped.');
    } catch (error) {
      console.error('Error clipping or saving image:', error);
      this.showBoundaryWarning('Failed to clip or save image.');
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
      return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
      });
  }

  private clipImageToPolygon(
    originalImageElement: HTMLImageElement,
    polygonLayer: L.Polygon,
    imageScale: number,
    imageOffsetX: number,
    imageOffsetY: number,
    imageRotationAngle: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
        const finalClipCanvas = document.createElement('canvas');
        const finalClipCtx = finalClipCanvas.getContext('2d');
        if (!finalClipCtx) {
            return reject('Could not get 2D canvas context for final clipping.');
        }

        const polygonBounds = polygonLayer.getBounds();
        const mapWidthDegrees = polygonBounds.getEast() - polygonBounds.getWest();
        const mapHeightDegrees = polygonBounds.getNorth() - polygonBounds.getSouth();
        const aspectRatio = mapWidthDegrees / mapHeightDegrees;

        finalClipCanvas.width = 1024;
        finalClipCanvas.height = Math.round(finalClipCanvas.width / aspectRatio);

        finalClipCtx.save();
        const polygonLatLngs = polygonLayer.getLatLngs()[0] as L.LatLng[];
        if (!polygonLatLngs || polygonLatLngs.length === 0) {
            finalClipCtx.restore();
            return reject('Polygon has no valid coordinates for clipping.');
        }

        finalClipCtx.beginPath();
        polygonLatLngs.forEach((latlng, index) => {
            const normalizedX = (latlng.lng - polygonBounds.getWest()) / mapWidthDegrees;
            const normalizedY = (polygonBounds.getNorth() - latlng.lat) / mapHeightDegrees;
            const pixelX = normalizedX * finalClipCanvas.width;
            const pixelY = normalizedY * finalClipCanvas.height;
            if (index === 0) finalClipCtx.moveTo(pixelX, pixelY);
            else finalClipCtx.lineTo(pixelX, pixelY);
        });
        finalClipCtx.closePath();
        finalClipCtx.clip();

        const scaleFromModalToFinal = finalClipCanvas.width / this.CANVAS_WIDTH;
        finalClipCtx.translate(finalClipCanvas.width / 2, finalClipCanvas.height / 2);
        finalClipCtx.rotate(imageRotationAngle * Math.PI / 180);
        finalClipCtx.translate(-finalClipCanvas.width / 2, -finalClipCanvas.height / 2);

        finalClipCtx.drawImage(
            originalImageElement,
            imageOffsetX * scaleFromModalToFinal,
            imageOffsetY * scaleFromModalToFinal,
            originalImageElement.width * imageScale * scaleFromModalToFinal,
            originalImageElement.height * imageScale * scaleFromModalToFinal
        );

        finalClipCtx.restore();
        resolve(finalClipCanvas.toDataURL('image/png'));
    });
  }

  public renderBoundaries(geoJson: FeatureCollection): void {
    this.drawnItems.clearLayers();
    this.boundaryPolygonLayer = undefined;
    this.removeImage();

    const polygonFeatures = (geoJson.features || []).filter(
      f => f.geometry?.type === 'Polygon'
    );
    if (polygonFeatures.length === 0) {
      this.showBoundaryWarning('No polygon features found in the file.');
      return;
    }

    const featureCollection: FeatureCollection = {
      type: "FeatureCollection",
      features: polygonFeatures as Feature[]
    };

    const geoJsonLayer = L.geoJSON(featureCollection, {
      style: () => ({ color: '#CC00EC', opacity: 0.8, fillColor: '#CC00EC', fillOpacity: 0.07, dashArray: '12, 12' })
    });

    geoJsonLayer.eachLayer((layer: any) => {
      this.drawnItems.addLayer(layer);
      if (!this.boundaryPolygonLayer && layer instanceof L.Polygon) {
        this.boundaryPolygonLayer = layer;
        this.boundaryPolygonLayer.on('click', () => {
          this.openBoundaryModel();
        });
      }
    });

    if (geoJsonLayer.getLayers().length > 0) this.map.fitBounds(geoJsonLayer.getBounds());
    this.drawingsChanged.emit(this.drawnItems.toGeoJSON());
  }

  public loadPolygonBoundariesFromLocalStorage(): void {
    const siteData = this.getSiteData();
    if (siteData.globalVar) {
      this.renderBoundaries(siteData.globalVar);
      this.loadOverlayFromLocalStorage();
    }
  }

  public loadOverlayFromLocalStorage(): void {
    const siteData = this.getSiteData();
    if (siteData.imageOverlayUrl && this.boundaryPolygonLayer) {
      if (this.imageOverlay) this.imageOverlay.remove();
      const bounds = this.boundaryPolygonLayer.getBounds();
      this.imageOverlay = L.imageOverlay(siteData.imageOverlayUrl, bounds, { opacity: 0.7, interactive: true }).addTo(this.map);
      this.imageOverlay.on('click', () => {
        this.openBoundaryModel();
      });
    }
  }

  public removeImage(): void {
    if (this.imageOverlay) {
      this.imageOverlay.off('click');
      this.imageOverlay.remove();
      this.imageOverlay = undefined;
      let siteData = this.getSiteData();
      delete siteData.imageOverlayUrl;
      delete siteData.imageRotationAngle;
      delete siteData.imageScale;
      delete siteData.imageOffsetX;
      delete siteData.imageOffsetY;
      delete siteData.originalImageUrl;
      this.setSiteData(siteData);
    }
    this.previewImageUrl = null;
    this.originalImageFile = null;
    this.imageLoadedForAdjustment = null;
    this.tempImageRotationAngle = 0;
    this.tempImageScale = 1;
    this.tempImageOffsetX = 0;
    this.tempImageOffsetY = 0;
  }

  public openBoundaryModel(): void {
    const siteData = this.getSiteData();
    if (siteData.imageOverlayUrl) {
      this.boundaryModelContent = 'Image overlay is currently active for this boundary.';
      this.previewImageUrl = null;
    } else {
      this.boundaryModelContent = 'No image overlay. Click "Upload Image" to add one.';
      this.previewImageUrl = null;
    }
    this.showBoundaryModel = true;
  }

  public closeBoundaryModel(): void {
    this.showBoundaryModel = false;
    this.previewImageUrl = null;
    this.originalImageFile = null;
    this.imageLoadedForAdjustment = null;
    this.isDragging = false;
    if (this._imageInput && this._imageInput.nativeElement) {
      this._imageInput.nativeElement.value = '';
    }
  }

  public async editExistingImageOverlay(): Promise<void> {
    const siteData = this.getSiteData();
    if (siteData.originalImageUrl && this.boundaryPolygonLayer) {
        try {
            this.boundaryModelContent = 'Adjust existing image overlay.';
            this.previewImageUrl = siteData.originalImageUrl;
            this.imageLoadedForAdjustment = await this.loadImage(siteData.originalImageUrl);

            this.tempImageRotationAngle = siteData.imageRotationAngle || 0;
            this.tempImageScale = siteData.imageScale || 1;
            this.tempImageOffsetX = siteData.imageOffsetX || 0;
            this.tempImageOffsetY = siteData.imageOffsetY || 0;

            this.setupImageAdjustmentCanvas();
        } catch (error) {
            this.showBoundaryWarning('Could not load original image for editing.');
            console.error(error);
        }
    } else {
        this.showBoundaryWarning('No original image found to edit.');
        this.closeBoundaryModel();
    }
  }
}