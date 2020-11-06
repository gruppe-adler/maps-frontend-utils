import { MapMetaDataGrid } from '../types';
import { ArmaGridFormat, armaToLatLng, latLngToArma } from '..';
import { EventData as MapboxEventData, Map as MapboxMap, MapboxEvent, IControl as MapboxIControl } from 'mapbox-gl';

interface GradGridControlPoint {
    x: number;
    y: number;
}

type GradGridControlSide = 'left'|'right'|'bottom'|'top';

/**
 * @param {number} start 
 * @param {number} step 
 * @param {number} min 
 * @param {number} max 
 * @param {ArmaGridFormat} format
 * @returns {Array<{ coord: number, str: string }>}
 */
const calcLines = (start: number, step: number, min: number, max: number, format: ArmaGridFormat): Array<{ coord: number; str: string, majorStep: boolean }> => {
    const lines: Array<{ coord: number; str: string, majorStep: boolean }> = [];

    // positive direction
    let coord = start;
    let i = 0;
    while (coord <= max) {
        if (coord >= min) {
            lines.push({
                coord,
                str: format.formatGridNumber(i),
                majorStep: (i % 10) === 0
            });
        }
        coord += step;
        i++;
    }

    // negative direction
    coord = start - step;
    i = -1;
    while (coord >= min) {
        if (coord <= max) {
            lines.push({
                coord,
                str: format.formatGridNumber(i),
                majorStep: (i % 10) === 0
            });
        }
        coord -= step;
        i--;
    }

    return lines;
}

const checkLineIntersection = (l1Start: GradGridControlPoint, l1End: GradGridControlPoint, l2Start: GradGridControlPoint, l2End: GradGridControlPoint): null|[number, number] => {
    const denominator = ((l2End.y - l2Start.y) * (l1End.x - l1Start.x)) - ((l2End.x - l2Start.x) * (l1End.y - l1Start.y));
    if (denominator === 0) {
        return null;
    }
    const a = l1Start.y - l2Start.y;
    const b = l1Start.x - l2Start.x;
    const numerator1 = ((l2End.x - l2Start.x) * a) - ((l2End.y - l2Start.y) * b);
    const c = numerator1 / denominator;

    // if we cast these lines infinitely in both directions, they intersect here:
    return [
        l1Start.x + (c * (l1End.x - l1Start.x)),
        l1Start.y + (c * (l1End.y - l1Start.y))
    ];
};

const MAPBOX_FACTOR = 4.5;

const calcZoom = (armaZoom: number): number => {
    return MAPBOX_FACTOR * (1 - Math.max(armaZoom - 0.001, 0.001))
}

export default class GradGridControl implements MapboxIControl {
    private gridStart: GradGridControlPoint;
    private worldSize: number;
    private grids: Array<{ stepY: number; stepX: number; xFormat: ArmaGridFormat; yFormat: ArmaGridFormat; minZoom: number }>;
    private borders: Array<[GradGridControlPoint, GradGridControlPoint, GradGridControlSide]> = [];

    private _map: MapboxMap|null = null;
    private _canvas: HTMLCanvasElement|null = null;
    private _control: HTMLDivElement|null = null;
    private _context: CanvasRenderingContext2D|null = null;
    private _mapResizeCallback?: (ev: MapboxEvent & MapboxEventData) => void;
    private _mapRenderCallback?: (ev: MapboxEvent & MapboxEventData) => void;

    /**
     * @param {number} gridOffsetX gridOffsetX from meta.json
     * @param {number} gridOffsetY gridOffsetY from meta.json
     * @param {number} worldSize worldSize from meta.json
     * @param {Grid[]} grids grids from meta.json
     */
    constructor (gridOffsetX: number, gridOffsetY: number, worldSize: number, grids: MapMetaDataGrid[]) {
        const sortedGrids = grids.sort((a, b) => b.zoomMax - a.zoomMax);

        this.gridStart = { x: 0 - gridOffsetX, y: worldSize - gridOffsetY };
        this.worldSize = worldSize;
        this.grids = [];

        for (let i = 0; i < sortedGrids.length; i++) {

            const grid = {
                stepX: sortedGrids[i].stepX,
                // - is correct here because contrary to the Arma 3 position system the Arma 3 grid system has its origin in the
                // top left corner whilst the x coordinates go from left to right and the y coordinates go from top to bottom.
                stepY: - sortedGrids[i].stepY,
                xFormat: new ArmaGridFormat(sortedGrids[i].formatX),
                yFormat: new ArmaGridFormat(sortedGrids[i].formatY),
                minZoom: calcZoom(sortedGrids[i].zoomMax)
            };

            this.grids.push(grid);
        }
    }

    onAdd (map: MapboxMap): HTMLElement {
        this._map = map;

        this._canvas = document.createElement('canvas');
        this._canvas.classList.add('grad-grid');
        this._canvas.style.pointerEvents = 'none';
        this._canvas.style.position = 'relative';

        this._context = this._canvas.getContext('2d');

        this._mapResizeCallback = (): void => this.fixWidthHeight();
        this._mapRenderCallback = (): void => this.redraw();
        map.on('resize', this._mapResizeCallback);
        map.on('render', this._mapRenderCallback);

        const container = map.getCanvasContainer();
        container.appendChild(this._canvas);

        this.fixWidthHeight();

        this._control = document.createElement('div');
        this._control.classList.add('grad-grid-dummy');
        this._control.style.display = 'none';

        return this._control;
    }
    
