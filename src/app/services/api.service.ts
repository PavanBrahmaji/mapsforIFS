import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  // Point this to your running Express server
  private apiUrl = 'http://localhost:3000';

  /**
   * Uploads a single generic image file.
   * @param file The image file to upload.
   * @returns An observable with the server's response.
   */
  uploadImage(file: File): Observable<{ message: string, url: string }> {
    const formData = new FormData();
    // The key 'image' must match the field name in the backend: upload.single('image')
    formData.append('image', file, file.name);

    return this.http.post<{ message: string, url: string }>(`${this.apiUrl}/upload`, formData);
  }

  // --- ✨ NEW METHOD FOR FLOOR IMAGES ✨ ---
  /**
   * Uploads multiple image files for a specific building and floor.
   * @param building The name or ID of the building.
   * @param floor The floor number or identifier.
   * @param files An array of File objects to upload.
   * @returns An observable with the server's response, including an array of new image URLs.
   */
  uploadFloorImages(building: string, floor: string, files: File[]): Observable<{ message: string, urls: string[] }> {
    const formData = new FormData();

    // Append the text data (building and floor)
    formData.append('building', building);
    formData.append('floor', floor);

    // Append each file. The key 'floorImages' MUST match the name in your backend's
    // floorUpload.array('floorImages', 10) configuration.
    for (const file of files) {
      formData.append('floorImages', file, file.name);
    }

    // Post the complete FormData to the new endpoint
    return this.http.post<{ message: string, urls: string[] }>(`${this.apiUrl}/upload-floor-images`, formData);
  }
}