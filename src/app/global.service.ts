// global.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GlobalService {
  private _globalVar: any = null;

  constructor() { 

  }

  get globalVar(): any {
    
    return this._globalVar;
  }

  set globalVar(value: any) {
    
    this._globalVar = value;
  }
}
