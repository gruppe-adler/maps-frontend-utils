import { Map as MapboxMap, MapboxOptions } from 'mapbox-gl';
import { GradGridControl } from '.';
import { fetchMapMetaData, MapMetaData } from '..';
import { relativeUrl } from '../utils';

import 'mapbox-gl/dist/mapbox-gl.css';

export default class GradMap extends MapboxMap {
    private _armaMapName: string;
    private _armaMapMetaData: MapMetaData|null = null;

    private _satShown = false;
    private _gridShown = true;
    private _grid: GradGridControl|null = null;

    constructor(map: string, options: MapboxOptions & { satShown?: boolean; gridShown?: boolean }) {
        super({
            style: relativeUrl(`${map}/mvt/style.json`),
            renderWorldCopies: false,
            ...options
        });

        // disable map rotation using right click + drag
        this.touchZoomRotate.disableRotation();

        // disable map rotation using touch rotation gesture
        this.dragRotate.disable();

        this._armaMapName = map;
        if (options.satShown !== undefined) this._satShown = options.satShown;
        if (options.gridShown !== undefined) this._gridShown = options.gridShown;

        const mapMetaPromise = fetchMapMetaData(this._armaMapName).then(meta => { this._armaMapMetaData = meta; return meta; });

        this.on('load', () => {
            // add satellite source
            this.addSource(
                'satellite',
                {
                    type: 'raster',
                    url: relativeUrl(`${this._armaMapName}/sat/tile.json`)
                }
            );

            // add satellite layer
            if (this.satShown) {
                this.addLayer({
                    id: 'satellite',
                    type: 'raster',
                    source: 'satellite',
                    paint: { 'raster-opacity': 0.8 },
                }, 'water');
            };

            mapMetaPromise.then((meta: MapMetaData) => {
                console.log('yo')
                const { gridOffsetX, gridOffsetY, worldSize, grids } = meta;

                this._grid = new GradGridControl(gridOffsetX, gridOffsetY, worldSize, grids);

                if (!this._gridShown) return;

                this.addControl(this._grid);
            });
        });
    }

    public set satShown(value: boolean) {
        this._satShown = value;
        
        if (value) {
            this.addLayer({
                id: 'satellite',
                type: 'raster',
                source: 'satellite',
                paint: { 'raster-opacity': 0.8 },
            }, 'water');
        } else {
            this.removeLayer('satellite')
        }
    }
    public get satShown(): boolean {
        return this._satShown;
    }

    public set gridShown(value: boolean) {
        this._gridShown = value;

        if (this._grid === null) return;

        if (value) {
            this.addControl(this._grid);
        } else {
            this.removeControl(this._grid);
        }
    }

    public get gridShown(): boolean {
        return this._gridShown;
    }

    public get armaMapMetaData(): MapMetaData|null {
        return this._armaMapMetaData;
    }

}