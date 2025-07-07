import { Component, Type, Renderer2, OnDestroy, OnInit, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WIDGET_CONFIG, WidgetConfig } from '../widgets.config';

// Interface for grid dimensions, used internally
interface GridRect {
  id: string | number;
  gridRowStart?: number;
  gridColumnStart?: number;
  gridSpan?: number;
  gridRowSpan?: number;
}

@Component({
  selector: 'app-drag-and-drop',
  standalone: true,
  imports: [CommonModule, NgComponentOutlet, FormsModule],
  template: `
    <div class="dashboard-container">
      <div class="main-content">
        <div class="dashboard-header">
            <div>
                <div class="header">Dashboard</div>
                <div class="subtitle">
                    International Tech Park
                    <img src="assets/icons/down_widget.svg">
                </div>
            </div>
            <div class="header-actions">
                <button class="action-button" (click)="compactLayout()" [disabled]="isCompacting">
                    <img src="assets/icons/compress_widget.svg" alt="Compact">
                    {{ isCompacting ? 'Compacting...' : 'Compact Layout' }}
                </button>
                <button class="action-button edit" (click)="toggleEditMode()">
                    <img src="assets/icons/open_widget.svg" alt="Edit">
                    {{ isEditMode ? 'Close Panel' : 'Edit Layout' }}
                </button>
            </div>
        </div>

        <div class="drop-zone" #dropZone
             (dragover)="onDragOver($event)"
             (dragleave)="onDragLeave($event)"
             (drop)="onDrop($event)"
             [class.drag-over]="isDragOver"
             [class.edit-mode]="isEditMode">
          
            <div class="placeholder" #placeholder></div>
          
            <div *ngFor="let item of droppedItems; trackBy: trackByItemId" 
                class="dropped-item-wrapper"
                [style.grid-column]="item.gridColumnStart + ' / span ' + item.gridSpan"
                [style.grid-row]="item.gridRowStart + ' / span ' + item.gridRowSpan"
                [draggable]="isEditMode"
                (dragstart)="onDragItemInZoneStart($event, item)"
                (dragend)="onDragEnd()">
                
                <div class="widget-wrapper">
                    <div class="widget-header-bar">
                        <div class="widget-header">{{ item.title }}</div>
                        <div class="widget-actions">
                            <button *ngIf="isEditMode" class="close-btn" (click)="onClose(item)" title="Remove Widget">
                                <img src='assets/icons/pin_widget.svg'/>
                            </button>
                        </div>
                    </div>
                    <div class="widget-content">
                        <ng-container *ngComponentOutlet="item.component;"></ng-container>
                    </div>
                </div>
                <div class="resize-handle" *ngIf="isEditMode" (mousedown)="onResizeStart($event, item)"></div>
            </div>
        </div>
      </div>

      <div class="widget-panel"
           *ngIf="isEditMode && !isPanelMinimized"
           #widgetPanel
           [class.dragging]="isPanelDragging">
        <div class="widget-panel-header" (mousedown)="onDragListStart($event)">
            <div class="widget-header">Widgets</div>
            <div class="panel-controls">
                <button class="panel-button" (click)="minimizePanel()" title="Minimize panel">
                    <img src="assets/icons/down_widget.svg">
                </button>
                <button class="panel-button" (click)="toggleEditMode()" title="Close panel">
                    <img src="assets/icons/close_widget.svg">
                </button>
            </div>
        </div>
        <div class="widget-action-panel">
            <div class="search-container">
                <img src="assets/icons/search_widget.svg">
                <input class="search-input" placeholder="Search widgets..." [(ngModel)]="searchQuery" (input)="updateAvailableItems()">
            </div>
            <button class="panel-button" (click)="toggleSort()" [title]="sortDirection === 'asc' ? 'Sort A-Z' : 'Sort Z-A'">
                <img src="assets/icons/sort_widget.svg">
            </button>
            <button class="panel-button" title="Settings">
                <img src="assets/icons/setting_widget.svg">
            </button>
        </div>
        <div class="sidebar">
            <div *ngIf="availableItems.length === 0" class="empty-state">
                <p>{{ searchQuery ? 'No widgets found.' : 'All widgets are in use.' }}</p>
            </div>
            <div *ngFor="let item of availableItems; trackBy: trackByItemId"
                 class="sidebar-item"
                 [draggable]="true"
                 (dragstart)="onDragStart($event, item)"
                 (dragend)="onDragEnd()">
                <div class="icon-placeholder">
                    <img [src]="item.icon" alt="Widget icon">
                </div>
                <div class="card-content">
                    <div class="card-title">{{ item.title }}</div>
                    <div class="card-subtitle">{{ item.subtitle }}</div>
                    <div class="created-by">{{ item.createdBy }}</div>
                </div>
            </div>
        </div>
      </div>
      
      <div class="minimized-panel" *ngIf="isEditMode && isPanelMinimized">
          <div class="minimized-content">
              <div class="minimized-header">Widgets</div>
              <div class="panel-controls">
                  <button class="panel-button" (click)="maximizePanel()" title="Maximize panel">
                    <img src="assets/icons/up_widget.svg">
                  </button>
                  <button class="panel-button" (click)="toggleEditMode()" title="Close panel">
                    <img src="assets/icons/close_widget.svg">
                  </button>
              </div>
          </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      --Font-Font_Primary: #303030;
      --Font-Font_Supplemental: #707070;
      --Font-Font_Disabled: #A0A0A0;
      --Neutrals-Neutral_Stroke: #E6E7E8;
      --Neutrals-Blanket-Fill-1: #FFF;
      font-family: "Honeywell Sans Web", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      width: 100%;
      height: 100%;
      display: block;
    }
    
    /* Main Layout */
    .dashboard-container {
      display: flex;
      width: 100vw;
      height: 100vh;
      box-sizing: border-box;
      background-color: #F7F7F7;
      position: relative;
      overflow: hidden;
    }
    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 24px;
      overflow: hidden;
    }

    /* Header */
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      flex-shrink: 0;
    }
    .header {
      color: var(--Font-Font_Primary);
      font-size: 16px; font-weight: 700; line-height: 20px;
    }
    .subtitle {
      display: flex; align-items: center; gap: 8px;
      font-size: 32px; font-weight: 700; letter-spacing: -1px;
      text-transform: capitalize;
    }
    .header-actions { display: flex; gap: 16px; align-items: center; }
    .action-button {
      display: flex; align-items: center; gap: 8px;
      border: 1px solid #ccc; background-color: #0072c3; color: white;
      padding: 8px 16px; border-radius: 4px; cursor: pointer;
      font-weight: bold; transition: background-color 0.2s;
    }
    .action-button:hover { background-color: #005a9e; }
    .action-button:disabled { background-color: #b0b0b0; cursor: not-allowed; }
    .action-button.edit { background-color: #4A5568; }
    .action-button.edit:hover { background-color: #2D3748; }

    /* Drop Zone (Grid) */
    .drop-zone {
      width: 100%; height: 100%;
      border-radius: 8px;
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      grid-auto-rows: 50px; /* cellHeight */
      gap: 10px; /* margin */
      overflow-y: auto;
      background-color: #F7F7F7;
      position: relative;
    }
    .drop-zone.drag-over { background-color: #ebf8ff; }
    
    /* Edit Mode Grid Background */
    .drop-zone.edit-mode::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 0;

        --grid-cell-color: #e9efff;      /* Light blue inside */
        --grid-border-color: #a9c0ff;     /* Darker blue border */
        --grid-gap-color: transparent;   /* Color of the gap between boxes */
        --cell-height: 50px;
        --gap-size: 10px;
        --border-width: 1px;
        --border-radius: 4px;

        /* Calculate dimensions for a single repeating unit */
        --col-width-no-gap: calc((100% - (11 * var(--gap-size))) / 12);
        --row-height: calc(var(--cell-height) + var(--gap-size));
        --col-width-with-gap: calc(var(--col-width-no-gap) + var(--gap-size));
        
        /* Create a complex gradient to simulate bordered, rounded boxes */
        background-image: 
            /* Layer 1: The light blue inner fill */
            repeating-linear-gradient(
                to right,
                var(--grid-cell-color),
                var(--grid-cell-color) var(--col-width-no-gap),
                var(--grid-gap-color) var(--col-width-no-gap),
                var(--grid-gap-color) var(--col-width-with-gap)
            ),
            repeating-linear-gradient(
                to bottom,
                var(--grid-cell-color),
                var(--grid-cell-color) var(--cell-height),
                var(--grid-gap-color) var(--cell-height),
                var(--grid-gap-color) var(--row-height)
            ),
            /* Layer 2: The darker blue border */
            repeating-linear-gradient(
                to right,
                var(--grid-border-color),
                var(--grid-border-color) var(--col-width-no-gap),
                var(--grid-gap-color) var(--col-width-no-gap),
                var(--grid-gap-color) var(--col-width-with-gap)
            ),
            repeating-linear-gradient(
                to bottom,
                var(--grid-border-color),
                var(--grid-border-color) var(--cell-height),
                var(--grid-gap-color) var(--cell-height),
                var(--grid-gap-color) var(--row-height)
            );
        
        /* Use background-clip and border-radius to shape the boxes */
        background-clip: content-box, content-box, border-box, border-box;
        border-radius: var(--border-radius);
    }
    
    .placeholder {
      position: absolute; background-color: rgba(66, 153, 225, 0.3);
      border: 2px dashed #4299e1; border-radius: 8px;
      display: none; pointer-events: none; transition: all 0.1s ease;
      z-index: 1;
    }
    .dropped-item-wrapper {
      position: relative;
      z-index: 1; /* Ensure widgets are above the ::before grid */
      transition: all 0.2s ease-in-out;
      cursor: move;
    }
    .dropped-item-wrapper[draggable="false"] { cursor: default; }
    .resize-handle {
      position: absolute; bottom: 0; right: 0; width: 20px; height: 20px;
      cursor: nwse-resize; z-index: 10;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="%23a0a0a0"><path d="M12 0H8V2H10V4H12V0Z M4 0H0V4H2V2H4V0Z M12 8V12H8V10H10V8H12Z M2 8H0V12H4V10H2V8Z"/></svg>');
      background-repeat: no-repeat;
      background-position: bottom right;
    }

    /* Widget Wrapper (replicates HocWrapperComponent) */
    .widget-wrapper {
      display: flex; flex-direction: column;
      height: 100%; overflow: hidden;
      background-color: var(--Neutrals-Blanket-Fill-1);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border-radius: 8px;
      border: 1px solid var(--Neutrals-Neutral_Stroke);
    }
    .widget-header-bar {
      display: flex; justify-content: space-between;
      min-height: 24px; align-items: center;
      padding: 12px 16px;
    }
    .widget-header {
      color: var(--Font-Font_Primary); font-size: 18px;
      font-weight: 700; letter-spacing: -0.5px;
    }
    .widget-actions { display: flex; align-items: center; gap: 8px; }
    .close-btn {
      background: none; border: none; cursor: pointer;
      padding: 0; line-height: 1;
    }
    .widget-content {
      flex: 1; padding: 16px; overflow: auto;
    }

    /* Widget Panel */
    .widget-panel {
      position: absolute; width: 350px;
      padding: 16px; background-color: #FFF;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      z-index: 1000; overflow: hidden;
      display: flex; flex-direction: column;
      border-radius: 8px;
      transition: transform 0.3s ease;
    }
    .widget-panel.dragging { transition: none; }
    .widget-panel-header {
      display: flex; justify-content: space-between; align-items: center;
      cursor: move;
    }
    .panel-controls { display: flex; align-items: center; gap: 8px; }
    .panel-button {
      background: none; border: none; cursor: pointer;
      padding: 4px; line-height: 1;
    }
    .widget-action-panel {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0;
    }
    .search-container {
      display: flex; align-items: center; flex: 1 0 0;
      height: 32px; padding: 0px 8px;
      border-radius: 8px;
      border: 1px solid var(--Neutrals-Neutral_Stroke);
      background: #FCFCFC; margin-right: 8px;
    }
    .search-input {
      flex: 1; border: none; outline: none;
      background: transparent; padding: 8px; width: 100%;
    }
    .sidebar {
      flex: 1; overflow-y: auto; padding-top: 16px;
      max-height: calc(80vh - 130px);
    }
    .empty-state {
      padding: 16px; text-align: center; color: #64748b;
    }
    .sidebar-item {
      width: 100%; min-height: 120px;
      display: flex; gap: 4px; border-radius: 8px;
      border: 1px solid var(--Neutrals-Neutral_Stroke);
      background: var(--Neutrals-Blanket-Fill-1);
      margin-bottom: 12px;
      cursor: grab;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .sidebar-item:hover { transform: translateY(-2px); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .sidebar-item:active { cursor: grabbing; }
    .icon-placeholder {
      display: flex; width: 104px; height: 104px;
      justify-content: flex-end; align-items: center;
      background-size: cover; border-radius: 3px; margin: 8px;
    }
    .card-content { flex: 1; margin: 8px 8px 8px 0px; }
    .card-title { font-size: 16px; font-weight: 700; line-height: 20px; }
    .card-subtitle {
      overflow: hidden; color: var(--Font-Font_Supplemental);
      text-overflow: ellipsis; white-space: nowrap; font-size: 12px;
      width: 190px; height: 70px;
    }
    .created-by { color: var(--Font-Font_Disabled); font-size: 8px; }

    /* Minimized Panel */
    .minimized-panel {
      width: 354px; position: fixed; bottom: 20px; right: 30px;
      background-color: #f8fafc;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
      border-radius: 8px; z-index: 1000;
      transition: all 0.3s ease;
    }
    .minimized-content {
      display: flex; align-items: center;
      justify-content: space-between; padding: 12px;
    }
    .minimized-header { font-size: 18px; font-weight: 700; letter-spacing: -0.5px; }
  `]
})
export class DragAndDropComponent implements OnInit, OnDestroy {
  @ViewChild('placeholder') placeholderRef!: ElementRef<HTMLDivElement>;
  @ViewChild('widgetPanel') widgetPanelRef!: ElementRef<HTMLDivElement>;

