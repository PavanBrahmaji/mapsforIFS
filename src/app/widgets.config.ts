import { Type } from "@angular/core";
import { Page1Component } from "./page1/page1.component";
import { Page3Component } from "./page3/page3.component";


export interface WidgetConfig {
  icon: string;
  title: string;
  subtitle: string;
  selector: string;
  component: Type<any>,
  id: string;
  w: number;
  h: number;
  maxW?: number;
  maxH?: number;
  createdBy: string;
  default?: boolean;
  // Grid properties added for dropped items
  gridColumnStart?: number;
  gridSpan?: number;
  gridRowStart?: number;
  gridRowSpan?: number;
}
  
  export const WIDGET_CONFIG: WidgetConfig[] = [
    {
      selector: 'app-a',
      component: Page3Component,
      id: 'performance-metrics',
      w: 5,
      h: 5,
      maxW: 10,
      maxH: 10,
      icon: "assets/widget/maps.png",
      title: "Performance Metrics",
      subtitle: "Key business indicators",
      createdBy:'Honeywell'
    },
    {
      selector: 'app-b',
      component: Page1Component,
      id: 'analytics-chart',
      w: 5,
      h: 4,
      maxW: 3,
      maxH: 10,
      icon: "assets/widget/maps.png",
      title: "Analytics Chart",
      subtitle: "Data visualization",
      createdBy:'Honeywell',
    },
    {
      selector: 'app-c',
      component: Page1Component,
      id: 'schedule',
      w: 5,
      h: 4,
      maxW: 3,
      maxH: 10,
      icon: "assets/widget/maps.png",
      title: "Schedule",
      subtitle: "Upcoming events",
      createdBy:'Honeywell',
      default:true
    }
  ];