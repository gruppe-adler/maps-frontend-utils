import { TileLayer, LatLngBounds } from 'leaflet';
import VectorTileLayer from './VectorTileLayer';
import { fetchJSON, relativeUrl } from '../utils';
export * as GradMap from './GradMap';

export async function satTileLayer(map: string): Promise<TileLayer> {
    const { maxzoom } = await fetchJSON(relativeUrl(`${map}/sat/tile.json`)) as { maxzoom: number };

    return new TileLayer(
        relativeUrl(`${map}/sat/{z}/{x}/{y}.png`),
        {
            maxNativeZoom: maxzoom,
            noWrap: true,
            opacity: 0.85,
            zIndex: -1,
            bounds: new LatLngBounds([-90, -180], [90, 180])
        }
    ).setZIndex(0);
}

export async function vectorTileLayer(map: string): Promise<VectorTileLayer> {
    return new VectorTileLayer(relativeUrl(`${map}/mvt/style.json`));
}