import {
    getGeojsonCoordinates,
    condenseCoordinates,
    calculateCoordinateSeparation,
    buildEncodedCanonicalName,
    buildLocationShape,
    generateMapUrl,
    constants,
} from './maps';
import * as maps from './maps';
import {
    ErrorMessage,
    Location,
    Coordinate,
    OpenStreetMapLocationType,
    OpenStreetMapGeoJson,
    OpenStreetMapResponse,
} from './types';

const mockDoOpenStreetMapRequest = (
    data: OpenStreetMapResponse | undefined
): jest.SpyInstance<Promise<OpenStreetMapResponse | undefined>> =>
    jest.spyOn(maps, 'doOpenStreetMapRequest').mockImplementationOnce(() => Promise.resolve(data));

const mockCondenseCoordinates = (data: Coordinate[][]): jest.SpyInstance<Coordinate[][]> =>
    jest.spyOn(maps, 'condenseCoordinates').mockImplementationOnce(() => data);

const mockGetGeojsonCoordinates = (
    data: Coordinate[][]
): jest.SpyInstance<Promise<Coordinate[][]>> =>
    jest.spyOn(maps, 'getGeojsonCoordinates').mockImplementationOnce(() => Promise.resolve(data));

const mockBuildMapUrl = (data: string): jest.SpyInstance<string> =>
    jest.spyOn(maps, 'buildMapUrl').mockImplementationOnce(() => data);

describe('getGeojsonCoordinates', () => {
    const location = { canonical_name: 'Shropshire' } as Location;
    it('returns an empty array if OpenStreetMap has no response', async () => {
        const mockedOpenStreetMapRequest = mockDoOpenStreetMapRequest(undefined);
        const mockedCondenseCoordinates = mockCondenseCoordinates([]);
        const coordinates = await getGeojsonCoordinates(location);
        expect(coordinates).toEqual([]);
        expect(mockedOpenStreetMapRequest).toHaveBeenCalled();
        expect(mockedCondenseCoordinates).not.toHaveBeenCalled();
    });

    it('returns an empty array if OpenStreetMap response has no GeoJSON', async () => {
        const mockedOpenStreetMapRequest = mockDoOpenStreetMapRequest({});
        const mockedCondenseCoordinates = mockCondenseCoordinates([]);
        const coordinates = await getGeojsonCoordinates(location);
        expect(coordinates).toEqual([]);
        expect(mockedOpenStreetMapRequest).toHaveBeenCalled();
        expect(mockedCondenseCoordinates).not.toHaveBeenCalled();
    });

    it('calls condenseCoordinates if OpenStreetMap response has a GeoJSON', async () => {
        const mockCoordinate = { longitude: 1, latitude: 2 } as Coordinate;
        const mockedOpenStreetMapRequest = mockDoOpenStreetMapRequest({
            geojson: {},
        } as OpenStreetMapResponse);
        const mockedCondenseCoordinates = mockCondenseCoordinates([[mockCoordinate]]);
        const coordinates = await getGeojsonCoordinates(location);
        expect(coordinates).toEqual([[mockCoordinate]]);
        expect(mockedOpenStreetMapRequest).toHaveBeenCalled();
        expect(mockedCondenseCoordinates).toHaveBeenCalled();
    });
});

describe('condenseCoordinates', () => {
    it('returns an empty array if the GeoJSON type is Point', () => {
        const coordinates = condenseCoordinates({
            type: OpenStreetMapLocationType.POINT,
        } as OpenStreetMapGeoJson);

        expect(coordinates).toEqual([[]]);
    });

    it('throws if the GeoJSON type is not a recognised value', () => {
        expect(() => {
            condenseCoordinates({
                type: 'mock location type' as OpenStreetMapLocationType,
            } as OpenStreetMapGeoJson);
        }).toThrow(ErrorMessage.UNKNOWN_GEOJSON_TYPE);
    });

    it('uses the max polygon count to take the largest polygons if the GeoJSON type is MultiPolygon', () => {
        constants.MAX_POLYGON_COUNT = 2;

        const coordinates = condenseCoordinates({
            type: OpenStreetMapLocationType.MULTIPOLYGON,
            coordinates: [
                [
                    [
                        [0, 0],
                        [3, 4],
                        [6, 8],
                    ],
                ],
                [
                    [
                        [0, 0],
                        [3, 4],
                        [6, 8],
                        [9, 12],
                        [12, 16],
                    ],
                ],
                [
                    [
                        [0, 0],
                        [3, 4],
                    ],
                ],
            ],
        });

        expect(coordinates).toHaveLength(2);
        expect(coordinates[0]).toHaveLength(5);
        expect(coordinates[1]).toHaveLength(3);

        constants.MAX_POLYGON_COUNT = 10;
    });

    it('condenses coordinates to a reasonable number based on the distance interval frequency', () => {
        constants.DISTANCE_INTERVAL_FREQUENCY = 4;

        const coordinates = condenseCoordinates({
            type: OpenStreetMapLocationType.POLYGON,
            coordinates: [
                [
                    [1, 1],
                    [2, 2],
                    [4, 5],
                    [4.1, 5.1],
                    [7, 7],
                    [8, 9],
                    [9, 9],
                    [6, 8],
                    [6, 6],
                    [5, 3],
                ],
            ],
        });

        expect(coordinates).toEqual([
            [
                { longitude: 1, latitude: 1, distance: expect.any(Number) },
                { longitude: 4.1, latitude: 5.1, distance: expect.any(Number) },
                { longitude: 8, latitude: 9, distance: expect.any(Number) },
                { longitude: 6, latitude: 6, distance: expect.any(Number) },
            ],
        ]);

        constants.DISTANCE_INTERVAL_FREQUENCY = 200;
    });
});