  // --- State Properties ---
  isEditMode = false;
  isPanelMinimized = false;
  isPanelDragging = false;
  isCompacting = false;
  isDragOver = false;
  searchQuery = '';
  sortDirection: 'asc' | 'desc' = 'asc';

  // --- Data Properties ---
  initialAvailableItems: WidgetConfig[] = WIDGET_CONFIG;
  availableItems: WidgetConfig[] = [];
  droppedItems: WidgetConfig[] = [];
  
  // --- Drag/Resize Internal State ---
  private originalLayout: WidgetConfig[] = []; // For reverting on drag leave
  private panelPosition = { x: 0, y: 0 };
  private listInitialX = 0;
  private listInitialY = 0;
  private unlistenListMove?: () => void;
  private unlistenListUp?: () => void;
  
  private draggedItem: WidgetConfig | null = null;
  private draggedFromZone = false;
  
  private isResizing = false;
  private resizingItem: WidgetConfig | null = null;
  private initialResizeX = 0;
  private initialResizeY = 0;
  private initialGridSpan = 0;
  private initialRowSpan = 0;
  private unlistenResizeMove?: () => void;
  private unlistenResizeEnd?: () => void;

  constructor(
    private renderer: Renderer2, 
    private zone: NgZone,
    private cdRef: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadLayout();
  }

