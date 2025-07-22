import { Component, ViewChild, ElementRef, Input, OnInit, AfterViewInit, Renderer2, ChangeDetectorRef, inject } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet-draw';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';

// Custom type declaration for the Leaflet.ImageOverlay.Rotated plugin
declare module 'leaflet' {
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


// Data Interfaces
interface FloorImageData {
  fileName: string;
  url: string;
  scale: number;
  rotation: number;
  opacity: number;
  aspectRatio: number;
  center?: { lat: number; lng: number };
}

interface FloorData {
  floorId: string;
  image: FloorImageData | null;
}

interface BuildingData {
  name: string;
  floors: FloorData[];
}

@Component({
  selector: 'app-interactive-image-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './page7.component.html',
  styleUrls: ['./page7.component.css']
})
export class Page7Component implements OnInit, AfterViewInit {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  @ViewChild('floorImageInput', { static: false }) floorImageInput!: ElementRef;

  @Input() lat: number = 20.5937;
  @Input() lon: number = 78.9629;

  map!: L.Map;
  imageOverlay?: L.ImageOverlay.Rotated; // Correctly typed for the plugin

  // State Management
  public currentBuilding: BuildingData = { name: '', floors: [] };
  public selectedFloorId: string = '';

  // Image Properties for the selected floor
  public imageScale: number = 1;
  public imageRotation: number = 0;
  public imageOpacity: number = 0.8;
  public imageCenter: L.LatLng | null = null;

  public isEditMode: boolean = true;
  public showControlsModal: boolean = false;
  private serverUrl = 'http://localhost:3000';
  private pluginReady!: Promise<void>;

  private renderer = inject(Renderer2);
  private cdr = inject(ChangeDetectorRef);
  private apiService = inject(ApiService);

  ngOnInit(): void {
    this.pluginReady = this.loadScript('https://unpkg.com/leaflet-imageoverlay-rotated@0.1.4/Leaflet.ImageOverlay.Rotated.js');
  }

  async ngAfterViewInit(): Promise<void> {
    await this.pluginReady;
    this.initializeMap();
    this.loadConfiguration('Default Building');
  }

  private initializeMap(): void {
    this.map = L.map(this.mapContainer.nativeElement,{attributionControl: false}).setView([this.lat, this.lon], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
  }

  onBuildingNameChange(): void {
    this.loadConfiguration(this.currentBuilding.name);
  }

  addNewFloor(): void {
    const newFloorId = prompt('Enter the new floor number or name:');
    if (!newFloorId || newFloorId.trim() === '') return;
    if (this.currentBuilding.floors.some(f => f.floorId === newFloorId)) {
      alert('This floor already exists.');
      return;
    }
    this.currentBuilding.floors.push({ floorId: newFloorId, image: null });
    this.currentBuilding.floors.sort((a, b) => a.floorId.localeCompare(b.floorId, undefined, { numeric: true }));
    this.selectedFloorId = newFloorId;
    alert(`Floor '${newFloorId}' added. Please select the floor plan image.`);
    this.floorImageInput.nativeElement.click();
  }

  selectFloor(floorId: string): void {
    this.selectedFloorId = floorId;
    const floor = this.currentBuilding.floors.find(f => f.floorId === floorId);

    this.removeImage();
    if (floor?.image) {
      this.displayImage(floor.image);
    } else {
      const upload = confirm(`No image found for floor '${floorId}'. Would you like to upload one now?`);
      if (upload) {
        this.floorImageInput.nativeElement.click();
      }
    }
  }

  onNewFloorImageSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;

    const { name: buildingName } = this.currentBuilding;
    const floorId = this.selectedFloorId;
    if (!buildingName || !floorId) {
      alert("Cannot upload: Building and Floor must be selected.");
      return;
    }

    this.apiService.uploadFloorImages(buildingName, floorId, [file]).subscribe({
      next: (response) => {
        const imageUrl = response.urls[0];
        const newImageData: FloorImageData = {
          url: `${this.serverUrl}${imageUrl}`,
          fileName: imageUrl.split('/').pop() || '',
          scale: 1,
          rotation: 0,
          opacity: 0.8,
          aspectRatio: 1,
        };
        const currentFloor = this.currentBuilding.floors.find(f => f.floorId === floorId);
        if (currentFloor) {
          currentFloor.image = newImageData;
          this.displayImage(newImageData);
        }
      },
      error: (err) => console.error("Upload failed", err)
    });
  }

  private displayImage(imageData: FloorImageData): void {
    this.removeImage();
    this.imageScale = imageData.scale;
    this.imageRotation = imageData.rotation;
    this.imageOpacity = imageData.opacity;
    this.imageCenter = imageData.center ? L.latLng(imageData.center.lat, imageData.center.lng) : this.map.getCenter();

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      imageData.aspectRatio = img.naturalWidth / img.naturalHeight;
      this.createImageOverlay(img, imageData);
    };
    img.src = imageData.url;
  }

