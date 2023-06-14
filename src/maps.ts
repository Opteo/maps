import axios from 'axios';
import {
    ErrorMessage,
    Location,
    Coordinate,
    OpenStreetMapLocationType,
    OpenStreetMapGeoJson,
    OpenStreetMapResponse,
} from './types';

/**
 *  @name DISTANCE_INTERVAL_FREQUENCY
 *  @description This number controls the number of points in the outline of the
 *  location on the map. The value will be the maximum number of points, and the
 *  actual number of points will be somewhere beneath but close to this number.
 *  Using a higher value will result in a more detailed shape outline, but will
 *  also result in a longer shape value in the google maps static request url.
 */
const DISTANCE_INTERVAL_FREQUENCY = 200;

/**
 *  @name MAX_POLYGON_COUNT
 *  @description This number controls the maximum number of polygons that are
 *  included in a multipolygon location type.
 */
const MAX_POLYGON_COUNT = 10;

export const constants = { DISTANCE_INTERVAL_FREQUENCY, MAX_POLYGON_COUNT };

const style = [
    '&format=png',
    'maptype=roadmap',
    'style=feature:landscape.man_made|element:geometry|color:0xf7f1df',
    'style=feature:landscape.natural|element:geometry|color:0xd0e3b4',
    'style=feature:landscape.natural.terrain|element:geometry|visibility:off',
    'style=feature:poi|element:labels|visibility:off',
    'style=feature:poi.business|visibility:off',
    'style=feature:poi.medical|element:geometry|color:0xfbd3da',
    'style=feature:poi.park|element:geometry|color:0xbde6ab',
    'style=feature:road|element:geometry.stroke|visibility:off',
    'style=feature:road|element:labels|visibility:off',
    'style=feature:road.arterial|element:geometry.fill|color:0xffffff',
    'style=feature:road.highway|element:geometry.fill|color:0xffe15f',
    'style=feature:road.highway|element:geometry.stroke|color:0xefd151',
    'style=feature:road.local|element:geometry.fill|color:0xffffff',
    'style=feature:transit|element:labels.icon|visibility:off',
    'style=feature:transit|element:labels.text|visibility:off',
    'style=feature:transit.station.airport|element:geometry.fill|color:0xcfb2db',
    'style=feature:transit.station.bus|visibility:off',
    'style=feature:water|element:geometry|color:0xa2daf2',
].join('&');

/**
 *  @name getGeojsonCoordinates
 *  @description Sends a request to OpenStreetMap to get the coordinates for the
 *  shape outline of the location, and then condenses the coordinates.
 */
export const getGeojsonCoordinates = async function (location: Location): Promise<Coordinate[][]> {
    const openStreetMapResponse = await doOpenStreetMapRequest(location);

    if (typeof openStreetMapResponse === 'undefined' || !openStreetMapResponse.geojson) {
        return [];
    }

    return condenseCoordinates(openStreetMapResponse.geojson);
};

/**
 *  @name doOpenStreetMapRequest
 *  @description Send the OpenStreetMap request. This function has been extracted
 *  to make testing easier.
 */
export const doOpenStreetMapRequest = async function (
    location: Location
): Promise<OpenStreetMapResponse | undefined> {
    const encodedCanonicalName = buildEncodedCanonicalName(location.canonical_name);

    const url = `https://nominatim.openstreetmap.org/search.php?q=${encodedCanonicalName}&polygon_geojson=1&format=json`;

    try {
        const openStreetMapResponses: OpenStreetMapResponse[] = await axios.get(url, {
            headers: {},
        });

        if (location.target_type === 'Postal Code') {
            const [openStreetMapResponse] = openStreetMapResponses.filter(
                response => response.geojson?.type === OpenStreetMapLocationType.POINT
            );
            return openStreetMapResponse;
        }

        const [openStreetMapResponse] = openStreetMapResponses;

        return openStreetMapResponse;
    } catch {
        throw new Error(ErrorMessage.FAILED_OPENSTREETMAP_REQUEST);
    }
};

/**
 *  @name condenseCoordinates
 *  @description Some locations will have thousands of coordinates in their border
 *  outline, which would result in a very large google maps static request url. To
 *  avoid this we condense the number of coordinates to a reasonable set of values.
 *  However this cannot be done by keeping every nth coordinate as the spacing
 *  between coordinates is not uniform. For example, along a nation's land border
 *  the spacing between coordinates can be a number of yards, whereas at sea the
 *  spacing can be a number of miles. Therefore we must work out an acceptable
 *  interval between the coordinates we keep, calculated using the total distance
 *  of the outline distance. For example, if a location's shape had an outline of
 *  1000 miles and had 10,000 coordinate points, and we wanted to condense this to
 *  a set of 200 coordinates, we would take a coordinate every 5 miles (or as close
 *  as possible to this number).
 */
