import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, DestroyRef, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import 'leaflet-draw';
import { GlobalService } from '../../../global.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'; // For automatic unsubscription
import { FlyAnimationService } from '../../../services/fly-animation.service';

// Use a red marker icon for all markers
const iconRed = L.icon({
  iconUrl: 'images/site_marker.svg',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28]
});

L.Marker.prototype.options.icon = iconRed;

declare module 'leaflet-geosearch' {
  interface GeoSearchControl {
    new (options: any): any;
  }
}

@Component({
  selector: 'app-leaflet-maps',
  standalone: true, // Mark as standalone
  imports: [CommonModule],
  templateUrl: './leaflet-maps.component.html',
  styleUrl: './leaflet-maps.component.css'
})
export class LeafletMapsComponent implements OnInit, AfterViewInit, OnChanges {

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  @Input() lat: number = 39.8283;
  @Input() lon: number = -98.5795;

  map!: L.Map;
  marker!: L.Marker;
  dbMarkers: L.Marker[] = [];
  markers: any[] = [];
  drawnItems!: L.FeatureGroup;
  private drawControl?: L.Control.Draw;
  private originalMarkerPosition?: L.LatLng;
  private destroyRef = inject(DestroyRef); // Inject DestroyRef

  constructor(
    private globalService: GlobalService,
    private flyAnimationService: FlyAnimationService // Inject the service
  ) {}

  ngOnInit(): void {
    // No need to set site here, always use this.globalService.site
  }

