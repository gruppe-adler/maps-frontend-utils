import * as leaflet from "leaflet"
import { MapboxOptions } from "mapbox-gl";
declare module 'leaflet'{
    export class MapboxGL extends leaflet.Layer {
        constructor(options: leaflet.LayerOptions & Omit<MapboxOptions, 'container'>)
    }
}