  ngOnDestroy() {
    this.onDragListEnd();
    this.onResizeEnd();
  }

  trackByItemId(index: number, item: WidgetConfig): string | number {
    return item.id;
  }

  // --- UI Actions ---
  toggleEditMode() {
      this.isEditMode = !this.isEditMode;
      if (this.isEditMode) {
          this.isPanelMinimized = false;
          // Position panel on right side when opening
          this.zone.runOutsideAngular(() => {
              setTimeout(() => { // Wait for panel to render to get width
                  const viewportWidth = window.innerWidth;
                  const panelWidth = this.widgetPanelRef?.nativeElement.offsetWidth || 350;
                  this.panelPosition.x = viewportWidth - panelWidth - 30; // 30px margin
                  this.panelPosition.y = 80;
                  this.renderer.setStyle(this.widgetPanelRef.nativeElement, 'transform', `translate3d(${this.panelPosition.x}px, ${this.panelPosition.y}px, 0)`);
              });
          });
      }
  }

  minimizePanel() { this.isPanelMinimized = true; }
  maximizePanel() { this.isPanelMinimized = false; }
  
  compactLayout() {
    if (!this.isEditMode || this.isCompacting) return;
    this.isCompacting = true;
    this.reorganizeLayout();
    setTimeout(() => {
      this.isCompacting = false;
      this.cdRef.detectChanges();
    }, 300);
  }

