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
    selector: 'app-page-9',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './page9.component.html',
    styleUrls: ['./page9.component.css']
})
export class Page9Component implements OnInit, AfterViewInit {
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

    private boundaryStyle = {
        color: '#0000FF',
        weight: 3,
        opacity: 0.8,
        fillColor: '#0000FF',
        fillOpacity: 0.07,
        dashArray: '12, 12'
    };

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
    public extracting: boolean = false;

    // Dragging and Resizing state
    private isDragging: boolean = false;
    private dragStartLatLng: L.LatLng | null = null;
    private dragStartCenter: L.LatLng | null = null;
    private dragMoveHandler?: (e: L.LeafletMouseEvent) => void;
    private dragEndHandler?: () => void;

    private resizeHandles: HTMLElement[] = [];
    private isResizing: boolean = false;
    private resizeStartCorner: string = '';
    private resizeStartScale: number = 1;
    private resizeStartMousePos: { x: number, y: number } = { x: 0, y: 0 };
    private resizeMoveHandler?: (e: MouseEvent) => void;
    private resizeEndHandler?: (e?: MouseEvent) => void;

    // Rotation state
    private isRotating: boolean = false;
    private rotationStartAngle: number = 0;
    private rotationStartRotation: number = 0;
    private rotationMoveHandler?: (e: MouseEvent) => void;
    private rotationEndHandler?: (e?: MouseEvent) => void;

    private renderer = inject(Renderer2);
    private cdr = inject(ChangeDetectorRef);
    private apiService = inject(ApiService);

    private clippingTimeout: any;
    private transformTimeout: any;
    private isImageLoading: boolean = false;
    private pendingClipUpdate: boolean = false;

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

    private smoothRemoveImage(): void {
        if (this.imageOverlay) {
            // Fade out effect
            const imageElement = this.imageOverlay.getElement();
            if (imageElement) {
                imageElement.style.transition = 'opacity 0.3s ease-out';
                imageElement.style.opacity = '0';

                setTimeout(() => {
                    if (this.imageOverlay) {
                        this.imageOverlay.remove();
                        this.imageOverlay = undefined;
                    }
                }, 300);
            } else {
                this.imageOverlay.remove();
                this.imageOverlay = undefined;
            }
        }
    }

    private waitForImageLoad(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.imageOverlay) {
                resolve();
                return;
            }

            const imageElement = this.imageOverlay.getElement();
            if (!imageElement) {
                setTimeout(() => resolve(), 100);
                return;
            }

