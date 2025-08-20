import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MapLoaderService {
  private static promise: Promise<void> | null = null;
  private static readonly API_KEY = 'AIzaSyCq2LFbRj6zWu8KyIX20yz-B7Cc9pBDbpw'; // Move to environment
  
  public static async load(): Promise<void> {
    if (!this.promise) {
      this.promise = new Promise<void>((resolve, reject) => {
        // Check if Google Maps is already loaded
        if (typeof google !== 'undefined' && google.maps && google.maps.drawing) {
          resolve();
          return;
        }

        const callbackName = `__onGoogleMapsLoaded_${Date.now()}`;
        const script = document.createElement('script');
        
        script.async = true;
        script.defer = true;
        script.src = this.buildScriptUrl(callbackName);
        script.onerror = () => reject(new Error('Failed to load Google Maps script'));

        // Set global callback
        (window as any)[callbackName] = () => {
          delete (window as any)[callbackName];
          resolve();
        };

        document.head.appendChild(script);
      });
    }

    return this.promise;
  }

  private static buildScriptUrl(callback: string): string {
    const params = new URLSearchParams({
      key: this.API_KEY,
      libraries: 'geometry,drawing',
      callback,
      v: 'weekly'
    });

    return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
  }
}