  clearLayout() {
    this.droppedItems = [];
    this.updateAvailableItems();
    this.saveLayout();
  }
  
  toggleSort() {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.updateAvailableItems();
  }

  // --- Widget Panel Drag Logic ---
  onDragListStart(event: MouseEvent) {
    if (this.isPanelMinimized) return;
    const target = event.target as HTMLElement;
    if (target.closest('.panel-button')) return;

    event.preventDefault();
    this.isPanelDragging = true;
    this.listInitialX = event.clientX - this.panelPosition.x;
    this.listInitialY = event.clientY - this.panelPosition.y;
    this.zone.runOutsideAngular(() => {
      this.unlistenListMove = this.renderer.listen('document', 'mousemove', (e) => this.onDragListMove(e));
      this.unlistenListUp = this.renderer.listen('document', 'mouseup', () => this.onDragListEnd());
    });
  }

  private onDragListMove(event: MouseEvent) {
    if (!this.isPanelDragging) return;
    this.panelPosition.x = event.clientX - this.listInitialX;
    this.panelPosition.y = event.clientY - this.listInitialY;
    this.renderer.setStyle(this.widgetPanelRef.nativeElement, 'transform', `translate3d(${this.panelPosition.x}px, ${this.panelPosition.y}px, 0)`);
  }
  
