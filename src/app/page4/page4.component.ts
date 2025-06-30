import { Component, OnInit } from '@angular/core';
import { NfirsService } from '../services/nfirs.service';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';


@Component({
  selector: 'app-page4',
  imports: [CommonModule,HttpClientModule],
  templateUrl: './page4.component.html',
  styleUrl: './page4.component.css'
})
export class Page4Component implements OnInit {

  nfirsData: any[] = [];
  loading = true;

  constructor(private nfirsService: NfirsService) {}

  ngOnInit() {
    this.nfirsService.getNFIRSData().subscribe({
      next: (data) => {
        this.nfirsData = data?.records || []; // Adjust according to API shape
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching NFIRS data', err);
        this.loading = false;
      }
    });
  }


}
