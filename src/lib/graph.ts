import Papa from "papaparse";
import * as turf from "@turf/turf";

export const BUS_DATA_URL =
  "https://raw.githubusercontent.com/mrkushalsm/Mangalore-Bus-Routes/master/public/data/bus-data.csv";

export interface BusStopRaw {
  id: string;
  busNumber: string;
  description: string;
  stops: string; // semicolon separated
}

export interface BusStop {
  id: string; // normalized stop name
  name: string;
  lat: number;
  lng: number;
  routes: string[]; // Routes passing through this stop
}

export interface RouteInfo {
  id: string; // busNumber
  name: string; // description
  stops: string[]; // Ordered list of stop IDs
}

export interface GraphData {
  stops: Record<string, BusStop>;
  routes: Record<string, RouteInfo>;
}

// A dictionary to store inferred/mock coordinates for stops to make the Mapbox component work.
// Ideally, we'd have a secondary dataset with true coordinates.
// We will assign them within a bounding box of Mangalore: [12.8, 74.8] to [13.0, 74.9]
const stopCoordinates: Record<string, { lat: number; lng: number }> = {};

function getOrCreateCoordinates(stopId: string): { lat: number; lng: number } {
  if (stopCoordinates[stopId]) return stopCoordinates[stopId];
  
  // Deterministic "random" based on string hashing for consistency across reloads
  let hash = 0;
  for (let i = 0; i < stopId.length; i++) {
    hash = stopId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Mangalore BBox approx: lat 12.8 to 13.0, lng 74.8 to 74.9
  const lat = 12.8 + (Math.abs(hash) % 200) / 1000;
  const lng = 74.8 + (Math.abs(hash >> 8) % 100) / 1000;
  
  stopCoordinates[stopId] = { lat, lng };
  return { lat, lng };
}


export async function fetchAndParseData(): Promise<GraphData> {
  const res = await fetch(BUS_DATA_URL);
  if (!res.ok) throw new Error("Failed to fetch bus data");
  const csvText = await res.text();

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rawData = results.data as BusStopRaw[];
        resolve(buildGraph(rawData));
      },
      error: (error: Error) => reject(error),
    });
  });
}

function buildGraph(data: BusStopRaw[]): GraphData {
  const stops: Record<string, BusStop> = {};
  const routes: Record<string, RouteInfo> = {};

  data.forEach((row) => {
    const routeId = row.busNumber;
    const routeName = row.description;
    const stopsStr = row.stops;

    if (!routeId || !stopsStr) return; // Skip invalid rows

    const stopNames = stopsStr.split(';').map(s => s.trim()).filter(Boolean);

    // Add Route
    if (!routes[routeId]) {
      routes[routeId] = {
        id: routeId,
        name: routeName,
        stops: [],
      };
    }

    stopNames.forEach((stopName) => {
      const stopId = stopName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      
      // Add Stop
      if (!stops[stopId]) {
        const coords = getOrCreateCoordinates(stopId);
        stops[stopId] = {
          id: stopId,
          name: stopName,
          lat: coords.lat,
          lng: coords.lng,
          routes: [],
        };
      }
      if (!stops[stopId].routes.includes(routeId)) {
        stops[stopId].routes.push(routeId);
      }
      
      const currentRouteStops = routes[routeId].stops;
      if (currentRouteStops[currentRouteStops.length - 1] !== stopId) {
        currentRouteStops.push(stopId);
      }
    });

  });

  return { stops, routes };
}

export function findNearestStop(
  lng: number,
  lat: number,
  stops: Record<string, BusStop>
): BusStop | null {
  const clickPoint = turf.point([lng, lat]);
  let nearest: BusStop | null = null;
  let minDistance = Infinity;

  Object.values(stops).forEach((stop) => {
    const stopPoint = turf.point([stop.lng, stop.lat]);
    const distance = turf.distance(clickPoint, stopPoint, { units: "kilometers" });
    if (distance < minDistance) {
      minDistance = distance;
      nearest = stop;
    }
  });

  return nearest;
}

export interface SpiderWeb {
  origin: BusStop;
  level1Routes: RouteInfo[];
  level2Routes: RouteInfo[];
}

export function computeSpiderWeb(originId: string, graph: GraphData): SpiderWeb | null {
  const origin = graph.stops[originId];
  if (!origin) return null;

  const level1Routes: RouteInfo[] = [];
  const level2RoutesMap = new Map<string, RouteInfo>();
  const directlyConnectedStops = new Set<string>();

  // Level 1: Find all routes directly passing through origin
  origin.routes.forEach(routeId => {
    const route = graph.routes[routeId];
    if (route) {
      level1Routes.push(route);
      route.stops.forEach(stopId => directlyConnectedStops.add(stopId));
    }
  });

  // Level 2: Find all routes intersecting with Level 1 routes
  directlyConnectedStops.forEach(stopId => {
    const stop = graph.stops[stopId];
    if (stop) {
      stop.routes.forEach(routeId => {
        // Exclude routes already in Level 1
        if (!origin.routes.includes(routeId)) {
           const route = graph.routes[routeId];
           if (route) {
             level2RoutesMap.set(routeId, route);
           }
        }
      });
    }
  });

  return {
    origin,
    level1Routes,
    level2Routes: Array.from(level2RoutesMap.values()),
  };
}