  private onDragListEnd() {
    if (!this.isPanelDragging) return;
    this.zone.run(() => { this.isPanelDragging = false; });
    this.unlistenListMove?.();
    this.unlistenListUp?.();
  }
  
  // --- Widget Drag & Drop Logic ---
  onDragStart(event: DragEvent, item: WidgetConfig) {
    this.draggedItem = item;
    this.draggedFromZone = false;
    // Create a snapshot of the layout before dragging starts
    this.originalLayout = this.droppedItems.map(i => ({...i}));
  }
  
  onDragItemInZoneStart(event: DragEvent, item: WidgetConfig) {
    if (!this.isEditMode) { event.preventDefault(); return; }
    event.stopPropagation();
    this.draggedItem = { ...item };
    this.draggedFromZone = true;
    this.originalLayout = this.droppedItems.map(i => ({...i}));
  }

  onDragEnd() {
    // Clean up original layout to free memory
    this.originalLayout = [];
    this.draggedItem = null;
  }

  onDragOver(event: DragEvent) {
    if (!this.isEditMode || !this.draggedItem) return;
    event.preventDefault();
    this.isDragOver = true;
    
    // Restore layout from snapshot to calculate pushes from a clean slate
    this.droppedItems = this.originalLayout.map(i => ({...i}));

    const placeholderEl = this.placeholderRef.nativeElement;
    const dropZoneEl = event.currentTarget as HTMLElement;
    const placeholderRect = this.calculatePlaceholderRect(event, dropZoneEl, this.draggedItem);

    if (placeholderRect) {
        this.resolveCollisionsForDrag(placeholderRect);
        this.renderer.setStyle(placeholderEl, 'display', 'block');
        this.renderer.setStyle(placeholderEl, 'grid-row', `${placeholderRect.gridRowStart} / span ${placeholderRect.gridRowSpan}`);
        this.renderer.setStyle(placeholderEl, 'grid-column', `${placeholderRect.gridColumnStart} / span ${placeholderRect.gridSpan}`);
    }
  }
  
  onDragLeave(event: DragEvent) {
    this.isDragOver = false;
    this.renderer.setStyle(this.placeholderRef.nativeElement, 'display', 'none');
    // Restore the original layout if the user drags out
    this.droppedItems = this.originalLayout;
  }

