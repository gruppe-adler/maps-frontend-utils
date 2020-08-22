import 'mapbox-gl-leaflet';
import { Style as MapboxStyle } from 'mapbox-gl';
// @ts-ignore
import { MapboxGL } from 'leaflet';

export default class VectorTileLayer extends MapboxGL {
    constructor(style: MapboxStyle|string) {
        super({ style, renderWorldCopies: false  });
    }
};
