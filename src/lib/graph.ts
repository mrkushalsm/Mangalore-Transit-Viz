import { point, distance } from '@turf/turf';

export type TransitGeoJSON = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.LineString,
  { id?: string; name?: string;[key: string]: any }
>;

export interface BusStopFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: { id: string; name: string; routes?: string[];[key: string]: any };
}

export interface RouteFeature extends GeoJSON.Feature<GeoJSON.LineString> {
  properties: { id: string; name: string; stops?: string[];[key: string]: any };
}

export interface SpiderWebGeo {
  origin: BusStopFeature;
  level1Routes: RouteFeature[];
  level2Routes: RouteFeature[];
}

export interface RouteLeg {
  routeId: string;
  routeName: string;
  fromStopId: string;
  toStopId: string;
}

export interface TripItinerary {
  origin: BusStopFeature;
  destination: BusStopFeature;
  legs: RouteLeg[];
}

export async function fetchAndParseData(): Promise<TransitGeoJSON> {
  const res = await fetch('/data/bus-network-geo.json');
  if (!res.ok) {
    throw new Error('Failed to fetch bus network data');
  }
  const rawData = await res.json();

  if (rawData.type === 'FeatureCollection') {
    // Standardize IDs and Names to ensure our layer components don't crash
    rawData.features.forEach((f: any) => {
      if (!f.properties) f.properties = {};
      f.properties.id = (f.properties.id || f.properties.name || Math.random().toString()).toString();
      f.properties.name = (f.properties.name || f.properties.id).toString();

      // Keep coordinates as strict numbers
      if (f.geometry?.type === 'Point') {
        const [lng, lat] = f.geometry.coordinates;
        f.geometry.coordinates = [Number(lng), Number(lat)];
        f.properties.routes = f.properties.routes || [];
      } else if (f.geometry?.type === 'LineString') {
        f.geometry.coordinates = f.geometry.coordinates.map((c: any) => [Number(c[0]), Number(c[1])]);
        f.properties.stops = f.properties.stops || [];
      }
    });

    console.log(`Loaded GeoJSON with ${rawData.features.length} features`);
    return rawData as TransitGeoJSON;
  }

  // If we ever hit here, someone modified the backend to output something fundamentally un-GeoJSON.
  // We'll return an empty collection gracefully.
  console.error("Data fetched is not a valid FeatureCollection");
  return { type: "FeatureCollection", features: [] };
}

export function findNearestStop(lng: number, lat: number, geojson: TransitGeoJSON): BusStopFeature | null {
  const stops = geojson.features.filter(f => f.geometry.type === 'Point') as BusStopFeature[];
  if (stops.length === 0) return null;

  const clickPoint = point([lng, lat]);
  let nearest: BusStopFeature | null = null;
  let minDistance = Infinity;

  for (const stop of stops) {
    const stopPoint = point(stop.geometry.coordinates as [number, number]);
    const dist = distance(clickPoint, stopPoint, { units: 'kilometers' });

    if (dist < minDistance) {
      minDistance = dist;
      nearest = stop;
    }
  }

  return nearest;
}

export function computeSpiderWeb(originId: string, geojson: TransitGeoJSON): SpiderWebGeo | null {
  const origin = geojson.features.find(f => f.geometry.type === 'Point' && f.properties?.id === originId) as BusStopFeature;
  if (!origin) return null;

  const level1Routes: RouteFeature[] = [];
  const level2RoutesMap = new Map<string, RouteFeature>();
  const directlyConnectedStops = new Set<string>();

  const allRoutes = geojson.features.filter(f => f.geometry.type === 'LineString') as RouteFeature[];
  const allStops = geojson.features.filter(f => f.geometry.type === 'Point') as BusStopFeature[];

  // A helper map to easily lookup stops by ID
  const stopMap = new Map(allStops.map(s => [s.properties.id, s]));

  // In standard GeoJSON, routes are LineStrings. We have to map properties manually or assume they have a `stops` array.
  const originRoutesList = origin.properties.routes || [];

  // Level 1: Find all routes directly passing through origin
  allRoutes.forEach(route => {
    // Fallback: If route has an array of stop IDs that includes originId, or origin has an array of route IDs that includes route id.
    const routeStopsList = route.properties.stops || [];

    if (routeStopsList.includes(originId) || originRoutesList.includes(route.properties.id)) {
      level1Routes.push(route);
      routeStopsList.forEach((stopId: string) => directlyConnectedStops.add(stopId));
    }
  });

  // Level 2: Find all routes intersecting with Level 1 routes
  directlyConnectedStops.forEach(stopId => {
    const stop = stopMap.get(stopId);
    if (stop) {
      const stopRoutesList = stop.properties.routes || [];

      allRoutes.forEach(route => {
        const routeStopsList = route.properties.stops || [];

        // Exclude routes already in Level 1
        const isAlreadyLevel1 = level1Routes.some(l1 => l1.properties.id === route.properties.id);

        if (!isAlreadyLevel1) {
          if (routeStopsList.includes(stopId) || stopRoutesList.includes(route.properties.id)) {
            level2RoutesMap.set(route.properties.id, route);
          }
        }
      });
    }
  });

  return {
    origin,
    level1Routes,
    level2Routes: Array.from(level2RoutesMap.values()).slice(0, 15),
  };
}

