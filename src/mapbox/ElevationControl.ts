import { Map as MapboxMap, IControl as MapboxIControl, LngLat as MapboxLngLat, MapSourceDataEvent } from 'mapbox-gl';
import { relativeUrl } from '../utils';

import SphericalMercator from '@mapbox/sphericalmercator';

const takenIds: string[] = [];
const sm = new SphericalMercator({}); 

export default class GradElevationControl implements MapboxIControl {
    private worldName: string;
    private id: string;
    private tiles: Map<string, Uint8Array>;

    private _map: MapboxMap|null = null;
    private _mapSourceDataCallback?: (ev: MapSourceDataEvent) => void;
    private _control: HTMLDivElement|null = null;

    /**
     * @param {string} worldName worldName
     */
    constructor (worldName: string) {
        this.worldName = worldName;
        this.tiles = new Map<string, Uint8Array>();

        const generateId = (): string => Math.ceil((Math.random() * 1000000000000000)).toString(16);
        let id = generateId();
        while (takenIds.includes(id)) {
            id = generateId();
        }

        this.id = `grad-elevation-control-${id}`;
    }

    onAdd (map: MapboxMap): HTMLElement {
        this._map = map;

        this._mapSourceDataCallback = (e: MapSourceDataEvent): void => this.onMapSourceData(e);
        map.on('sourcedata', this._mapSourceDataCallback);

        this._control = document.createElement('div');
        this._control.classList.add('grad-elevation-dummy');
        this._control.style.display = 'none';

        map.addSource(this.id, {
            type: 'raster',
            url: relativeUrl(`${this.worldName}/terrainrgb/tile.json`)
        });
    
        map.addLayer({
            id: this.id,
            type: 'raster',
            source: this.id,
            paint: { 'raster-opacity': 0 }
        });

        return this._control;
    }
    
    onRemove (): void {
        if (this._control !== null) {
            this._control.remove();
            this._control = null;
        };

        this.tiles.clear();
     
        if (this._map === null) return;

        this._map.removeLayer(this.id);
        this._map.removeSource(this.id);

        if (this._mapSourceDataCallback !== undefined) this._map.off('sourcedata', this._mapSourceDataCallback);

        this._map = null;
    }

    getDefaultPosition (): string {
        return 'top-left';
    }

    private onMapSourceData(e: MapSourceDataEvent): void {
        if (e.sourceId !== this.id) return;
        if (e.tile === undefined) return;
        
        const { tileID, texture, state } = e.tile;

        const { x, y, z } = tileID.canonical;

        const tileId = `${z}/${x}/${y}`;

        if (state === 'loaded') {
            try {
                const pixels = this.readTexturePixels(texture);
                this.tiles.set(tileId, pixels)
            } catch (err) {
                // Intentionally ignore error 
            }
        } else if (state === 'unloaded') {
            this.tiles.delete(tileId);
        };
    }

    private readTexturePixels(texture: { context: { gl: WebGLRenderingContext }; texture: WebGLTexture; size: [number, number] }): Uint8Array {
        const { context, texture: webGLTexture, size } = texture;
        const gl = context.gl;
    
        // make a framebuffer
        const fb = context.gl.createFramebuffer();
    
        // make this the current frame buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    
        // attach the texture to the framebuffer.
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, webGLTexture, 0);
    
        // check if you can read from this type of texture.
        const canRead = (gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE);
        
        if (!canRead) {
            // Unbind the framebuffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
            // delete the framebuffer
            gl.deleteFramebuffer(fb);
    
            throw new Error("Couldn't read pixels.");
        }
    
        // read the pixels
        const pixels = new Uint8Array(size[0] * size[1] * 4);
        gl.readPixels(0, 0, size[0], size[1], gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
        // Unbind the framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
        // delete the framebuffer
        gl.deleteFramebuffer(fb);
        
        return pixels
    }

    public getElevation(lngLat: MapboxLngLat): number {
        if (this._map === null) return -1;

        for (let z = Math.ceil(this._map.getZoom()); z > 0; z--) {
            const px = sm.px([lngLat.lng, lngLat.lat], z);
            const x = Math.floor(px[0] / 256);
            const y = Math.floor(px[1] / 256);
    
            const id = `${z}/${x}/${y}`;
    
            if (!this.tiles.has(id)) continue;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const arr = this.tiles.get(id)!;
    
            const pixelX = px[0] % 256;
            const pixelY = px[1] % 256;
            
            const index = (256 * pixelY + pixelX) * 4;
    
            const [r, g, b] = arr.slice(index, index + 4);
    
            const elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
            return elevation;
        }
    
        return -1;
    }
}
