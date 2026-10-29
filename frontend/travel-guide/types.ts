export type PlaceType = 'sight' | 'food' | 'hotel' | 'transport';
export type TravelMode = 'walking' | 'cycling' | 'driving' | 'subway' | 'rail' | 'manual';
export type Coordinate = {
    lng: number;
    lat: number;
    system: 'GCJ02';
};
export interface Place {
    id: string;
    name: string;
    type: PlaceType;
    city: string;
    address?: string;
    amapPoiId?: string;
    coordinate?: Coordinate;
    locationStatus: 'unresolved' | 'confirmed';
    source: 'original-guide' | 'amap' | 'user';
}
export interface Stop {
    id: string;
    placeId: string;
    note: string;
    incomingMode: TravelMode;
    manualTransportNote?: string;
    durationMinutes?: number;
}
export interface Day {
    id: string;
    title: string;
    subtitle: string;
    defaultSearchCity: string;
    stops: Stop[];
}
export interface TripPlan {
    schemaVersion: 1;
    id: string;
    title: string;
    places: Place[];
    days: Day[];
    savedPlaceIds: string[];
    updatedAt: string;
}
export interface SearchPlace {
    id: string;
    name: string;
    location: string;
    address: string;
    city: string;
    category: string;
}
export interface RouteResult {
    distance: number;
    duration: number;
    points: [
        number,
        number
    ][];
}
export interface RouteLeg {
    id: string;
    from: Stop;
    to: Stop;
    mode: TravelMode;
    status: 'manual' | 'missing' | 'success' | 'error' | 'pending';
    result?: RouteResult;
    message?: string;
}
export const typeLabels: Record<PlaceType, string> = { sight: '景点', food: '美食', hotel: '住宿', transport: '交通' };
export const modeLabels: Record<TravelMode, string> = { walking: '步行', cycling: '骑行', driving: '驾车', subway: '地铁', rail: '高铁', manual: '手动交通' };

export const isManualMode = (mode: TravelMode) => mode === 'manual' || mode === 'subway' || mode === 'rail';