export const condenseCoordinates = function (geoJson: OpenStreetMapGeoJson): Coordinate[][] {
    const rawCoordinates: number[][][] = [];
    if (geoJson.type === OpenStreetMapLocationType.POINT) {
        return [[]];
    } else if (geoJson.type === OpenStreetMapLocationType.POLYGON) {
        rawCoordinates.push(geoJson.coordinates[0]);
    } else if (geoJson.type === OpenStreetMapLocationType.LINESTRING) {
        rawCoordinates.push(geoJson.coordinates[0]);
    } else if (geoJson.type === OpenStreetMapLocationType.MULTIPOLYGON) {
        // The MultiPolygon geojson type appears for locations such as island territories.
        // It is important to map these islands for locations such as Greece or Hawaii
        // which have many islands and would look incomplete without. However we cannot
        // map hundreds of tiny island territories. Therefore we sort the polygons by
        // length and take the 10 largest (i.e. the 10 biggest areas of land).
        geoJson.coordinates
            .sort((a, b) => b[0].length - a[0].length)
            .slice(0, constants.MAX_POLYGON_COUNT)
            .forEach(polygon => rawCoordinates.push(...polygon));
    } else {
        throw new Error(ErrorMessage.UNKNOWN_GEOJSON_TYPE);
    }

    // For each set of coordinates...
    return rawCoordinates.map((polygon, index): Coordinate[] => {
        const coordinatesWithDistances: Coordinate[] = [
            { longitude: polygon[0][0], latitude: polygon[0][1], distance: 0 },
        ];

        let totalDistance = 0;

        // Calculate the distance between each coordinate and it's predecessor, and sum
        // the total distance between all coordinates.
        for (let i = 1; i < polygon.length; i++) {
            const coordinateA = polygon[i];
            const coordinateB = polygon[i - 1];
            const distance = calculateCoordinateSeparation(coordinateA, coordinateB);
            totalDistance += distance;
            coordinatesWithDistances.push({
                longitude: coordinateA[0],
                latitude: coordinateA[1],
                distance,
            });
        }

        let distance_interval_frequency = constants.DISTANCE_INTERVAL_FREQUENCY;

        // For MultiPolygon locations, only plot the 2 largest territories with the
        // regular distance interval frequency, and plot the rest with a much smaller
        // frequency to keep the size of the URL to a minimum. For example, when plotting
        // the United States of America, this would plot the main group of states and
        // Alaska with fine detail, but other smaller territories such as Hawaii with
        // a smaller set of coordinates.
        if (geoJson.type === OpenStreetMapLocationType.MULTIPOLYGON) {
            if (index > 1) {
                distance_interval_frequency = 10;
            }
        }

        const distanceInterval = totalDistance / distance_interval_frequency;

        const coordinates: Coordinate[] = [];
        let distanceAccumulator = 0;

        // Take coordinates when the accumulated distance since the last taken coordinate
        // exceeds the interval distance.
        coordinatesWithDistances.forEach((coordinate, index) => {
            distanceAccumulator += coordinate.distance;

            if (index === 0) {
                coordinates.push(coordinate); // always take the first coordinate
            } else if (distanceAccumulator > distanceInterval) {
                distanceAccumulator = 0;
                coordinates.push(coordinate);
            }
        });

        return coordinates;
    });
};

/**
 *  @name calculateCoordinateSeparation
 *  @description Calculates the distance between two coordinates using their
 *  longitudinal and latitudinal differences, and Pythagoras' theorem.
 *  i.e. difference = √(long² + lat²)
 */
export const calculateCoordinateSeparation = function (
    coordinateA: number[],
    coordinateB: number[]
): number {
    const longitudinallDifference = Math.abs(coordinateA[0] - coordinateB[0]);
    const latitudinalDifference = Math.abs(coordinateA[1] - coordinateB[1]);
    const difference = Math.sqrt(
        Math.pow(longitudinallDifference, 2) + Math.pow(latitudinalDifference, 2)
    );

    return difference;
};

/**
 *  @name buildEncodedCanonicalName
 *  @description Encode a location's canonical name for a url by removing whitespace
 *  next to commas, and converting other whitespace into plusses.
 */
export const buildEncodedCanonicalName = function (canonicalName: string): string {
    return canonicalName.replace(/,+\s/g, ',').replace(/\s+/g, '+');
};

/**
 *  @name buildLocationShape
 *  @description Use the location coordinates from OpenStreetMap to build the
 *  outline shape for the google maps static url.
 */
export const buildLocationShape = function ({
    location,
    coordinates,
}: {
    location: Location;
    coordinates: Coordinate[][];
}): string {
    if (!coordinates.length) {
        throw new Error(ErrorMessage.NO_COORDINATES_FOUND);
    }

    return coordinates.reduce((fullPath, polygon) => {
        if (polygon.length > 2) {
            // At least 3 coordinate points needed to make a shape.
            const path = polygon.reduce((thisPath, { latitude, longitude }) => {
                return `${thisPath}|${latitude},${longitude}`;
            }, `&path=color:0x00000077|weight:1|fillcolor:0xAA000033`);

            return `${fullPath}${path}|${polygon[0].latitude},${polygon[0].longitude}`;
        } else {
            const encodedCanonicalName = buildEncodedCanonicalName(location.canonical_name);
            return `${fullPath}&center=${encodedCanonicalName}`;
        }
    }, `${style}`);
};

/**
 *  @name buildMapUrl
 *  @description Build the google maps static url.
 */
export const buildMapUrl = function ({
    location,
    coordinates,
    apiKey,
}: {
    location: Location;
    coordinates: Coordinate[][];
    apiKey: string;
}): string {
    const proportions = '?size=600x400&scale=2';
    const proximities = buildLocationShape({ location, coordinates });
    const key = `&key=${apiKey}`;

    return `https://maps.googleapis.com/maps/api/staticmap${proportions}${proximities}${key}`;
};

/**
 *  @name generateMapUrl
 *  @description Generate a url for a map using a google maps location.
 */
export const generateMapUrl = async function ({
    location,
    apiKey,
}: {
    location: Location;
    apiKey: string;
}): Promise<string> {
    if (typeof apiKey === 'undefined') {
        throw new Error(ErrorMessage.NO_API_KEY);
    }

    if (
        typeof location === 'undefined' ||
        typeof location.canonical_name === 'undefined' ||
        typeof location.target_type === 'undefined'
    ) {
        throw new Error(ErrorMessage.NO_LOCATION);
    }

    const coordinates = await getGeojsonCoordinates(location);

    return buildMapUrl({ location, coordinates, apiKey });
};
