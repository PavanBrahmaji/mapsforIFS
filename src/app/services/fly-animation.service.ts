import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import * as L from 'leaflet';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class FlyAnimationService {
  private isFlying: boolean = false;
  private renderer: Renderer2;
  private mapInstance?: L.Map;
  private destroy$ = new Subject<void>(); // For cleanup

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);
  }

  /**
   * Initializes the service with the Leaflet map instance.
   * @param map The Leaflet map instance.
   */
  public setMap(map: L.Map): void {
    this.mapInstance = map;
  }

  /**
   * Performs a smooth fly animation to a specified geographical location.
   * @param latlng The target latitude and longitude.
   * @param options Animation options like duration, zoom, and indicator visibility.
   * @returns An Observable that completes when the animation finishes.
   */
  public flyToLocation(latlng: L.LatLngExpression, options?: {
    duration?: number;
    targetZoom?: number;
    easeLinearity?: number;
    showLoadingIndicator?: boolean;
    mapContainerRef?: HTMLElement; // Pass the map container ElementRef's nativeElement
  }): Observable<void> {
    if (!this.mapInstance) {
      console.error('FlyAnimationService: Map instance not set.');
      return new Subject<void>().asObservable();
    }
    if (this.isFlying) {
      return new Subject<void>().asObservable(); // Prevent multiple simultaneous animations
    }

    const defaultOptions = {
      duration: 2000, // 2 seconds
      targetZoom: 17,
      easeLinearity: 0.1,
      showLoadingIndicator: true,
      mapContainerRef: this.mapInstance.getContainer() // Default to map's container
    };

    const flyOptions = { ...defaultOptions, ...options };
    const mapContainer = flyOptions.mapContainerRef;

    this.isFlying = true;

    // Show loading indicator
    if (flyOptions.showLoadingIndicator && mapContainer) {
      this.showFlyIndicator(mapContainer);
    }

    // Add flying class for CSS animations
    if (mapContainer) {
      this.renderer.addClass(mapContainer, 'map-flying');
    }

    const animationCompleted = new Subject<void>();

    this.mapInstance.flyTo(latlng, flyOptions.targetZoom, {
      animate: true,
      duration: flyOptions.duration / 1000, // Convert to seconds
      easeLinearity: flyOptions.easeLinearity,
      noMoveStart: false
    });

    // Handle animation completion
    const onMoveEnd = () => {
      this.isFlying = false;
      if (mapContainer) {
        this.renderer.removeClass(mapContainer, 'map-flying');
      }
      if (flyOptions.showLoadingIndicator && mapContainer) {
        this.hideFlyIndicator(mapContainer);
      }
      this.mapInstance?.off('moveend', onMoveEnd);
      animationCompleted.next();
      animationCompleted.complete();
    };

    this.mapInstance.on('moveend', onMoveEnd);

    // Fallback timeout in case moveend doesn't fire
    setTimeout(() => {
      if (this.isFlying) {
        onMoveEnd();
      }
    }, flyOptions.duration + 500);

    return animationCompleted.asObservable().pipe(takeUntil(this.destroy$));
  }

  /**
   * Performs a smooth fly animation to fit a geographical bounds.
   * @param bounds The target bounds.
   * @param options Animation options.
   * @returns An Observable that completes when the animation finishes.
   */
  public flyToBounds(bounds: L.LatLngBounds, options?: L.FitBoundsOptions & {
    mapContainerRef?: HTMLElement;
  }): Observable<void> {
    if (!this.mapInstance) {
      console.error('FlyAnimationService: Map instance not set.');
      return new Subject<void>().asObservable();
    }
    if (this.isFlying) {
      return new Subject<void>().asObservable(); // Prevent multiple simultaneous animations
    }

    const defaultOptions = {
      animate: true,
      duration: 2,
      easeLinearity: 0.1,
      mapContainerRef: this.mapInstance.getContainer() // Default to map's container
    };
    const flyOptions = { ...defaultOptions, ...options };
    const mapContainer = flyOptions.mapContainerRef;

    this.isFlying = true;
    if (mapContainer) {
      this.renderer.addClass(mapContainer, 'map-flying');
    }

    const animationCompleted = new Subject<void>();

    this.mapInstance.flyToBounds(bounds, flyOptions);

    const onMoveEnd = () => {
      this.isFlying = false;
      if (mapContainer) {
        this.renderer.removeClass(mapContainer, 'map-flying');
      }
      this.mapInstance?.off('moveend', onMoveEnd);
      animationCompleted.next();
      animationCompleted.complete();
    };

    this.mapInstance.on('moveend', onMoveEnd);

    // Fallback timeout
    setTimeout(() => {
      if (this.isFlying) {
        onMoveEnd();
      }
    }, (flyOptions.duration || 2) * 1000 + 500); // Convert duration to ms

    return animationCompleted.asObservable().pipe(takeUntil(this.destroy$));
  }

  /**
   * Shows a visual indicator during the fly animation.
   * @param mapContainer The HTML element of the map container.
   */
  private showFlyIndicator(mapContainer: HTMLElement): void {
    const indicator = this.renderer.createElement('div');
    this.renderer.addClass(indicator, 'fly-indicator');
    this.renderer.setProperty(indicator, 'innerHTML', `
      <div class="fly-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
        </svg>
      </div>
      <span>Flying to location...</span>
    `);
    this.renderer.appendChild(mapContainer, indicator);
  }

  /**
   * Hides the visual indicator after the fly animation.
   * @param mapContainer The HTML element of the map container.
   */
  private hideFlyIndicator(mapContainer: HTMLElement): void {
    const indicator = mapContainer.querySelector('.fly-indicator');
    if (indicator) {
      this.renderer.addClass(indicator, 'fade-out');
      setTimeout(() => {
        this.renderer.removeChild(mapContainer, indicator);
      }, 300); // Match CSS fade-out duration
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}