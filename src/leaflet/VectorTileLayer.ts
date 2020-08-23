import 'mapbox-gl-leaflet';
import '../types/mapbox-gl-leaflet';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Style as MapboxStyle } from 'mapbox-gl';
// @ts-ignore
import { MapboxGL } from 'leaflet';

export default class VectorTileLayer extends MapboxGL {
    constructor(style: MapboxStyle|string) {
        super({ style, renderWorldCopies: false  });
    }
};
