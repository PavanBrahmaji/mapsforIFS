import { Component, ViewChild, ElementRef, Input, OnInit, AfterViewInit, Renderer2, ChangeDetectorRef, inject } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import type { FeatureCollection, Feature } from 'geojson';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

// Type declaration for the Leaflet.ImageOverlay.Rotated plugin
declare global {
    namespace L {
        namespace ImageOverlay {
            interface Rotated extends L.ImageOverlay {
                reposition(topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng): void;
                setOpacity(opacity: number): this;
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
}

interface SiteData {
    site: string;
    globalVar: FeatureCollection;
    selectedLocations: any[];
    imageData?: {
        imageFileName: string;
        imageScale: number;
        imageRotation: number;
        imageAspectRatio: number;
        imageCenter?: { lat: number; lng: number };
        imageOpacity?: number;
    };
}

@Component({
    selector: 'app-interactive-image-overlay',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './page6.component.html',
    styleUrls: ['./page6.component.css']
})
export class Page6Component implements OnInit, AfterViewInit {
    @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
    @ViewChild('imageInput', { static: false }) imageInput!: ElementRef;

    @Input() lat: number = 20.5937;
    @Input() lon: number = 78.9629;

    map!: L.Map;
    drawnItems!: L.FeatureGroup;
    public boundaryPolygonLayer?: L.Polygon;
    public imageOverlay?: L.ImageOverlay.Rotated;

    public imageScale: number = 1;
    public imageRotation: number = 0;
    public imageOpacity: number = 0.8;
    
    // Modal control
    public showControlsModal: boolean = false;

    public imageCenter: L.LatLng | null = null;
    private originalImageUrl: string = '';
    private imageAspectRatio: number = 1;
    private imageFileName: string = '';
    private serverUrl = 'http://localhost:3000';

    public isSaving: boolean = false;
    public saveMessage: string = '';
    public siteData: SiteData | null = null;
    
    private pluginReady!: Promise<void>;

    private isDragging: boolean = false;
    private dragStartLatLng: L.LatLng | null = null;
    private dragStartCenter: L.LatLng | null = null;

    private renderer = inject(Renderer2);
    private cdr = inject(ChangeDetectorRef);
    private apiService = inject(ApiService);

    ngOnInit(): void {
        this.pluginReady = this.loadScript('https://unpkg.com/leaflet-imageoverlay-rotated@0.1.4/Leaflet.ImageOverlay.Rotated.js');
        this.pluginReady.catch(err => console.error("Could not load Leaflet.ImageOverlay.Rotated plugin", err));
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

    private initializeMap(): void {
        this.map = L.map(this.mapContainer.nativeElement).setView([this.lat, this.lon], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);
        this.setupDrawControls();
        this.setupMapEvents();
    }

    private setupDrawControls(): void {
        const drawControl = new L.Control.Draw({
            position: 'topleft',
            draw: {
                polygon: false,
                polyline: false, 
                rectangle: false, 
                circle: false, 
                marker: false, 
                circlemarker: false,
            },
            edit: { featureGroup: this.drawnItems, remove: false },
        });
        this.map.addControl(drawControl);
    }

    private setupMapEvents(): void {
        this.map.on(L.Draw.Event.CREATED, (e: any) => {
            const layer = e.layer;
            if (layer instanceof L.Polygon) {
                this.drawnItems.clearLayers();
                this.drawnItems.addLayer(layer);
                this.boundaryPolygonLayer = layer;
                this.setupBoundaryInteraction(layer);
                this.autoSaveState();
            }
        });

        this.map.on(L.Draw.Event.EDITED, () => {
             this.autoSaveState();
        });

        this.map.on(L.Draw.Event.DELETED, () => {
            this.boundaryPolygonLayer = undefined;
            this.removeImage();
            this.autoSaveState();
        });
    }

    private setupBoundaryInteraction(layer: L.Polygon): void {
        layer.on('click', () => {
            if (!this.imageOverlay && this.imageInput?.nativeElement) {
                this.imageInput.nativeElement.click();
            }
        });
        const element = layer.getElement();
        if (element) {
            (element as HTMLElement).style.cursor = 'pointer';
        }
    }

    public onImageFileSelected(event: any): void {
        const file = event.target?.files?.[0];
        if (!file) return;

        this.apiService.uploadImage(file).subscribe({
            next: (response) => {
                this.originalImageUrl = `${this.serverUrl}${response.url}`;
                this.imageFileName = response.url.split('/').pop() || '';

                const img = new Image();
                img.onload = () => {
                    this.imageAspectRatio = img.naturalWidth / img.naturalHeight;
                    this.createImageOverlay();
                    this.autoSaveState();
                    // Show controls modal when image is loaded
                    this.showControlsModal = true;
                };
                img.onerror = () => console.error("Could not load the uploaded image.");
                img.src = this.originalImageUrl;
            },
            error: (err) => console.error('Upload failed', err)
        });

        if (event.target) event.target.value = '';
    }

    private createImageOverlay(): void {
        if (!this.boundaryPolygonLayer || !this.originalImageUrl) return;
        if (this.imageOverlay) this.imageOverlay.remove();

        this.imageCenter = this.imageCenter || this.boundaryPolygonLayer.getBounds().getCenter();
        const corners = this.calculateImageCorners();

        this.imageOverlay = L.imageOverlay.rotated(
            this.originalImageUrl,
            corners.topleft,
            corners.topright,
            corners.bottomleft,
            { opacity: this.imageOpacity, interactive: true }
        ).addTo(this.map);

        this.setupImageDrag();
    }

    private calculateImageCorners(): { topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng } {
        if (!this.imageCenter || !this.boundaryPolygonLayer) throw new Error("Missing data for corner calculation");

        const bounds = this.boundaryPolygonLayer.getBounds();
        const boundaryWidth = bounds.getEast() - bounds.getWest();
        const boundaryHeight = bounds.getNorth() - bounds.getSouth();
        const boundaryAspectRatio = boundaryWidth / boundaryHeight;

        let imageWidthDegrees, imageHeightDegrees;
        if (boundaryAspectRatio > this.imageAspectRatio) {
            imageHeightDegrees = boundaryHeight;
            imageWidthDegrees = imageHeightDegrees * this.imageAspectRatio;
        } else {
            imageWidthDegrees = boundaryWidth;
            imageHeightDegrees = imageWidthDegrees / this.imageAspectRatio;
        }

        imageWidthDegrees *= this.imageScale;
        imageHeightDegrees *= this.imageScale;

        const halfWidth = imageWidthDegrees / 2;
        const halfHeight = imageHeightDegrees / 2;

        const topleft = L.latLng(this.imageCenter.lat + halfHeight, this.imageCenter.lng - halfWidth);
        const topright = L.latLng(this.imageCenter.lat + halfHeight, this.imageCenter.lng + halfWidth);
        const bottomleft = L.latLng(this.imageCenter.lat - halfHeight, this.imageCenter.lng - halfWidth);

        const angleRad = this.imageRotation * (Math.PI / 180);
        const rotatePoint = (point: L.LatLng) => {
            if (!this.imageCenter) return point;
            const dx = point.lng - this.imageCenter.lng;
            const dy = point.lat - this.imageCenter.lat;
            const newLng = this.imageCenter.lng + (dx * Math.cos(angleRad) - dy * Math.sin(angleRad));
            const newLat = this.imageCenter.lat + (dx * Math.sin(angleRad) + dy * Math.cos(angleRad));
            return L.latLng(newLat, newLng);
        };
        
        return { topleft: rotatePoint(topleft), topright: rotatePoint(topright), bottomleft: rotatePoint(bottomleft) };
    }
    
    public updateImageTransform(): void {
        if (!this.imageOverlay || !this.imageCenter) return;
        const corners = this.calculateImageCorners();
        this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);
        // Auto-save after transform to persist image location
        this.autoSaveState();
    }
    
    public onOpacityChange(): void {
        if (this.imageOverlay) {
            this.imageOverlay.setOpacity(this.imageOpacity);
            this.autoSaveState();
        }
    }

    public onScaleChange(): void {
        this.updateImageTransform();
    }

    public onRotationChange(): void {
        this.updateImageTransform();
    }

    // Toggle controls modal
    public toggleControlsModal(): void {
        this.showControlsModal = !this.showControlsModal;
    }

    // Close modal
    public closeControlsModal(): void {
        this.showControlsModal = false;
    }

    private setupImageDrag(): void {
        if (!this.imageOverlay) return;
        this.imageOverlay.on('mousedown', (e: any) => {
            e.originalEvent.preventDefault();

            this.isDragging = true;
            this.dragStartLatLng = e.latlng;
            this.dragStartCenter = this.imageCenter ? L.latLng(this.imageCenter.lat, this.imageCenter.lng) : null;

            this.map.dragging.disable();
            this.map.getContainer().style.cursor = 'move';

            this.map.on('mousemove', this.onImageDrag, this);
            this.map.on('mouseup', this.onImageDragEnd, this);
        });
    }

    private onImageDrag(e: any): void {
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
        
        this.map.dragging.enable();
        this.map.getContainer().style.cursor = '';

        this.map.off('mousemove', this.onImageDrag, this);
        this.map.off('mouseup', this.onImageDragEnd, this);

        // Ensure final position is saved
        this.autoSaveState();
    }
    
    public removeImage(): void {
        if (this.imageOverlay) {
            this.imageOverlay.remove();
            this.imageOverlay = undefined;
        }
        this.originalImageUrl = '';
        this.imageFileName = '';
        this.imageCenter = null;
        this.showControlsModal = false;
        this.autoSaveState();
    }

    public autoSaveState(): void {
        try {
            const currentSiteData = this.getCurrentSiteData();
            localStorage.setItem('siteData', JSON.stringify(currentSiteData));
        } catch (error) {
            console.error('Error auto-saving state:', error);
        }
    }

    private getCurrentSiteData(): SiteData {
        const siteData: SiteData = {
            site: "international",
            globalVar: { type: "FeatureCollection", features: [] },
            selectedLocations: []
        };

        if (this.boundaryPolygonLayer) {
            siteData.globalVar.features.push(this.boundaryPolygonLayer.toGeoJSON() as Feature);
        }

        if (this.imageFileName && this.imageCenter) {
            siteData.imageData = {
                imageFileName: this.imageFileName,
                imageScale: this.imageScale,
                imageRotation: this.imageRotation,
                imageAspectRatio: this.imageAspectRatio,
                imageCenter: { lat: this.imageCenter.lat, lng: this.imageCenter.lng },
                imageOpacity: this.imageOpacity
            };
        }
        return siteData;
    }

    private loadStateFromLocalStorage(): void {
        const siteDataString = localStorage.getItem('siteData');
        if (!siteDataString) return;
        
        try {
            this.siteData = JSON.parse(siteDataString);
            
            if (this.siteData?.globalVar?.features) {
                const polygonFeature = this.siteData.globalVar.features.find(f => f.geometry?.type === 'Polygon');
                if (polygonFeature) {
                    const layer = L.geoJSON(polygonFeature).getLayers()[0] as L.Polygon;
                    this.drawnItems.addLayer(layer);
                    this.boundaryPolygonLayer = layer;
                    this.setupBoundaryInteraction(layer);
                    this.map.fitBounds(layer.getBounds());
                }
            }

            if (this.siteData?.imageData?.imageFileName) {
                const imageData = this.siteData.imageData;
                this.imageScale = imageData.imageScale;
                this.imageRotation = imageData.imageRotation;
                this.imageAspectRatio = imageData.imageAspectRatio;
                this.imageFileName = imageData.imageFileName;
                this.imageOpacity = typeof imageData.imageOpacity === 'number' ? imageData.imageOpacity : 0.8;

                if (imageData.imageCenter) {
                    this.imageCenter = L.latLng(imageData.imageCenter.lat, imageData.imageCenter.lng);
                }

                this.originalImageUrl = `${this.serverUrl}/images/${this.imageFileName}`;
                const img = new Image();
                img.onload = () => {
                    this.createImageOverlay();
                    this.cdr.detectChanges();
                };
                img.onerror = () => console.error(`Failed to reload image: ${this.originalImageUrl}`);
                img.src = this.originalImageUrl;
            }
        } catch (error) {
            console.error('Error loading state from localStorage:', error);
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
}