  onDrop(event: DragEvent) {
    if (!this.isEditMode || !this.draggedItem) return;
    event.preventDefault();
    this.isDragOver = false;
    this.renderer.setStyle(this.placeholderRef.nativeElement, 'display', 'none');

    const dropZoneEl = event.currentTarget as HTMLElement;
    const finalRect = this.calculatePlaceholderRect(event, dropZoneEl, this.draggedItem);

    if (finalRect) {
        if (this.draggedFromZone) {
            const itemToMove = this.droppedItems.find(i => i.id === this.draggedItem!.id);
            if (itemToMove) {
                itemToMove.gridRowStart = finalRect.gridRowStart;
                itemToMove.gridColumnStart = finalRect.gridColumnStart;
            }
        } else {
            this.droppedItems.push({
                ...this.draggedItem,
                gridRowStart: finalRect.gridRowStart,
                gridColumnStart: finalRect.gridColumnStart,
                gridSpan: this.draggedItem.w,
                gridRowSpan: this.draggedItem.h,
            });
        }
    }
    
    this.updateAvailableItems();
    this.saveLayout();
  }
  
  onClose(itemToClose: WidgetConfig) {
    this.droppedItems = this.droppedItems.filter(item => item.id !== itemToClose.id);
    this.reorganizeLayout();
    this.updateAvailableItems();
    this.saveLayout();
  }

  private calculatePlaceholderRect(event: DragEvent, dropZoneEl: HTMLElement, draggedItem: WidgetConfig): GridRect | null {
      const rect = dropZoneEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const gridCell = {
        width: (dropZoneEl.clientWidth - (11 * 10)) / 12,
        height: 50
      };
      const gap = 10;
      
      let intendedCol = Math.max(1, Math.floor(x / (gridCell.width + gap)) + 1);
      const intendedRow = Math.max(1, Math.floor(y / (gridCell.height + gap)) + 1);
  
      if (intendedCol + draggedItem.w - 1 > 12) {
          intendedCol = 12 - draggedItem.w + 1;
      }
      
      return {
          id: 'placeholder',
          gridColumnStart: intendedCol,
          gridRowStart: intendedRow,
          gridSpan: draggedItem.w,
          gridRowSpan: draggedItem.h
      };
  }

  private resolveCollisionsForDrag(placeholderRect: GridRect) {
    let moved;
    let iterations = 0;
    do {
      moved = false;
      iterations++;
      
      const sortedItems = this.droppedItems.sort((a, b) => 
        (a.gridRowStart! * 12 + a.gridColumnStart!) - (b.gridRowStart! * 12 + b.gridColumnStart!)
      );

      // Check for collisions with the placeholder first
      for (const item of sortedItems) {
        if (this.draggedItem?.id === item.id) continue;

        if (this.checkCollision(placeholderRect, item)) {
          item.gridRowStart! += placeholderRect.gridRowSpan!;
          moved = true;
        }
      }

      // Check for subsequent item-on-item collisions
      for (const itemA of sortedItems) {
        for (const itemB of sortedItems) {
          if (itemA.id === itemB.id) continue;
          if (this.checkCollision(itemA, itemB)) {
            itemB.gridRowStart = itemA.gridRowStart! + itemA.gridRowSpan!;
            moved = true;
          }
        }
      }
    } while (moved && iterations < 50); // iteration limit to prevent infinite loops
  }

  // --- Resize Logic ---
  onResizeStart(event: MouseEvent, item: WidgetConfig) {
    if (!this.isEditMode) return;
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.resizingItem = item;
    this.initialResizeX = event.clientX;
    this.initialResizeY = event.clientY;
    this.initialGridSpan = item.gridSpan || 1;
    this.initialRowSpan = item.gridRowSpan || 1;
    this.zone.runOutsideAngular(() => {
      this.unlistenResizeMove = this.renderer.listen('document', 'mousemove', (e) => this.onResizeMove(e));
      this.unlistenResizeEnd = this.renderer.listen('document', 'mouseup', () => this.onResizeEnd());
    });
  }