  private createImageOverlay(img: HTMLImageElement, imageData: FloorImageData): void {
    const { topleft, topright, bottomleft } = this.calculateImageCorners(imageData);

    // ✨ FIX: Use L.imageOverlay.rotated to match the declared type ✨
    this.imageOverlay = L.imageOverlay.rotated(img, topleft, topright, bottomleft, {
      opacity: this.imageOpacity,
      interactive: true,
    });

    this.imageOverlay.addTo(this.map);
  }

  private calculateImageCorners(imageData: FloorImageData): { topleft: L.LatLng, topright: L.LatLng, bottomleft: L.LatLng } {
    const center = this.imageCenter!;
    const scale = this.imageScale;
    const aspectRatio = imageData.aspectRatio;
    const rotation = this.imageRotation * (Math.PI / 180); // to radians

    // Convert map distance to degrees (simplified)
    const metersPerDegree = 111320 * Math.cos(center.lat * Math.PI / 180);
    const widthInMeters = 10000 * scale; // Example width in meters
    const heightInMeters = widthInMeters / aspectRatio;

    const halfWidthDegrees = (widthInMeters / metersPerDegree) / 2;
    const halfHeightDegrees = (heightInMeters / metersPerDegree) / 2;

    const tl = L.latLng(center.lat + halfHeightDegrees, center.lng - halfWidthDegrees);
    const tr = L.latLng(center.lat + halfHeightDegrees, center.lng + halfWidthDegrees);
    const bl = L.latLng(center.lat - halfHeightDegrees, center.lng - halfWidthDegrees);

    const rotate = (p: L.LatLng) => {
      const dx = p.lng - center.lng;
      const dy = p.lat - center.lat;
      const newLng = center.lng + (dx * Math.cos(rotation) - dy * Math.sin(rotation));
      const newLat = center.lat + (dx * Math.sin(rotation) + dy * Math.cos(rotation));
      return L.latLng(newLat, newLng);
    };

    return { topleft: rotate(tl), topright: rotate(tr), bottomleft: rotate(bl) };
  }

  saveConfiguration(): void {
    const floor = this.currentBuilding.floors.find(f => f.floorId === this.selectedFloorId);
    if (floor?.image) {
      floor.image.scale = this.imageScale;
      floor.image.rotation = this.imageRotation;
      floor.image.opacity = this.imageOpacity;
      floor.image.center = this.imageCenter ? { lat: this.imageCenter.lat, lng: this.imageCenter.lng } : undefined;
    }
    const key = `building-${this.currentBuilding.name}`;
    localStorage.setItem(key, JSON.stringify(this.currentBuilding));
    alert(`Configuration for '${this.currentBuilding.name}' saved!`);
    this.isEditMode = false;
  }

  loadConfiguration(buildingName: string): void {
    this.removeImage();
    const key = `building-${buildingName}`;
    const savedData = localStorage.getItem(key);
    this.currentBuilding = savedData ? JSON.parse(savedData) : { name: buildingName, floors: [] };
    if (this.currentBuilding.floors.length > 0) {
      this.selectFloor(this.currentBuilding.floors[0].floorId);
    } else {
      this.selectedFloorId = '';
    }
  }

  public removeImage(): void {
    if (this.imageOverlay) {
      this.imageOverlay.remove();
      this.imageOverlay = undefined;
    }
    const floor = this.currentBuilding.floors.find(f => f.floorId === this.selectedFloorId);
    if (floor) floor.image = null;
  }

  public enableEditing(): void { this.isEditMode = true; }
  public toggleControlsModal(): void { this.showControlsModal = !this.showControlsModal; }
  public closeControlsModal(): void { this.showControlsModal = false; }
  public onScaleChange(): void { this.updateImageTransform(); }
  public onRotationChange(): void { this.updateImageTransform(); }
  public onOpacityChange(): void { if (this.imageOverlay) this.imageOverlay.setOpacity(this.imageOpacity); }

  private updateImageTransform(): void {
    const floor = this.currentBuilding.floors.find(f => f.floorId === this.selectedFloorId);
    if (!this.imageOverlay || !floor || !floor.image) return;
    const { topleft, topright, bottomleft } = this.calculateImageCorners(floor.image);
    // No 'as any' needed now, TypeScript knows the type is correct.
    this.imageOverlay.reposition(topleft, topright, bottomleft);
  }

  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${url}"]`)) {
        return resolve();
      }
      const script = this.renderer.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = (e: any) => reject(e);
      this.renderer.appendChild(document.head, script);
    });
  }
}