  ngAfterViewInit(): void {
    this.initializeMap();
    this.flyAnimationService.setMap(this.map); // Set the map instance in the service
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && (changes['lat'] || changes['lon'])) {
      // Use enhanced fly animation when coordinates change
      this.flyAnimationService.flyToLocation([this.lat, this.lon], {
        mapContainerRef: this.mapContainer.nativeElement
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        console.log('Fly to location animation completed from ngOnChanges!');
      });
    }
    console.log('this.globalService.site', this.globalService.site);
  }

  private initializeMap(): void {
    // Initialize map centered on the United States with zoom level 4
    this.map = L.map(this.mapContainer.nativeElement, {
      zoomControl: false,
      preferCanvas: true // Better performance for animations
    }).setView([this.lat, this.lon], 4);

    // Add zoom control to the bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Use only OpenStreetMap as the base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    // Initialize drawing
    this.initializeDrawing();

    // Add loading animation class to map container
    this.mapContainer.nativeElement.classList.add('map-loading');

    // Remove loading class after map is ready
    this.map.whenReady(() => {
      setTimeout(() => {
        this.mapContainer.nativeElement.classList.remove('map-loading');
        this.mapContainer.nativeElement.classList.add('map-ready');
      }, 500);
    });
  }

  // Delegate to the service for fly animation to a location
  public flyToLocationWithAnimation(latlng: L.LatLngExpression, options?: {
    duration?: number;
    targetZoom?: number;
    easeLinearity?: number;
    showLoadingIndicator?: boolean;
  }): void {
    this.flyAnimationService.flyToLocation(latlng, {
      ...options,
      mapContainerRef: this.mapContainer.nativeElement
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      console.log('Fly to location animation completed!');
    });
  }

  // Original fly method (now also delegates to the enhanced version)
  public flyToLocation(latlng: L.LatLngExpression): void {
    this.flyToLocationWithAnimation(latlng);
  }

  // Smooth zoom with animation (kept as is, as it's not directly related to 'fly' behavior)
  public smoothZoomTo(targetZoom: number, duration: number = 1000): void {
    const currentZoom = this.map.getZoom();
    const zoomDiff = targetZoom - currentZoom;
    const steps = Math.abs(zoomDiff) * 10; // More steps for smoother animation
    const stepSize = zoomDiff / steps;
    const stepDuration = duration / steps;

    let currentStep = 0;
    let animationFrame: number; // Local variable

    const animate = () => {
      if (currentStep < steps) {
        const newZoom = currentZoom + (stepSize * currentStep);
        this.map.setZoom(newZoom);
        currentStep++;
        animationFrame = requestAnimationFrame(() => {
          setTimeout(animate, stepDuration);
        });
      } else {
        cancelAnimationFrame(animationFrame); // Cleanup on completion
      }
    };

    animate();
  }

  // Delegate to the service for fly animation to bounds
  public flyToBounds(bounds: L.LatLngBounds, options?: L.FitBoundsOptions): void {
    this.flyAnimationService.flyToBounds(bounds, {
      ...options,
      mapContainerRef: this.mapContainer.nativeElement
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      console.log('Fly to bounds animation completed!');
    });
  }

  // No longer needed here, moved to service
  // private showFlyIndicator(): void { /* ... */ }
  // private hideFlyIndicator(): void { /* ... */ }
  // private cleanupAnimations(): void { /* ... */ }

  ngOnDestroy(): void {
    // takeUntilDestroyed handles subscription cleanup for Observables from the service
    // No manual cleanup of animationFrame needed if `smoothZoomTo` is not called frequently or managed outside.
    // However, if `smoothZoomTo` is critical and long-running, you might need a separate DestroyRef or a way to cancel its loop.
  }

  private initializeDrawing(): void {
    this.drawnItems = new L.FeatureGroup();
    this.map.addLayer(this.drawnItems);

    // Restore drawings from globalService only (no localStorage)
    if (this.globalService.globalVar) {
      try {
        const geoJsonLayer = L.geoJSON(this.globalService.globalVar, {
          style: (feature) => ({
            color: '#CC00EC',
            opacity: 0.8,
            fillColor: '#CC00EC',
            fillOpacity: 0.07,
            dashArray: '6, 6'
          })
        });
        geoJsonLayer.eachLayer((layer: any) => {
          this.drawnItems.addLayer(layer);
        });
      } catch (e) {
        console.error('Failed to load saved drawings:', e);
      }
    }

    const createDrawControl = (enableMarker: boolean, enableEdit: boolean) => {
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
      }
      const polygonExists = this.drawnItems.getLayers().some(l => l instanceof L.Polygon);
      const markerExists = this.drawnItems.getLayers().some(l => l instanceof L.Marker);

      this.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          circle: false,
          circlemarker: false,
          marker: enableMarker ? { icon: iconRed } : false,
          polygon: (!markerExists || polygonExists) ? false : {
            shapeOptions: {
              color: '#CC00EC',
              opacity: 0.8,
              fillColor: '#CC00EC',
              fillOpacity: 0.07
            }
          },
          polyline: false,
          rectangle: false
        },
        edit: {
          featureGroup: this.drawnItems,
          remove: false,
          edit: enableEdit ? {} : false
        }
      });
      this.map.addControl(this.drawControl);
    };

    const hasMarker = () => this.drawnItems.getLayers().some(l => l instanceof L.Marker);
    const hasPolygon = () => this.drawnItems.getLayers().some(l => l instanceof L.Polygon);

    createDrawControl(!hasMarker(), false);

    const enableOtherTools = () => {
      const enableEdit = hasMarker() && hasPolygon();
      if (this.drawControl) {
        this.map.removeControl(this.drawControl);
      }
      const polygonExists = this.drawnItems.getLayers().some(l => l instanceof L.Polygon);
      const markerExists = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
      this.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          circle: false,
          circlemarker: false,
          marker: false,
          polygon: (!markerExists || polygonExists) ? false : {
            shapeOptions: {
              color: '#CC00EC',
              opacity: 0.8,
              fillColor: '#CC00EC',
              fillOpacity: 0.07
            }
          },
          polyline: false,
          rectangle: false
        },
        edit: {
          featureGroup: this.drawnItems,
          remove: false,
          edit: enableEdit ? {} : false
        }
      });
      this.map.addControl(this.drawControl);
    };

    const saveDrawingsInApp = () => {
      const geoJson = this.drawnItems.toGeoJSON();
      this.globalService.globalVar = geoJson;
    };

    this.map.on(L.Draw.Event.CREATED, (e: any) => {
      const type = e.layerType;
      const layer = e.layer;

      if (type === 'marker') {
        const polygonLayer = this.drawnItems.getLayers().find(l => l instanceof L.Polygon) as L.Polygon | undefined;
        if (polygonLayer) {
          const markerLatLng = layer.getLatLng();
          if (!leafletPointInPolygon(markerLatLng, polygonLayer)) {
            alert('Marker must be placed inside the boundary.');
            return;
          }
        }

        this.drawnItems.addLayer(layer);

        // Fly to the new marker with animation using the service
        this.flyAnimationService.flyToLocation(layer.getLatLng(), {
          duration: 1500,
          targetZoom: 17,
          showLoadingIndicator: false,
          mapContainerRef: this.mapContainer.nativeElement
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
          console.log('Marker fly animation completed!');
        });

        const tooltipHtml = `
          <div style="
            display: flex;
            align-items: center;
            background: #BD3EF4;
            color: #fff;
            border-radius: 4px 4px 4px 0;
            padding: 4px 16px;
            font-weight: bold;
            font-size: 14px;
            line-height: 100%;
            letter-spacing: -0.05px;
            height: 32px;
            ">
            <img src="images/site_icon.svg" alt="Site Icon" style="width:24px;height:24px;margin-right:8px;vertical-align:middle;">
            <span style="color:#fff;">${this.site || 'Site'}</span>
          </div>
        `;
        layer.bindTooltip(tooltipHtml, {
         permanent: true,
        direction: 'top',
        offset: [40, -6],
        sticky: false,
        className: 'custom-tooltip',
        interactive: false
        }).openTooltip();
        enableOtherTools();
      } else if (type === 'polygon' || type === 'rectangle') {
        const markerLayer = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
        if (markerLayer) {
          const markerLatLng = markerLayer.getLatLng();
          const tempPolygon = layer as L.Polygon;
          if (leafletPointInPolygon(markerLatLng, tempPolygon)) {
            layer.setStyle?.({
              color: '#CC00EC',
              opacity: 0.8,
              fillColor: '#CC00EC',
              fillOpacity: 0.07,
              dashArray: '12, 12'
            });
            this.drawnItems.addLayer(layer);

            // Fly to fit the polygon bounds using the service
            this.flyAnimationService.flyToBounds(layer.getBounds(), {
              mapContainerRef: this.mapContainer.nativeElement
            }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
              console.log('Fly to bounds animation completed!');
            });

            enableOtherTools();
          } else {
            alert('Marker must be inside the boundary. Please draw the boundary around the marker.');
          }
        } else {
          alert('Please add a marker before drawing a boundary.');
        }
      } else {
        this.drawnItems.addLayer(layer);
      }

      saveDrawingsInApp();
    });

    this.map.on(L.Draw.Event.DELETED, () => {
      const enableEdit = hasMarker() && hasPolygon();
      createDrawControl(!hasMarker(), enableEdit);
      saveDrawingsInApp();
    });

    this.map.on(L.Draw.Event.EDITED, (e: any) => {
      const layers = e.layers;
      let isValid = true;

      layers.eachLayer((layer: any) => {
        if (layer instanceof L.Marker) {
          const markerLatLng = layer.getLatLng();
          const polygonLayer = this.drawnItems.getLayers().find(l => l instanceof L.Polygon) as L.Polygon | undefined;

          if (polygonLayer && !leafletPointInPolygon(markerLatLng, polygonLayer)) {
            isValid = false;
            const originalMarker = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker;
            if (originalMarker && this.originalMarkerPosition) {
              layer.setLatLng(this.originalMarkerPosition);
            }
            alert('Marker cannot be moved outside the boundary.');
          }
        }
      });

      if (isValid) {
        saveDrawingsInApp();
        const hasMarker = this.drawnItems.getLayers().some(l => l instanceof L.Marker);
        const hasPolygon = this.drawnItems.getLayers().some(l => l instanceof L.Polygon);
        if (!hasMarker && hasPolygon) {
          createDrawControl(true, true);
        }
      }
    });

    this.map.on(L.Draw.Event.EDITSTART, () => {
      const markerLayer = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
      const polygonLayer = this.drawnItems.getLayers().find(l => l instanceof L.Polygon) as L.Polygon | undefined;

      if (markerLayer && polygonLayer) {
        const proceed = confirm(
          'Warning: If you edit the boundary, the marker will be removed. You will need to add a new marker inside the boundary after saving. Continue?'
        );
        if (!proceed) {
          this.map.fire('draw:editstop');
          return;
        } else {
          this.drawnItems.removeLayer(markerLayer);
        }
      }

      const markerAfterRemoval = this.drawnItems.getLayers().find(l => l instanceof L.Marker) as L.Marker | undefined;
      if (markerAfterRemoval) {
        this.originalMarkerPosition = markerAfterRemoval.getLatLng();
      }
    });
  }

  public resetDrawings(): void {
    this.drawnItems.clearLayers();
    this.globalService.globalVar = null;
  }

  public saveDrawings(): void {
    if (this.drawnItems) {
      const geoJson = this.drawnItems.toGeoJSON();
      this.globalService.globalVar = geoJson;
    }
  }

  public storeDrawingsInApp(): void {
    if (this.drawnItems) {
      this.globalService.globalVar = this.drawnItems.toGeoJSON();
    }
  }

  get site(): string {
    return this.globalService.site;
  }
}

function leafletPointInPolygon(latlng: L.LatLng, polygon: L.Polygon): boolean {
  const poly = polygon.getLatLngs()[0] as L.LatLng[];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng;
    const xj = poly[j].lat, yj = poly[j].lng;
    const intersect = ((yi > latlng.lng) !== (yj > latlng.lng)) &&
      (latlng.lat < (xj - xi) * (latlng.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}