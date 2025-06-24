// global.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GlobalService {
  private _globalVar: any = null;
  private _site: string = ''; // Add site variable

  constructor() { }

  get globalVar(): any {
    return this._globalVar;
  }

  set globalVar(value: any) {
    this._globalVar = value;
  }

  // Getter and setter for site
  get site(): string {
    return this._site;
  }

  set site(value: string) {
    this._site = value;
  }
}