            if (imageElement.complete) {
                resolve();
            } else {
                imageElement.onload = () => resolve();
                imageElement.onerror = () => resolve();
                // Fallback timeout
                setTimeout(() => resolve(), 1000);
            }
        });
    }

    private scheduleClippingUpdate(delay: number = 50): void {
        if (this.clippingTimeout) {
            clearTimeout(this.clippingTimeout);
        }

        this.pendingClipUpdate = true;

        this.clippingTimeout = setTimeout(() => {
            if (this.pendingClipUpdate && !this.isEditMode && this.imageOverlay) {
                this.applyClipping();
                this.pendingClipUpdate = false;
            }
            this.clippingTimeout = null;
        }, delay);
    }
    private validateAndCorrectImagePosition(): void {
        if (
            !this.imageCenter ||
            !this.boundaryPolygonLayer ||
            this.activeImageType === 'none' ||
            !this.siteData.imageConfigs?.[this.activeImageType]
        ) {
            return;
        }

        const bounds = this.boundaryPolygonLayer.getBounds();
        const center = bounds.getCenter();

        // Check if current position is valid
        if (!this.isImageCenterWithinBounds(this.imageCenter)) {
            console.log('Image outside bounds, correcting position...');

            // Smoothly move image to boundary center
            this.imageCenter = center;

            // Update config
            const config = this.siteData.imageConfigs[this.activeImageType]!;
            config.center = { lat: center.lat, lng: center.lng };

            // Apply smooth transition
            this.smoothUpdateImageTransform();
        }
    }

    // 6. ENHANCED: Smooth image transform updates
    private smoothUpdateImageTransform(): void {
        if (this.transformTimeout) {
            clearTimeout(this.transformTimeout);
        }

        this.transformTimeout = setTimeout(() => {
            this.updateImageTransform();
            this.scheduleClippingUpdate(50);
        }, 16); // ~60fps
    }


    private smoothLoadImage(): void {
        this.isImageLoading = true;

        if (this.imageOverlay) {
            this.updateImageOverlay();
        } else {
            this.createImageOverlay();
        }

        // Wait for image to load, then apply styling and clipping
        this.waitForImageLoad().then(() => {
            this.isImageLoading = false;

            // Ensure image is within bounds before applying effects
            this.validateAndCorrectImagePosition();

            // Apply styling with smooth transition
            this.applyImageBorderStyling();

            // Apply clipping with delay for smooth rendering
            this.scheduleClippingUpdate(200);
        });
    }

    // 8. Enhanced switchImageType with proper clipping
    public switchImageType(): void {
        if (this.lastActiveImageType === this.activeImageType) return;

        // Clear any pending operations
        if (this.clippingTimeout) {
            clearTimeout(this.clippingTimeout);
            this.clippingTimeout = null;
        }

        // Save current config before switching
        if (this.isEditMode && this.lastActiveImageType !== 'none') {
            this.saveCurrentConfig();
        }

        this.loadConfigForType(this.activeImageType);

        if (this.activeImageType === 'none') {
            this.smoothRemoveImage();
        } else {
            this.smoothLoadImage();
        }

        this.lastActiveImageType = this.activeImageType;
    }

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
                    this.activeImageType = type;
                    this.switchImageType();
                    setTimeout(() => {
                        this.applyImageBorderStyling();
                    }, 200);
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
        if (type === 'none') {
            this.imageScale = 1;
            this.imageRotation = 0;
            this.imageOpacity = 0.8;
            this.imageCenter = null;
            return;
        }
        if (!this.siteData.imageConfigs?.[type]) {
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
        if (this.activeImageType === 'none') return;
        if (!this.imageOverlay || !this.siteData.imageConfigs?.[this.activeImageType]) return;
        const config = this.siteData.imageConfigs[this.activeImageType]!;
        const url = `${this.serverUrl}/images/${config.fileName}`;
        const corners = this.calculateImageCorners(config);
        this.imageOverlay.setUrl(url);
        this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);
        this.imageOverlay.setOpacity(config.opacity);

        setTimeout(() => {
            this.applyImageBorderStyling();
        }, 100);
    }

    private createImageOverlay(): void {
        if (this.activeImageType === 'none') return;
        if (!this.siteData.imageConfigs?.[this.activeImageType]) return;

        const config = this.siteData.imageConfigs[this.activeImageType]!;
        const imageUrl = `${this.serverUrl}/images/${config.fileName}`;

        // Remove existing overlay smoothly
        if (this.imageOverlay) {
            this.smoothRemoveImage();
        }

        // Set loading state
        this.isImageLoading = true;

        // Validate and correct image center
        this.imageCenter = L.latLng(config.center.lat, config.center.lng);
        if (!this.isImageCenterWithinBounds(this.imageCenter) && this.boundaryPolygonLayer) {
            this.imageCenter = this.boundaryPolygonLayer.getBounds().getCenter();
            config.center = { lat: this.imageCenter.lat, lng: this.imageCenter.lng };
        }

        const corners = this.calculateImageCorners(config);

        // Create overlay with fade-in effect
        this.imageOverlay = L.imageOverlay.rotated(
            imageUrl,
            corners.topleft,
            corners.topright,
            corners.bottomleft,
            {
                opacity: 0, // Start invisible
                interactive: true,
                bubblingMouseEvents: false
            }
        ).addTo(this.map);

        // Smooth fade-in after creation
        setTimeout(() => {
            if (this.imageOverlay) {
                this.imageOverlay.setOpacity(config.opacity);
                this.isImageLoading = false;

                // Apply styling and clipping after fade-in
                this.applyImageBorderStyling();
                if (this.isEditMode) {
                    this.setupImageDrag();
                } else {
                    this.scheduleClippingUpdate(100);
                }
            }
        }, 100);
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

    // 5. Enhanced updateImageTransform with clipping refresh
    public updateImageTransform(): void {
        if (this.activeImageType === 'none') return;
        if (!this.imageOverlay || !this.siteData.imageConfigs?.[this.activeImageType]) return;

        const config = this.siteData.imageConfigs[this.activeImageType]!;
        config.scale = this.imageScale;
        config.rotation = this.imageRotation;

        if (this.imageCenter) {
            // Ensure image stays within bounds
            if (!this.isImageCenterWithinBounds(this.imageCenter) && this.boundaryPolygonLayer) {
                this.imageCenter = this.constrainToBounds(this.imageCenter);
            }

            config.center = { lat: this.imageCenter.lat, lng: this.imageCenter.lng };
        }

        const corners = this.calculateImageCorners(config);

        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(() => {
            if (this.imageOverlay) {
                this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);

                // Schedule clipping update for non-edit mode
                if (!this.isEditMode) {
                    this.scheduleClippingUpdate(16);
                }
            }
        });
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
            alert('Configuration saved successfully!');
        } catch (error) { console.error('Error saving configuration:', error); }
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
                    layer.setStyle(this.boundaryStyle);
                    this.drawnItems.addLayer(layer);
                    this.boundaryPolygonLayer = layer;
                    this.map.fitBounds(layer.getBounds());
                }
            }

            this.isEditMode = false;
            this.disableEditing();
            this.setupDrawControls();

            // Determine initial image type
            if (this.siteData.imageConfigs?.original) {
                this.activeImageType = 'original';
            } else if (this.siteData.imageConfigs?.annotated) {
                this.activeImageType = 'annotated';
            } else {
                this.activeImageType = 'none';
            }

            this.loadConfigForType(this.activeImageType);

            // Create image with smooth loading
            if (this.activeImageType !== 'none') {
                this.createImageOverlay();
            }

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
                    shapeOptions: this.boundaryStyle
                },
                polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false,
            },
            edit: this.boundaryPolygonLayer ? { featureGroup: this.drawnItems, remove: true } : undefined
        };
        this.drawControl = new L.Control.Draw(drawOptions);
        this.map.addControl(this.drawControl);
    }

    // 10. Enhanced map event setup with clipping refresh
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

                // Apply initial clipping if image exists
                if (this.imageOverlay && !this.isEditMode) {
                    this.scheduleClippingUpdate(200);
                }
            }
        });

        this.map.on(L.Draw.Event.EDITED, () => {
            if (this.boundaryPolygonLayer && this.imageOverlay) {
                // Validate image position after boundary edit
                this.validateAndCorrectImagePosition();

                // Update clipping
                if (!this.isEditMode) {
                    this.scheduleClippingUpdate(200);
                }
            }
        });

        this.map.on(L.Draw.Event.DELETED, () => {
            if (!this.isEditMode) return;
            this.boundaryPolygonLayer = undefined;
            this.siteData.imageConfigs = {};
            this.activeImageType = 'none';
            this.switchImageType();
            this.setupDrawControls();
        });

        // Optimized map move/zoom handlers
        let moveTimeout: any;
        this.map.on('movestart zoomstart', () => {
            if (moveTimeout) {
                clearTimeout(moveTimeout);
            }
        });

        this.map.on('moveend zoomend', () => {
            if (moveTimeout) {
                clearTimeout(moveTimeout);
            }

            moveTimeout = setTimeout(() => {
                if (!this.isEditMode && this.imageOverlay && this.boundaryPolygonLayer) {
                    this.scheduleClippingUpdate(100);
                }
            }, 100);
        });

        this.map.on('draw:editstart', () => {
            if (this.imageOverlay) {
                const imageElement = this.imageOverlay.getElement();
                if (imageElement) {
                    imageElement.style.clipPath = 'none';
                    imageElement.style.setProperty('-webkit-clip-path', 'none');
                }
            }
        });

        this.map.on('draw:editstop', () => {
            if (this.imageOverlay && !this.isEditMode) {
                this.validateAndCorrectImagePosition();
                this.scheduleClippingUpdate(200);
            }
        });
    }

    // 16. ENHANCED: Cleanup method for component destruction
    ngOnDestroy(): void {
        // Clear all timeouts
        if (this.clippingTimeout) {
            clearTimeout(this.clippingTimeout);
        }
        if (this.transformTimeout) {
            clearTimeout(this.transformTimeout);
        }

        // Clean up event listeners
        if (this.map) {
            this.map.off();
        }
    }

    private setupBoundaryInteraction(layer: L.Polygon): void {
        const element = layer.getElement();
        if (element) {
            (element as HTMLElement).style.cursor = this.isEditMode ? 'pointer' : 'default';
        }
    }

    // 1. Fixed setupImageDrag method with proper event handling
    private setupImageDrag(): void {
        if (!this.imageOverlay || !this.isEditMode) return;

        this.imageOverlay.off('mousedown');
        this.imageOverlay.on('mousedown', (e: L.LeafletMouseEvent) => {
            if (!this.isEditMode || this.isResizing || this.isRotating) return;

            // CRITICAL FIX: Check if click target is a handle
            const target = e.originalEvent.target as HTMLElement;
            if (target && (
                target.classList.contains('resize-handle') ||
                target.classList.contains('rotate-handle') ||
                target.closest('.resize-handle') ||
                target.closest('.rotate-handle')
            )) {
                return; // Don't start dragging if clicking on handles
            }

            // CRITICAL FIX: Prevent event from bubbling to map
            L.DomEvent.stopPropagation(e.originalEvent);
            L.DomEvent.preventDefault(e.originalEvent);

            this.isDragging = true;
            this.dragStartLatLng = e.latlng;
            this.dragStartCenter = this.imageCenter ? L.latLng(this.imageCenter.lat, this.imageCenter.lng) : null;

            // Create bound methods to avoid context issues
            this.dragMoveHandler = (moveEvent: L.LeafletMouseEvent) => {
                this.onImageDrag(moveEvent);
            };
            this.dragEndHandler = () => {
                this.onImageDragEnd();
            };

            // Disable map dragging and set cursor
            this.map.dragging.disable();
            this.map.getContainer().style.cursor = 'move';

            // Add event listeners
            this.map.on('mousemove', this.dragMoveHandler);
            this.map.on('mouseup', this.dragEndHandler);

            // IMPORTANT: Also listen for mouseleave to handle edge cases
            this.map.on('mouseleave', this.dragEndHandler);
        });
    }

    private constrainToBounds(center: L.LatLng): L.LatLng {
        if (!this.boundaryPolygonLayer) return center;

        const bounds = this.boundaryPolygonLayer.getBounds();
        const padding = 0.0005; // Smaller padding for smoother movement

        const constrainedLat = Math.max(
            bounds.getSouth() + padding,
            Math.min(bounds.getNorth() - padding, center.lat)
        );

        const constrainedLng = Math.max(
            bounds.getWest() + padding,
            Math.min(bounds.getEast() - padding, center.lng)
        );

        return L.latLng(constrainedLat, constrainedLng);
    }


    // 2. Enhanced onImageDrag with boundary validation
    private onImageDrag(e: L.LeafletMouseEvent): void {
        if (!this.isDragging || !this.dragStartLatLng || !this.dragStartCenter) return;

        const newLatLng = e.latlng;
        const latDelta = newLatLng.lat - this.dragStartLatLng.lat;
        const lngDelta = newLatLng.lng - this.dragStartLatLng.lng;

        const proposedCenter = L.latLng(
            this.dragStartCenter.lat + latDelta,
            this.dragStartCenter.lng + lngDelta
        );

        // Always update position for smooth dragging
        this.imageCenter = proposedCenter;

        // Apply boundary constraints
        if (!this.isImageCenterWithinBounds(proposedCenter) && this.boundaryPolygonLayer) {
            this.imageCenter = this.constrainToBounds(proposedCenter);
        }

        // Smooth transform update
        this.updateImageTransform();

        // Schedule clipping update during drag
        this.scheduleClippingUpdate(16);
    }

    // 4. Fixed onImageDragEnd with proper cleanup
    private onImageDragEnd(): void {
        if (!this.isDragging) return;

        this.isDragging = false;

        // Clean up event listeners
        if (this.dragMoveHandler) {
            this.map.off('mousemove', this.dragMoveHandler);
        }
        if (this.dragEndHandler) {
            this.map.off('mouseup', this.dragEndHandler);
            this.map.off('mouseleave', this.dragEndHandler);
        }

        // Re-enable map dragging and reset cursor
        this.map.dragging.enable();
        this.map.getContainer().style.cursor = '';

        // CRITICAL FIX: Force clipping reapplication after drag
        setTimeout(() => {
            if (!this.isEditMode) {
                this.applyClipping();
            } else {
                // In edit mode, ensure handles are visible
                this.applyImageBorderStyling();
            }
        }, 50);

        // Clear handler references
        this.dragMoveHandler = undefined;
        this.dragEndHandler = undefined;
    }

    // 3. New method to validate image center is within bounds
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

    private calculateInitialImageDimensions(aspectRatio: number): { width: number, height: number } {
        const DEFAULT_IMAGE_WIDTH_METERS = 500;
        return {
            width: DEFAULT_IMAGE_WIDTH_METERS,
            height: DEFAULT_IMAGE_WIDTH_METERS / aspectRatio
        };
    }

    public onScaleChange(): void { this.updateImageTransform(); }
    public onRotationChange(): void { this.updateImageTransform(); }
    public toggleControlsModal(): void { this.showControlsModal = !this.showControlsModal; }
    public closeControlsModal(): void { this.showControlsModal = false; }

    public enableEditing(): void {
        this.isEditMode = true;
        this.setupDrawControls();

        if (this.imageOverlay) {
            this.imageOverlay.options.interactive = true;
            this.removeClipping();
            this.map.off('move', this.applyClipping, this);
            this.setupImageDrag();
            this.applyImageBorderStyling();
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

        // Clean up any active interactions
        if (this.isResizing) {
            this.onResizeEnd();
        }
        if (this.isRotating) {
            this.onRotationEnd();
        }

        this.removeResizeHandles();

        if (this.imageOverlay) {
            this.imageOverlay.options.interactive = false;
            this.imageOverlay.off('mousedown');
            this.applyClipping();
            this.map.on('move', this.applyClipping, this);
            this.applyImageBorderStyling();
        }
    }

    private applyImageBorderStyling(): void {
        if (!this.imageOverlay) return;

        const imageElement = this.imageOverlay.getElement();
        if (imageElement) {
            this.removeResizeHandles();

            if (this.isEditMode) {
                this.renderer.setStyle(imageElement, 'border', '3px solid #FF0000');
                this.renderer.setStyle(imageElement, 'box-shadow', '0 0 10px rgba(255, 0, 0, 0.5)');
                this.renderer.setStyle(imageElement, 'position', 'relative');

                this.addResizeHandles(imageElement);
            } else {
                this.renderer.removeStyle(imageElement, 'border');
                this.renderer.removeStyle(imageElement, 'box-shadow');
                this.renderer.removeStyle(imageElement, 'position');
            }
        }
    }

    // 9. Enhanced addResizeHandles with better event isolation
    private addResizeHandles(imageElement: HTMLElement): void {
        const corners = ['nw', 'ne', 'sw', 'se'];

        corners.forEach(corner => {
            const handle = this.renderer.createElement('div');
            this.renderer.addClass(handle, 'resize-handle');
            this.renderer.addClass(handle, `resize-handle-${corner}`);

            // Set handle styles
            this.renderer.setStyle(handle, 'position', 'absolute');
            this.renderer.setStyle(handle, 'width', '12px');
            this.renderer.setStyle(handle, 'height', '12px');
            this.renderer.setStyle(handle, 'background-color', '#FF0000');
            this.renderer.setStyle(handle, 'border', '2px solid #FFFFFF');
            this.renderer.setStyle(handle, 'border-radius', '50%');
            this.renderer.setStyle(handle, 'cursor', this.getResizeCursor(corner));
            this.renderer.setStyle(handle, 'z-index', '1001');
            this.renderer.setStyle(handle, 'box-shadow', '0 2px 4px rgba(0,0,0,0.3)');
            this.renderer.setStyle(handle, 'pointer-events', 'auto');

            this.positionResizeHandle(handle, corner);

            // CRITICAL FIX: Proper event isolation for handles
            const mouseDownHandler = (e: MouseEvent) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();

                // Ensure we're not in drag mode
                this.isDragging = false;

                this.startResize(e, corner);
            };

            // CRITICAL FIX: Add all mouse events with capture
            handle.addEventListener('mousedown', mouseDownHandler, { capture: true, passive: false });
            handle.addEventListener('mousemove', (e: MouseEvent) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, { capture: true });
            handle.addEventListener('mouseup', (e: MouseEvent) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, { capture: true });
            handle.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, { capture: true });

            this.renderer.appendChild(imageElement, handle);
            this.resizeHandles.push(handle);
        });

        this.addRotationHandle(imageElement);
    }

    private addRotationHandle(imageElement: HTMLElement): void {
        const rotateHandle = this.renderer.createElement('div');
        this.renderer.addClass(rotateHandle, 'rotate-handle');

        this.renderer.setStyle(rotateHandle, 'position', 'absolute');
        this.renderer.setStyle(rotateHandle, 'width', '16px');
        this.renderer.setStyle(rotateHandle, 'height', '16px');
        this.renderer.setStyle(rotateHandle, 'background-color', '#00AA00');
        this.renderer.setStyle(rotateHandle, 'border', '2px solid #FFFFFF');
        this.renderer.setStyle(rotateHandle, 'border-radius', '50%');
        this.renderer.setStyle(rotateHandle, 'cursor', 'grab');
        this.renderer.setStyle(rotateHandle, 'z-index', '1002');
        this.renderer.setStyle(rotateHandle, 'box-shadow', '0 2px 4px rgba(0,0,0,0.3)');
        this.renderer.setStyle(rotateHandle, 'pointer-events', 'auto');
        this.renderer.setStyle(rotateHandle, 'display', 'flex');
        this.renderer.setStyle(rotateHandle, 'align-items', 'center');
        this.renderer.setStyle(rotateHandle, 'justify-content', 'center');
        this.renderer.setStyle(rotateHandle, 'font-size', '10px');
        this.renderer.setStyle(rotateHandle, 'color', 'white');
        this.renderer.setStyle(rotateHandle, 'font-weight', 'bold');

        rotateHandle.innerHTML = '↻';

        this.renderer.setStyle(rotateHandle, 'top', '-25px');
        this.renderer.setStyle(rotateHandle, 'left', '-8px');

        const mouseDownHandler = (e: MouseEvent) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();

            this.map.dragging.disable();
            this.map.touchZoom.disable();
            this.map.doubleClickZoom.disable();
            this.map.scrollWheelZoom.disable();
            this.map.boxZoom.disable();
            this.map.keyboard.disable();

            this.startRotation(e);
        };

        rotateHandle.addEventListener('mousedown', mouseDownHandler, { capture: true, passive: false });
        rotateHandle.addEventListener('mousemove', (e: MouseEvent) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, { capture: true });
        rotateHandle.addEventListener('mouseup', (e: MouseEvent) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        }, { capture: true });

        this.renderer.appendChild(imageElement, rotateHandle);
        this.resizeHandles.push(rotateHandle);
    }

    private positionResizeHandle(handle: HTMLElement, corner: string): void {
        switch (corner) {
            case 'nw':
                this.renderer.setStyle(handle, 'top', '-6px');
                this.renderer.setStyle(handle, 'left', '-6px');
                break;
            case 'ne':
                this.renderer.setStyle(handle, 'top', '-6px');
                this.renderer.setStyle(handle, 'right', '-6px');
                break;
            case 'sw':
                this.renderer.setStyle(handle, 'bottom', '-6px');
                this.renderer.setStyle(handle, 'left', '-6px');
                break;
            case 'se':
                this.renderer.setStyle(handle, 'bottom', '-6px');
                this.renderer.setStyle(handle, 'right', '-6px');
                break;
        }
    }

    private getResizeCursor(corner: string): string {
        switch (corner) {
            case 'nw': case 'se': return 'nwse-resize';
            case 'ne': case 'sw': return 'nesw-resize';
            default: return 'default';
        }
    }

    private removeResizeHandles(): void {
        this.resizeHandles.forEach(handle => {
            if (handle.parentNode) {
                this.renderer.removeChild(handle.parentNode, handle);
            }
        });
        this.resizeHandles = [];
    }

    private startResize(e: MouseEvent, corner: string): void {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        this.isResizing = true;
        this.resizeStartCorner = corner;
        this.resizeStartScale = this.imageScale;
        this.resizeStartMousePos = { x: e.clientX, y: e.clientY };

        this.map.dragging.disable(); this.map.touchZoom.disable(); this.map.doubleClickZoom.disable();
        this.map.scrollWheelZoom.disable(); this.map.boxZoom.disable(); this.map.keyboard.disable();

        const mapContainer = this.map.getContainer();
        mapContainer.style.pointerEvents = 'none';
        this.renderer.addClass(mapContainer, 'resizing');

        this.resizeMoveHandler = this.onResizeMove.bind(this);
        this.resizeEndHandler = this.onResizeEnd.bind(this);

        document.addEventListener('mousemove', this.resizeMoveHandler, { capture: true, passive: false });
        document.addEventListener('mouseup', this.resizeEndHandler, { capture: true, passive: false });

        this.renderer.setStyle(document.body, 'cursor', this.getResizeCursor(corner));
        this.renderer.setStyle(document.body, 'user-select', 'none');
        this.renderer.addClass(document.body, 'resizing');
    }

    private onResizeMove(e: MouseEvent): void {
        if (!this.isResizing) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        const deltaX = e.clientX - this.resizeStartMousePos.x;
        const deltaY = e.clientY - this.resizeStartMousePos.y;
        let scaleChange = 0;

        switch (this.resizeStartCorner) {
            case 'nw': scaleChange = (-deltaX - deltaY) / 200; break;
            case 'ne': scaleChange = (deltaX - deltaY) / 200; break;
            case 'sw': scaleChange = (-deltaX + deltaY) / 200; break;
            case 'se': scaleChange = (deltaX + deltaY) / 200; break;
        }

        const newScale = Math.max(0.1, Math.min(10, this.resizeStartScale + scaleChange));

        if (Math.abs(newScale - this.imageScale) > 0.01) {
            this.imageScale = newScale;
            this.updateImageTransform();
            this.cdr.detectChanges();
        }
    }

    private onResizeEnd(e?: MouseEvent): void {
        if (!this.isResizing) return;
        if (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

        this.isResizing = false;

        if (this.resizeMoveHandler) document.removeEventListener('mousemove', this.resizeMoveHandler, { capture: true } as any);
        if (this.resizeEndHandler) document.removeEventListener('mouseup', this.resizeEndHandler, { capture: true } as any);

        this.map.dragging.enable(); this.map.touchZoom.enable(); this.map.doubleClickZoom.enable();
        this.map.scrollWheelZoom.enable(); this.map.boxZoom.enable(); this.map.keyboard.enable();

        const mapContainer = this.map.getContainer();
        mapContainer.style.pointerEvents = 'auto';
        this.renderer.removeClass(mapContainer, 'resizing');

        this.renderer.removeStyle(document.body, 'cursor');
        this.renderer.removeStyle(document.body, 'user-select');
        this.renderer.removeClass(document.body, 'resizing');

        this.resizeMoveHandler = undefined; this.resizeEndHandler = undefined;
    }

    private startRotation(e: MouseEvent): void {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        this.isRotating = true;
        this.rotationStartRotation = this.imageRotation;
        const imageElement = this.imageOverlay?.getElement();
        if (!imageElement || !this.imageCenter) return;

        const imageRect = imageElement.getBoundingClientRect();
        const imageCenterScreen = { x: imageRect.left + imageRect.width / 2, y: imageRect.top + imageRect.height / 2 };

        this.rotationStartAngle = this.calculateAngle(imageCenterScreen.x, imageCenterScreen.y, e.clientX, e.clientY);

        this.map.dragging.disable(); this.map.touchZoom.disable(); this.map.doubleClickZoom.disable();
        this.map.scrollWheelZoom.disable(); this.map.boxZoom.disable(); this.map.keyboard.disable();

        const mapContainer = this.map.getContainer();
        mapContainer.style.pointerEvents = 'none';
        this.renderer.addClass(mapContainer, 'rotating');

        this.rotationMoveHandler = this.onRotationMove.bind(this);
        this.rotationEndHandler = this.onRotationEnd.bind(this);

        document.addEventListener('mousemove', this.rotationMoveHandler, { capture: true, passive: false });
        document.addEventListener('mouseup', this.rotationEndHandler, { capture: true, passive: false });

        this.renderer.setStyle(document.body, 'cursor', 'grabbing');
        this.renderer.setStyle(document.body, 'user-select', 'none');
        this.renderer.addClass(document.body, 'rotating');
    }

    private onRotationMove(e: MouseEvent): void {
        if (!this.isRotating || !this.imageCenter) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        const imageElement = this.imageOverlay?.getElement();
        if (!imageElement) return;

        const imageRect = imageElement.getBoundingClientRect();
        const imageCenterScreen = { x: imageRect.left + imageRect.width / 2, y: imageRect.top + imageRect.height / 2 };

        const currentAngle = this.calculateAngle(imageCenterScreen.x, imageCenterScreen.y, e.clientX, e.clientY);
        let angleDelta = currentAngle - this.rotationStartAngle;
        while (angleDelta > 180) angleDelta -= 360;
        while (angleDelta < -180) angleDelta += 360;

        let newRotation = this.rotationStartRotation + angleDelta;
        while (newRotation > 180) newRotation -= 360;
        while (newRotation < -180) newRotation += 360;

        if (Math.abs(newRotation - this.imageRotation) > 0.5) {
            this.imageRotation = Math.round(newRotation);
            this.updateImageTransform();
            this.cdr.detectChanges();
        }
    }

    private onRotationEnd(e?: MouseEvent): void {
        if (!this.isRotating) return;
        if (e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }

        this.isRotating = false;

        if (this.rotationMoveHandler) document.removeEventListener('mousemove', this.rotationMoveHandler, { capture: true } as any);
        if (this.rotationEndHandler) document.removeEventListener('mouseup', this.rotationEndHandler, { capture: true } as any);

        this.map.dragging.enable(); this.map.touchZoom.enable(); this.map.doubleClickZoom.enable();
        this.map.scrollWheelZoom.enable(); this.map.boxZoom.enable(); this.map.keyboard.enable();

        const mapContainer = this.map.getContainer();
        mapContainer.style.pointerEvents = 'auto';
        this.renderer.removeClass(mapContainer, 'rotating');

        this.renderer.removeStyle(document.body, 'cursor');
        this.renderer.removeStyle(document.body, 'user-select');
        this.renderer.removeClass(document.body, 'rotating');

        this.rotationMoveHandler = undefined; this.rotationEndHandler = undefined;
    }

    private calculateAngle(centerX: number, centerY: number, pointX: number, pointY: number): number {
        const deltaX = pointX - centerX;
        const deltaY = pointY - centerY;
        return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    }

    // 7. Enhanced getClipPathForPolygon with better calculation
    private getClipPathForPolygon(): string {
        if (!this.boundaryPolygonLayer || !this.imageOverlay) return 'none';

        try {
            const imageElement = this.imageOverlay.getElement();
            if (!imageElement) return 'none';

            // CRITICAL FIX: Get fresh bounds each time
            const imageBounds = imageElement.getBoundingClientRect();
            const mapContainer = this.map.getContainer().getBoundingClientRect();

            const latLngs = this.boundaryPolygonLayer.getLatLngs()[0] as L.LatLng[];

            const pixelPoints = latLngs.map(latLng => {
                const point = this.map.latLngToContainerPoint(latLng);

                // Calculate relative position to image
                const relativeX = (point.x + mapContainer.left) - imageBounds.left;
                const relativeY = (point.y + mapContainer.top) - imageBounds.top;

                return `${relativeX.toFixed(2)}px ${relativeY.toFixed(2)}px`;
            });

            return `polygon(${pixelPoints.join(', ')})`;
        } catch (error) {
            console.warn('Error calculating clip path:', error);
            return 'none';
        }
    }


    private calculateOptimizedClipPath(): string {
        if (!this.boundaryPolygonLayer || !this.imageOverlay) return 'none';

        try {
            const imageElement = this.imageOverlay.getElement();
            if (!imageElement) return 'none';

            const imageBounds = imageElement.getBoundingClientRect();
            const mapContainer = this.map.getContainer().getBoundingClientRect();

            // Use cached boundary points if available
            const latLngs = this.boundaryPolygonLayer.getLatLngs()[0] as L.LatLng[];

            const pixelPoints = latLngs.map(latLng => {
                const point = this.map.latLngToContainerPoint(latLng);

                // More precise calculation
                const relativeX = Math.round((point.x + mapContainer.left) - imageBounds.left);
                const relativeY = Math.round((point.y + mapContainer.top) - imageBounds.top);

                return `${relativeX}px ${relativeY}px`;
            });

            return `polygon(${pixelPoints.join(', ')})`;
        } catch (error) {
            return 'none';
        }
    }

    // 6. Enhanced applyClipping method with error handling
    private applyClipping(): void {
        if (!this.imageOverlay || !this.boundaryPolygonLayer || this.isEditMode || this.isImageLoading) {
            return;
        }

        try {
            const imageElement = this.imageOverlay.getElement();
            if (!imageElement) return;

            // Use requestAnimationFrame for smooth rendering
            requestAnimationFrame(() => {
                const clipPath = this.calculateOptimizedClipPath();

                if (clipPath && clipPath !== 'none') {
                    // Apply clipping with smooth transition
                    imageElement.style.transition = 'clip-path 0.1s ease-out';
                    imageElement.style.clipPath = clipPath;
                    imageElement.style.setProperty('-webkit-clip-path', clipPath);

                    // Force repaint for smooth rendering
                    imageElement.offsetHeight;
                }
            });
        } catch (error) {
            console.warn('Error applying clipping:', error);
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
            const bounds = this.boundaryPolygonLayer.getBounds();
            const originalImageOpacity = this.imageOverlay?.options.opacity;

            this.boundaryPolygonLayer.setStyle({ opacity: 0, fillOpacity: 0 });
            if (this.imageOverlay) {
                this.imageOverlay.setOpacity(0);
            }
            if (this.drawControl) {
                this.map.removeControl(this.drawControl);
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            const originalView = {
                center: this.map.getCenter(),
                zoom: this.map.getZoom()
            };
            this.map.fitBounds(bounds, { padding: [20, 20] });
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await this.captureMapWithinBoundary();

            this.map.setView(originalView.center, originalView.zoom);

            this.boundaryPolygonLayer.setStyle(this.boundaryStyle);

            if (this.imageOverlay && originalImageOpacity !== undefined) {
                this.imageOverlay.setOpacity(originalImageOpacity);
            }
            if (this.isEditMode) {
                this.setupDrawControls();
            }

            this.downloadCanvas(canvas, 'extracted-map-image.png');

        } catch (error) {
            console.error('Error extracting map image:', error);
            alert('Failed to extract map image. Please try again.');
        } finally {
            this.extracting = false;
        }
    }

    private async captureMapWithinBoundary(): Promise<HTMLCanvasElement> {
        const mapContainer = this.mapContainer.nativeElement;
        const polygonPoints = (this.boundaryPolygonLayer!.getLatLngs()[0] as L.LatLng[])
            .map(latLng => this.map.latLngToContainerPoint(latLng));

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        const minX = Math.min(...polygonPoints.map(p => p.x));
        const maxX = Math.max(...polygonPoints.map(p => p.x));
        const minY = Math.min(...polygonPoints.map(p => p.y));
        const maxY = Math.max(...polygonPoints.map(p => p.y));

        const width = maxX - minX;
        const height = maxY - minY;

        canvas.width = width;
        canvas.height = height;

        const html2canvas = await this.loadHtml2Canvas();

        try {
            const mapCanvas = await html2canvas(mapContainer, {
                useCORS: true, allowTaint: true, scale: 1,
                width: mapContainer.offsetWidth, height: mapContainer.offsetHeight,
                backgroundColor: null
            });

            ctx.save();
            ctx.beginPath();

            const adjustedPoints = polygonPoints.map(p => ({ x: p.x - minX, y: p.y - minY }));
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
            for (let i = 1; i < adjustedPoints.length; i++) {
                ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
            }
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(mapCanvas, minX, minY, width, height, 0, 0, width, height);
            ctx.restore();

            return canvas;

        } catch (error) {
            console.error('Error capturing map with html2canvas:', error);
            return this.createFallbackCanvas(width, height);
        }
    }

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

    public async extractMapImageAlternative(): Promise<void> {
        if (!this.boundaryPolygonLayer || this.extracting) {
            console.warn('No boundary polygon found or extraction already in progress');
            return;
        }

        this.extracting = true;

        try {
            const bounds = this.boundaryPolygonLayer.getBounds();

            const tempMapDiv = document.createElement('div');
            tempMapDiv.style.width = '800px';
            tempMapDiv.style.height = '600px';
            tempMapDiv.style.position = 'absolute';
            tempMapDiv.style.left = '-9999px';
            tempMapDiv.style.top = '-9999px';
            document.body.appendChild(tempMapDiv);

            const tempMap = L.map(tempMapDiv).fitBounds(bounds);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(tempMap);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const html2canvas = await this.loadHtml2Canvas();
            const canvas = await html2canvas(tempMapDiv, {
                useCORS: true,
                allowTaint: true,
                scale: 1
            });

            tempMap.remove();
            document.body.removeChild(tempMapDiv);
            this.downloadCanvas(canvas, 'extracted-map-tiles.png');

        } catch (error) {
            console.error('Error with alternative extraction:', error);
            alert('Failed to extract map image. Please try again.');
        } finally {
            this.extracting = false;
        }
    }
}