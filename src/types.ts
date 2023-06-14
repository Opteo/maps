export enum ErrorMessage {
    NO_API_KEY = 'No Google Maps API key was provided.',
    NO_LOCATION = 'No Google location was provided.',
    FAILED_OPENSTREETMAP_REQUEST = 'OpenStreetMap request failed.',
    UNKNOWN_GEOJSON_TYPE = 'Unknown OpenStreetMap geojson location type.',
    NO_COORDINATES_FOUND = 'No coordinates found.',
}

export interface Location {
    canonical_name: string;
    target_type?: GoogleLocationTargetType;
}

export interface Coordinate {
    longitude: number;
    latitude: number;
    distance: number;
}

export enum OpenStreetMapLocationType {
    POINT = 'Point',
    LINESTRING = 'LineString',
    POLYGON = 'Polygon',
    MULTIPOLYGON = 'MultiPolygon',
}

export type OpenStreetMapGeoJson =
    | { type: OpenStreetMapLocationType.POINT; coordinates: number[] }
    | { type: OpenStreetMapLocationType.POLYGON; coordinates: number[][][] }
    | { type: OpenStreetMapLocationType.LINESTRING; coordinates: number[][][] }
    | { type: OpenStreetMapLocationType.MULTIPOLYGON; coordinates: number[][][][] };

export interface OpenStreetMapResponse {
    geojson?: OpenStreetMapGeoJson;
}

export type GoogleLocationTargetType =
    | 'City'
    | 'Municipality'
    | 'Neighborhood'
    | 'District'
    | 'County'
    | 'Region'
    | 'City Region'
    | 'Borough'
    | 'Province'
    | 'University'
    | 'Airport'
    | 'State'
    | 'Country'
    | 'Department'
    | 'Territory'
    | 'Canton'
    | 'Autonomous Community'
    | 'Union Territory'
    | 'Prefecture'
    | 'Governorate'
    | 'Postal Code'
    | 'Congressional District'
    | 'TV Region'
    | 'Okrug'
    | 'National Park';
