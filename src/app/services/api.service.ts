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
   * Uploads an image file to the backend.
   * @param file The image file to upload.
   * @returns An observable with the server's response.
   */
  uploadImage(file: File): Observable<{ message: string, url: string }> {
    const formData = new FormData();
    // The key 'image' must match the field name in the backend: upload.single('image')
    formData.append('image', file, file.name);

    return this.http.post<{ message: string, url: string }>(`${this.apiUrl}/upload`, formData);
  }
}