  private onResizeMove(event: MouseEvent) {
    if (!this.isResizing || !this.resizingItem) return;
    const dropZone = (this.placeholderRef.nativeElement.parentNode as HTMLElement);
    const colWidth = (dropZone.clientWidth - (11 * 10)) / 12;
    const rowHeight = 50 + 10;
    const dx = event.clientX - this.initialResizeX;
    const dy = event.clientY - this.initialResizeY;
    const colSpanDiff = Math.round(dx / colWidth);
    const rowSpanDiff = Math.round(dy / rowHeight);

    const newColSpan = Math.max(1, this.initialGridSpan + colSpanDiff);
    const maxColSpan = 12 - (this.resizingItem.gridColumnStart ?? 0) + 1;
    this.resizingItem.gridSpan = Math.min(newColSpan, maxColSpan, this.resizingItem.maxW || 12);

    let newRowSpan = Math.max(1, this.initialRowSpan + rowSpanDiff);
    if (this.resizingItem.maxH) {
      newRowSpan = Math.min(newRowSpan, this.resizingItem.maxH);
    }
    this.resizingItem.gridRowSpan = newRowSpan;
    this.cdRef.detectChanges();
  }

  private onResizeEnd() {
    if (this.isResizing && this.resizingItem) {
      this.zone.run(() => {
        this.reorganizeLayout();
        this.saveLayout();
        this.isResizing = false;
        this.resizingItem = null;
      });
    }
    this.unlistenResizeMove?.();
    this.unlistenResizeEnd?.();
  }

  // --- Layout & State Management Logic ---
  updateAvailableItems() {
    const droppedIds = new Set(this.droppedItems.map(item => item.id));
    let items = this.initialAvailableItems.filter(item => !droppedIds.has(item.id));
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.subtitle.toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      const comparison = a.title.localeCompare(b.title);
      return this.sortDirection === 'asc' ? comparison : -comparison;
    });
    this.availableItems = items;
  }
  
  saveLayout() {
    const layoutToSave = this.droppedItems.map(item => {
      const { component, ...rest } = item;
      return rest;
    });
    localStorage.setItem('dashboardLayout', JSON.stringify(layoutToSave));
  }

  loadLayout() {
    const savedLayout = localStorage.getItem('dashboardLayout');
    if (savedLayout && savedLayout !== '[]') {
        const parsedItems: Omit<WidgetConfig, 'component'>[] = JSON.parse(savedLayout);
        this.droppedItems = parsedItems.map(item => {
            const originalConfig = this.initialAvailableItems.find(c => c.id === item.id);
            return { ...item, component: originalConfig?.component };
        }).filter((item): item is WidgetConfig & { component: Type<any> } => !!item.component);
    } else {
      this.loadDefaultLayout();
    }
    this.updateAvailableItems();
  }
  
  private loadDefaultLayout() {
    this.droppedItems = this.initialAvailableItems
      .filter(item => item.default)
      .map((item) => ({
        ...item,
        gridSpan: item.w,
        gridRowSpan: item.h,
      }));
    this.reorganizeLayout();
  }

  // --- Collision and Placement Algorithms ---
  reorganizeLayout() {
    const sortedItems = [...this.droppedItems].sort((a, b) => (b.w * b.h) - (a.w * a.h));
    const newLayout: WidgetConfig[] = [];
    sortedItems.forEach(item => {
      let placed = false;
      for (let r = 1; r < 100 && !placed; r++) {
        for (let c = 1; c <= (12 - item.w + 1) && !placed; c++) {
          const tempItem = { ...item, gridRowStart: r, gridColumnStart: c };
          const hasCollision = newLayout.some(placedItem => this.checkCollision(tempItem, placedItem));
          if (!hasCollision) {
            item.gridRowStart = r;
            item.gridColumnStart = c;
            newLayout.push(item);
            placed = true;
          }
        }
      }
    });
    this.droppedItems = newLayout;
    this.saveLayout();
  }

  private checkCollision(itemA: GridRect, itemB: GridRect): boolean {
    const aColStart = itemA.gridColumnStart ?? 1;
    const aRowStart = itemA.gridRowStart ?? 1;
    const aColSpan = itemA.gridSpan ?? 1;
    const aRowSpan = itemA.gridRowSpan ?? 1;
    
    const bColStart = itemB.gridColumnStart ?? 1;
    const bRowStart = itemB.gridRowStart ?? 1;
    const bColSpan = itemB.gridSpan ?? 1;
    const bRowSpan = itemB.gridRowSpan ?? 1;

    return (
      aColStart < bColStart + bColSpan &&
      aColStart + aColSpan > bColStart &&
      aRowStart < bRowStart + bRowSpan &&
      aRowStart + aRowSpan > bRowStart
    );
  }
}