    onRemove (): void {
        if (this._canvas !== null) {
            this._canvas.remove();
            this._canvas = null;
        };

        if (this._control !== null) {
            this._control.remove();
            this._control = null;
        };
     
        if (this._map === null) return;

        if (this._mapResizeCallback !== undefined) this._map.off('resize', this._mapResizeCallback);
        if (this._mapRenderCallback !== undefined) this._map.off('render', this._mapRenderCallback);

        this._map = null;
    }

    private fixWidthHeight (): void {
        if (this._map === null || this._canvas === null) return;

        const canvas = this._map.getCanvas();
        const { width, height } = canvas.getBoundingClientRect();
        this._canvas.width = width;
        this._canvas.height = height;
        this._canvas.style.height = `${height}px`;
        this._canvas.style.width = `${width}px`;

        // borders
        const tl = { x: 0, y: 0 };
        const bl = { x: 0, y: this._canvas.height };
        const br = { x: this._canvas.width, y: this._canvas.height };
        const tr = { x: this._canvas.width, y: 0};

        this.borders = [
            [bl, tl, 'left'], // left border
            [tl, tr, 'top'], // top border
            [tr, br, 'right'], // right border
            [br, bl, 'bottom']  // bottom border
        ];

        this.redraw();
    }

    private redraw (): void {
        if (this._context === null || this._canvas === null || this._map === null) return;

        this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._context.strokeStyle = 'rgba(26, 26, 26, 0.6)';
        this._context.fillStyle = 'rgba(26, 26, 26, 0.6)';
        this._context.font = '16px monospace';

        const zoom = this._map.getZoom();

        // find best matching grid
        let visibleGrid = null;
        for (const grid of this.grids) {
            if (zoom < grid.minZoom) continue;
            if (visibleGrid === null || grid.minZoom > visibleGrid.minZoom) {
                visibleGrid = grid
            }
        }

        // exit if no grid was configured for current zoom
        if (visibleGrid === null) return;
        
        const bounds = this._map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();

        const [minX, minY] = latLngToArma(this.worldSize, [sw.lat, sw.lng]);
        const [maxX, maxY] = latLngToArma(this.worldSize, [ne.lat, ne.lng]);

        const { stepX, stepY, yFormat, xFormat } = visibleGrid;

        const xLines = calcLines(this.gridStart.x, stepX, minX, maxX, xFormat);
        const yLines = calcLines(this.gridStart.y, stepY, minY, maxY, yFormat);
        
        const labels: Array<[number, number, string, GradGridControlSide]> = []

        for (const line of yLines) {
            const { str, coord: y, majorStep } = line;
            
            const [p1Lat, p1Lng] = armaToLatLng(this.worldSize, [minX, y]);
            const [p2Lat, p2Lng] = armaToLatLng(this.worldSize, [maxX, y]);
            const p1 = this._map.project([p1Lng, p1Lat]);
            const p2 = this._map.project([p2Lng, p2Lat]);

            labels.push(...this.drawLine(p1, p2, str, majorStep));
        }

        for (const line of xLines) {
            const { str, coord: x, majorStep } = line;

            const [p1Lat, p1Lng] = armaToLatLng(this.worldSize, [x, minY]);
            const [p2Lat, p2Lng] = armaToLatLng(this.worldSize, [x, maxY]);
            const p1 = this._map.project([p1Lng, p1Lat]);
            const p2 = this._map.project([p2Lng, p2Lat]);
            
            labels.push(...this.drawLine(p1, p2, str, majorStep));
        }

        for (const label of labels) {
            this.drawLabel(...label);
        }
    }

    drawLine (point1: GradGridControlPoint, point2: GradGridControlPoint, str: string, majorStep: boolean): Array<[number, number, string, GradGridControlSide]> {
        if (this._context === null) return [];

        if (majorStep) {
            this._context.lineWidth = 2;
        } else {
            this._context.lineWidth = 1;
        }
        this._context.beginPath();
        this._context.moveTo(point1.x, point1.y);
        this._context.lineTo(point2.x, point2.y);
        this._context.stroke();

        // draw a label on every position the line intersects with a canvas border
        const intersections: Array<[number, number, string, GradGridControlSide]> = [];
        for (const [borderPoint1, borderPoint2, type] of this.borders) {
            const inter = checkLineIntersection(point1, point2, borderPoint1, borderPoint2);

            if (inter !== null) intersections.push([inter[0], inter[1], str, type]);
        }

        return intersections;
    }

    drawLabel (x: number, y: number, str: string, type: GradGridControlSide): void {
        if (this._context === null) return;

        let xOffset = 0;
        let yOffset = 0;
        const w = 4 + 10 * str.length;
        const h = 20;

        switch (type) {
            case 'top':
                this._context.textAlign = 'center';
                this._context.textBaseline = 'top';
                this._context.clearRect(x - w / 2, y, w, h);
                yOffset = 4;
                break;
            case 'left':
                this._context.textAlign = 'left';
                this._context.textBaseline = 'middle';
                xOffset = 4;
                this._context.clearRect(x, y - h/2, w, h);
                break;
            case 'bottom':
                this._context.textAlign = 'center';
                this._context.textBaseline = 'bottom';
                this._context.clearRect(x - w / 2, y - h, w, h);
                yOffset = -4;
                break;
            case 'right':
                this._context.textAlign = 'right';
                this._context.textBaseline = 'middle';
                this._context.clearRect(x - w, y - h / 2, w, h);
                xOffset = -4;
                break;
        }
    
        this._context.fillText(str, x + xOffset, y + yOffset);
    }

    getDefaultPosition (): string {
        return 'top-left';
    }
}
