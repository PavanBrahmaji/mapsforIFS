import { Routes } from '@angular/router';
import { Page1Component } from './page1/page1.component';
import { Page2Component } from './page2/page2.component';
import { Page3Component } from './page3/page3.component';
import { DepartPage1Component } from './depart/depart-page1/depart-page1.component';
import { DepartPage2Component } from './depart/depart-page2/depart-page2.component';
import { DragAndDropComponent } from './drag-and-drop/drag-and-drop.component';
import { Page6Component } from './page6/page6.component';
import { Page7Component } from './page7/page7.component';
import { Page8Component } from './page8/page8.component';
import { Page9Component } from './page9/page9.component';

export const routes: Routes = [
    { path: 'page1', component: Page1Component },
    { path: 'page2', component: Page2Component },
    { path: 'page3',component: Page3Component },
    { path: 'department/page1',component: DepartPage1Component },
    { path: 'department/page2',component: DepartPage2Component },
    { path: 'page5',component: DragAndDropComponent },
    { path: 'page6',component: Page6Component },
    { path: 'page7',component: Page7Component },
    { path: 'page8',component: Page8Component },
    { path: 'page9',component: Page9Component },
    { path: '', redirectTo: 'page1', pathMatch: 'full' }
];
