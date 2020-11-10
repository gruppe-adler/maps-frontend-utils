import { Map as MapboxMap, MapboxOptions, LngLat as MapboxLngLat } from 'mapbox-gl';
import { GradElevationControl, GradGridControl } from '.';
import { ArmaGridFormat, fetchMapMetaData, MapMetaData, ResponseError } from '..';
import { relativeUrl } from '../utils';

import 'mapbox-gl/dist/mapbox-gl.css';
import { armaToLatLng, latLngToArma } from '../coords';

export default class GradMap extends MapboxMap {
    private _armaMapName: string;
    private _armaMapMetaData: MapMetaData|null = null;

    private _satShown = false;
    private _loadElevation = false;
    private _gridShown = true;
    private _gridControl: GradGridControl|null = null;
    private _elevationControl: GradElevationControl|null = null;
    private _grid: {
        gridStart: [number, number];
        stepX: number;
        stepY: number;
        formatX: ArmaGridFormat;
        formatY: ArmaGridFormat;
        format: string;
    } = {
        gridStart: [0,0],
        stepX: 100,
        stepY: 100,
        formatX: new ArmaGridFormat('000'),
        formatY: new ArmaGridFormat('000'),
        format: 'XY',
    };

    constructor(map: string, options: MapboxOptions & { satShown?: boolean; gridShown?: boolean; loadElevation?: boolean }) {
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
        if (options.loadElevation !== undefined) this._loadElevation = options.loadElevation;

        const mapMetaPromise = fetchMapMetaData(this._armaMapName)
            .then(meta => { this._armaMapMetaData = meta; })
            .catch(e => {
                if (e.type === 'GradResponseError') {
                    const err = e as ResponseError;

                    if (err.response.status === 404) this.fire('error:mapnotfound');
                }
                this.fire('error', e);
            });

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
                this.addLayer(
                    {
                        id: 'satellite',
                        type: 'raster',
                        source: 'satellite',
                        paint: { 'raster-opacity': 0.8 },
                    },
                    'water'
                );
            };

            // elevation control
            this._elevationControl = new GradElevationControl(this._armaMapName);
            if (this._loadElevation) this.addControl(this._elevationControl);

            mapMetaPromise.then(() => { this.fire('grad-load'); });
        });

        this.on('grad-load', () => {
            if (this._armaMapMetaData === null) return;

            const { gridOffsetX, gridOffsetY, worldSize, grids } = this._armaMapMetaData;

            // add grid control
            this._gridControl = new GradGridControl(gridOffsetX, gridOffsetY, worldSize, grids);
            if (this._gridShown) this.addControl(this._gridControl);

            // find grid for all the way zoomed in
            const grid = grids.sort((a, b) => a.zoomMax - b.zoomMax)[0];
            this._grid = {
                gridStart: [gridOffsetX, worldSize - gridOffsetY],
                stepX: grid.stepX,
                stepY: - grid.stepY,
                formatX: new ArmaGridFormat(grid.formatX),
                formatY: new ArmaGridFormat(grid.formatY),
                format: grid.format
            };
        })
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

        if (this._gridControl === null) return;

        if (value) {
            this.addControl(this._gridControl);
        } else {
            this.removeControl(this._gridControl);
        }
    }

    public get gridShown(): boolean {
        return this._gridShown;
    }

    public set loadElevation(value: boolean) {
        this._loadElevation = value;

        if (this._elevationControl === null) return;

        if (value) {
            this.addControl(this._elevationControl);
        } else {
            this.removeControl(this._elevationControl);
        }
    }

    public get loadElevation(): boolean {
        return this._loadElevation;
    }

    public get armaMapMetaData(): MapMetaData|null {
        return this._armaMapMetaData;
    }

    /**
     * Project Arma to lat/lng
     * @param {[number, number]} pos Arma position as [x, y]
     * @returns {MapboxLngLat} LngLat
     */
    public fromArma(pos: [number, number]): MapboxLngLat {
        if (this._armaMapMetaData === null) {
            throw new Error('GradMap not fully initialized. Try calling this function after the "grad-init" event has fired');
        }

        const [lat, lng] = armaToLatLng(this._armaMapMetaData.worldSize, pos);

        return new MapboxLngLat(lng, lat);
    }

    /**
     * Project lat/lng to Arma
     * @param {MapboxLngLat} lngLat LngLat
     * @returns {[number, number]} Arma position as [x, y]
     */
    public toArma(lngLat: MapboxLngLat): [number, number] {
        if (this._armaMapMetaData === null) {
            throw new Error('GradMap not fully initialized. Try calling this function after the "grad-init" event has fired');
        }

        return latLngToArma(this._armaMapMetaData.worldSize, [lngLat.lat, lngLat.lng]);
    }

    /**
     * Returns the map grid position of an position.
     * This does basically the same as the [mapGridPosition scripting command](https://community.bistudio.com/wiki/mapGridPosition).
     * @param {[number, number]} position Arma position as [x, y]
     * @returns {string} Formatted grid
     */
    public posToGrid([x, y]: [number, number]): string {
        
        if (this._armaMapMetaData === null) {
            throw new Error('GradMap not fully initialized. Try calling this function after the "grad-init" event has fired');
        }

        const { gridStart, format, formatX, formatY, stepX, stepY } = this._grid;

        const xIndex = Math.floor((x - gridStart[0]) / stepX);
        const yIndex = Math.floor((y - gridStart[1]) / stepY);

        const xStr = formatX.formatGridNumber(xIndex);
        const yStr = formatY.formatGridNumber(yIndex);

        return format.replace('X', xStr).replace('Y', yStr);
    }

    /**
     * Get elevation of position.
     * @param {MapboxLngLat} lngLat LngLat
     * @returns {number} Elevation (-1 if elevation could not be calculated)
     */
    public getElevation(lngLat: MapboxLngLat): number {
        if (!this._loadElevation) {
            throw new Error('getElevation only works, when loadElevation is set to true.');
        }
        
        if (this._elevationControl === null) return -1;

        return this._elevationControl.getElevation(lngLat)
    }
}