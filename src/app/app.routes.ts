import { Routes } from '@angular/router';
import { Page1Component } from './page1/page1.component';
import { Page2Component } from './page2/page2.component';
import { Page3Component } from './page3/page3.component';
import { DepartPage1Component } from './depart/depart-page1/depart-page1.component';
import { DepartPage2Component } from './depart/depart-page2/depart-page2.component';

export const routes: Routes = [
    { path: 'page1', component: Page1Component },
    { path: 'page2', component: Page2Component },
    { path: 'page3',component: Page3Component },
    { path: 'department/page1',component: DepartPage1Component },
    { path: 'department/page2',component: DepartPage2Component },
    { path: '', redirectTo: 'page1', pathMatch: 'full' }
];