export function computeAllPaths(originId: string, destId: string, geojson: TransitGeoJSON, maxTransfers: number = 2): TripItinerary[] {
  const allStops = geojson.features.filter(f => f.geometry.type === 'Point') as BusStopFeature[];
  const allRoutes = geojson.features.filter(f => f.geometry.type === 'LineString') as RouteFeature[];

  const stopMap = new Map(allStops.map(s => [s.properties.id, s]));
  const routeMap = new Map(allRoutes.map(r => [r.properties.id, r]));

  const origin = stopMap.get(originId);
  const dest = stopMap.get(destId);
  if (!origin || !dest || originId === destId) return [];

  // Build a fast lookup of StopName -> RouteFeatures
  const stopToRoutes = new Map<string, RouteFeature[]>();
  allRoutes.forEach(r => {
    const stops = r.properties.stops || [];
    stops.forEach(sId => {
      const normalizedId = String(sId).toLowerCase().trim();
      if (!stopToRoutes.has(normalizedId)) stopToRoutes.set(normalizedId, []);
      stopToRoutes.get(normalizedId)!.push(r);
    });
  });

  const normalizedOriginId = String(originId).toLowerCase().trim();
  const normalizedDestId = String(destId).toLowerCase().trim();

  type PathState = {
    currentStopId: string;
    originalCurrentStopId: string;
    history: RouteLeg[];
    visitedBuses: Set<string>;
  };

  const queue: PathState[] = [
    { currentStopId: normalizedOriginId, originalCurrentStopId: originId, history: [], visitedBuses: new Set() }
  ];

  const validItineraries: TripItinerary[] = [];
  const visitedStops = new Map<string, number>();
  visitedStops.set(normalizedOriginId, 0);

  const MAX_SOLUTIONS = 50;
  let iterations = 0;
  const MAX_ITERATIONS = 5000;

  while (queue.length > 0) {
    iterations++;
    if (iterations > MAX_ITERATIONS) break;
    if (validItineraries.length >= MAX_SOLUTIONS) break;

    const state = queue.shift()!;
    const { currentStopId, originalCurrentStopId, history, visitedBuses } = state;

    if (history.length > maxTransfers + 1) continue;

    const availableRoutes = stopToRoutes.get(currentStopId) || [];

    for (const route of availableRoutes) {
      if (visitedBuses.has(route.properties.id)) continue;

      const stops = route.properties.stops?.map(s => String(s).toLowerCase().trim()) || [];
      const originalStops = route.properties.stops || [];

      // If destination is on this bus
      if (stops.includes(normalizedDestId)) {
        const destIdx = stops.indexOf(normalizedDestId);
        const currentIdx = stops.indexOf(currentStopId);
        const originalEndStopId = String(originalStops[destIdx]);

        const busNumber = route.properties.busNumber || route.properties.name?.split(':')[0]?.replace('Route ', '') || route.properties.id;
        const routeName = `${busNumber}: ${originalCurrentStopId} to ${originalEndStopId}`;

        const newLeg: RouteLeg = {
          routeId: route.properties.id,
          routeName: routeName,
          fromStopId: originalCurrentStopId,
          toStopId: originalEndStopId
        };

        validItineraries.push({
          origin,
          destination: dest,
          legs: [...history, newLeg]
        });
        continue;
      }

      if (history.length >= maxTransfers + 1) continue; // Can't transfer again

      // Reachability: Explore all other stops on this bus
      const currentIdx = stops.indexOf(currentStopId);
      for (let i = 0; i < stops.length; i++) {
        const nextStopId = stops[i];
        if (nextStopId === currentStopId) continue;

        const nextDepth = history.length + 1;
        if (visitedStops.has(nextStopId) && visitedStops.get(nextStopId)! < nextDepth) {
          continue; // We've reached this stop more efficiently before
        }

        visitedStops.set(nextStopId, nextDepth);
        const originalNextStopId = String(originalStops[i]);

        const busNumber = route.properties.busNumber || route.properties.name?.split(':')[0]?.replace('Route ', '') || route.properties.id;
        const routeName = `${busNumber}: ${originalCurrentStopId} to ${originalNextStopId}`;

        const newLeg: RouteLeg = {
          routeId: route.properties.id,
          routeName: routeName,
          fromStopId: originalCurrentStopId,
          toStopId: originalNextStopId
        };

        queue.push({
          currentStopId: nextStopId,
          originalCurrentStopId: originalNextStopId,
          history: [...history, newLeg],
          visitedBuses: new Set([...visitedBuses, route.properties.id])
        });
      }
    }
  }

  // Deduplicate and Sort
  validItineraries.sort((a, b) => a.legs.length - b.legs.length);

  const uniqueItineraries: TripItinerary[] = [];
  const seenSignatures = new Set<string>();

  for (const it of validItineraries) {
    const signature = it.legs.map(l => `${l.routeName}:${l.fromStopId}-${l.toStopId}`).join('|');
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      uniqueItineraries.push(it);
    }
  }

  return uniqueItineraries;
}