describe('calculateCoordinateSeparation', () => {
    it('calculates the distance between two coordinates', () => {
        const coordinateA = [1, 1];
        const coordinateB = [4, 5];
        const distance = calculateCoordinateSeparation(coordinateA, coordinateB);
        expect(distance).toEqual(5);
    });

    it('always calculates distance as a positive number', () => {
        const coordinateA = [-2, -3];
        const coordinateB = [1, 1];
        const distance = calculateCoordinateSeparation(coordinateA, coordinateB);
        expect(distance).toEqual(5);
    });

    it('does not throw if the points are the same', () => {
        const coordinateA = [1, 1];
        const coordinateB = [1, 1];
        const distance = calculateCoordinateSeparation(coordinateA, coordinateB);
        expect(distance).toEqual(0);
    });
});

describe('buildEncodedCanonicalName', () => {
    it('removes whitespace after a comma', () => {
        const canonicalName = 'SY7, Shropshire, England';
        const encodedCanonicalName = buildEncodedCanonicalName(canonicalName);
        expect(encodedCanonicalName).toEqual('SY7,Shropshire,England');
    });

    it('converts other whitespace to plusses', () => {
        const canonicalName = 'Nottingham Forest, Great Britain, United Kingdom';
        const encodedCanonicalName = buildEncodedCanonicalName(canonicalName);
        expect(encodedCanonicalName).toEqual('Nottingham+Forest,Great+Britain,United+Kingdom');
    });
});

describe('buildLocationShape', () => {
    it('returns a geographical centre if less than 3 coordinates are passed', () => {
        const coordinates: Coordinate[][] = [[]];
        const location = { canonical_name: 'Belsize Park' } as Location;
        const shape = buildLocationShape({ coordinates, location });
        expect(shape.endsWith('&center=Belsize+Park')).toBeTruthy();
    });

    it('creates the shape using coordinates', () => {
        const coordinates: Coordinate[][] = [
            [
                { longitude: 1, latitude: 1 } as Coordinate,
                { longitude: 2, latitude: 2 } as Coordinate,
                { longitude: 3, latitude: 3 } as Coordinate,
                { longitude: 4, latitude: 4 } as Coordinate,
            ],
        ];
        const location = { canonical_name: 'Belsize Park' } as Location;
        const shape = buildLocationShape({ coordinates, location });
        expect(shape.endsWith('|1,1|2,2|3,3|4,4|1,1')).toBeTruthy();
    });
});

describe('generateMapUrl', () => {
    const mockLocation: Location = {
        canonical_name: 'Birmingham, England, UnitedKingdom',
        target_type: 'City',
    };
    const apiKey = '';

    it('throws if google maps api key is not defined', async () => {
        const mockedGeojsonCoordinates = mockGetGeojsonCoordinates([]);
        const mockedBuildMapUrl = mockBuildMapUrl('');

        // @ts-expect-error
        await expect(generateMapUrl({ location: mockLocation, apiKey: undefined })).rejects.toThrow(
            ErrorMessage.NO_API_KEY
        );
        expect(mockedGeojsonCoordinates).not.toHaveBeenCalled();
        expect(mockedBuildMapUrl).not.toHaveBeenCalled();
    });

    it('throws if the location is not defined', async () => {
        const mockedGeojsonCoordinates = mockGetGeojsonCoordinates([]);
        const mockedBuildMapUrl = mockBuildMapUrl('');

        // @ts-expect-error
        await expect(generateMapUrl({ location: undefined, apiKey })).rejects.toThrow(
            ErrorMessage.NO_LOCATION
        );
        expect(mockedGeojsonCoordinates).not.toHaveBeenCalled();
        expect(mockedBuildMapUrl).not.toHaveBeenCalled();
    });

    it('returns the generated map url', async () => {
        const mockMapUrl = 'mock map url';
        const mockedGeojsonCoordinates = mockGetGeojsonCoordinates([]);
        const mockedBuildMapUrl = mockBuildMapUrl(mockMapUrl);

        const mapUrl = await generateMapUrl({ location: mockLocation, apiKey });
        expect(mapUrl).toEqual(mockMapUrl);
        expect(mockedGeojsonCoordinates).toHaveBeenCalled();
        expect(mockedBuildMapUrl).toHaveBeenCalled();
    });
});
