import { Component, ViewChild, ElementRef, Input, OnInit, AfterViewInit, Renderer2, ChangeDetectorRef } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import type { FeatureCollection, Feature } from 'geojson';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Type declaration for the Leaflet.ImageOverlay.Rotated plugin
declare global {
    namespace L {
        namespace ImageOverlay {
            interface Rotated extends L.ImageOverlay {
                reposition(topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng): void;
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

    @Input() lat: number = 20.5937; // Centered on India
    @Input() lon: number = 78.9629;

    map!: L.Map;
    drawnItems!: L.FeatureGroup;
    private boundaryPolygonLayer?: L.Polygon;
    public imageOverlay?: L.ImageOverlay.Rotated;

    // Image state
    public imageScale: number = 1;
    public imageRotation: number = 0;
    private imageCenter: L.LatLng | null = null;
    private originalImageUrl: string = '';
    private imageAspectRatio: number = 1;

    constructor(private renderer: Renderer2, private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.loadScript('https://unpkg.com/leaflet-imageoverlay-rotated@0.1.4/Leaflet.ImageOverlay.Rotated.js')
            .catch(err => console.error("Could not load Leaflet.ImageOverlay.Rotated plugin", err));
    }

    ngAfterViewInit(): void {
        this.initializeMap();
        this.loadStateFromLocalStorage();
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
                polygon: { allowIntersection: false, shapeOptions: { color: '#CC00EC' } },
                polyline: false, rectangle: false, circle: false, marker: false, circlemarker: false,
            },
            edit: { featureGroup: this.drawnItems, remove: true },
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
                this.saveStateToLocalStorage();
            }
        });

        // **MODIFIED**: This handler now keeps the image static during boundary edits.
        this.map.on(L.Draw.Event.EDITED, (e: any) => {
            const layers = e.layers;
            layers.eachLayer((layer: any) => {
                if (layer instanceof L.Polygon) {
                    // Update the component's reference to the edited layer
                    this.boundaryPolygonLayer = layer;
                }
            });
            
            // Simply save the state. The image properties are not changed,
            // so the image will remain static on the map.
            this.saveStateToLocalStorage();
        });

        this.map.on(L.Draw.Event.DELETED, () => {
            this.boundaryPolygonLayer = undefined;
            this.removeImage();
            this.saveStateToLocalStorage();
        });
    }

    private setupBoundaryInteraction(layer: L.Polygon): void {
        layer.on('click', () => {
            if (!this.imageOverlay) {
                this.imageInput.nativeElement.click();
            }
        });
        
        const element = layer.getElement();
        if (element) {
            (element as HTMLElement).style.cursor = 'pointer';
        }
    }

    public onImageFileSelected(event: any): void {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.originalImageUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                this.imageAspectRatio = img.naturalWidth / img.naturalHeight;
                this.createImageOverlay();
                this.saveStateToLocalStorage();
            };
            img.src = this.originalImageUrl;
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    }

    private createImageOverlay(): void {
        if (!this.boundaryPolygonLayer || !this.originalImageUrl) return;
        if (this.imageOverlay) this.imageOverlay.remove();
        
        this.imageCenter = this.boundaryPolygonLayer.getBounds().getCenter();
        const corners = this.calculateImageCorners();

        this.imageOverlay = L.imageOverlay.rotated(
            this.originalImageUrl,
            corners.topleft,
            corners.topright,
            corners.bottomleft,
            { opacity: 0.8, interactive: true }
        ).addTo(this.map);
        
        const element = this.boundaryPolygonLayer.getElement();
        if (element) {
            (element as HTMLElement).style.cursor = 'default';
        }
    }

    private calculateImageCorners(): { topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng } {
        if (!this.imageCenter || !this.boundaryPolygonLayer) throw new Error("Missing data for calculation");

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
            const dx = point.lng - this.imageCenter!.lng;
            const dy = point.lat - this.imageCenter!.lat;
            const newLng = this.imageCenter!.lng + (dx * Math.cos(angleRad) - dy * Math.sin(angleRad));
            const newLat = this.imageCenter!.lat + (dx * Math.sin(angleRad) + dy * Math.cos(angleRad));
            return L.latLng(newLat, newLng);
        };
        
        if (this.imageRotation !== 0) {
            return { topleft: rotatePoint(topleft), topright: rotatePoint(topright), bottomleft: rotatePoint(bottomleft) };
        }

        return { topleft, topright, bottomleft };
    }
    
    public updateImageTransform(): void {
        if (!this.imageOverlay) return;
        const corners = this.calculateImageCorners();
        this.imageOverlay.reposition(corners.topleft, corners.topright, corners.bottomleft);
        this.saveStateToLocalStorage();
    }
    
    public removeImage(): void {
        if (this.imageOverlay) {
            this.imageOverlay.remove();
            this.imageOverlay = undefined;
        }
        this.originalImageUrl = '';
        this.imageScale = 1;
        this.imageRotation = 0;
        
        if (this.boundaryPolygonLayer) {
            const element = this.boundaryPolygonLayer.getElement();
            if (element) {
                (element as HTMLElement).style.cursor = 'pointer';
            }
        }
        
        this.saveStateToLocalStorage();
    }
    
    private saveStateToLocalStorage(): void {
        const state = {
            boundary: this.boundaryPolygonLayer ? this.drawnItems.toGeoJSON() : null,
            imageUrl: this.originalImageUrl,
            imageScale: this.imageScale,
            imageRotation: this.imageRotation,
            imageAspectRatio: this.imageAspectRatio
        };
        localStorage.setItem('mapImageState', JSON.stringify(state));
    }

    private loadStateFromLocalStorage(): void {
        const stateString = localStorage.getItem('mapImageState');
        if (!stateString) return;
        
        const state = JSON.parse(stateString);

        if (state.boundary) {
            const geoJsonLayer = L.geoJSON(state.boundary);
            geoJsonLayer.eachLayer((layer: any) => {
                if (layer instanceof L.Polygon) {
                    this.drawnItems.addLayer(layer);
                    this.boundaryPolygonLayer = layer;
                    this.setupBoundaryInteraction(layer);
                    this.map.fitBounds(layer.getBounds());
                }
            });
        }

        if (state.imageUrl && this.boundaryPolygonLayer) {
            this.originalImageUrl = state.imageUrl;
            this.imageScale = state.imageScale || 1;
            this.imageRotation = state.imageRotation || 0;
            this.imageAspectRatio = state.imageAspectRatio || 1;
            this.createImageOverlay();
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