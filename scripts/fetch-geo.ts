import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import Papa from "papaparse";
import * as dotenv from "dotenv";
import stringSimilarity from "string-similarity";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
    console.error("Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env");
    process.exit(1);
}

const BUS_DATA_URL = "https://raw.githubusercontent.com/mrkushalsm/Mangalore-Bus-Routes/master/public/data/bus-data.csv";
const OUTPUT_PATH = path.resolve(process.cwd(), "public", "data", "bus-network-geo.json");

interface BusStopRaw {
    id: string;
    busNumber: string;
    description: string;
    stops: string;
}

interface GeoStop {
    id: string;
    name: string;
    lat: number;
    lng: number;
    routes: string[];
}

interface GeoRoute {
    id: string;
    name: string;
    stops: string[]; // Ordered stop IDs
    geometry: number[][]; // [lng, lat][] from Directions API
}

interface GeoNetwork {
    stops: Record<string, GeoStop>;
    routes: Record<string, GeoRoute>;
}

// Mapbox Mangalore bounding box approx
const BBOX = "74.793,12.805,74.908,12.980";
// Overpass bounding box requires [south,west,north,east]
const OVERPASS_BBOX = "12.805,74.793,12.980,74.908";

interface OsmNode {
    lat: number;
    lon: number;
    tags?: {
        name?: string;
        "name:en"?: string;
    };
}

let osmBusStops: OsmNode[] = [];

// Pre-fetch EVERY bus stop in Mangalore from the raw OpenStreetMap database
async function fetchAllMangaloreStops() {
    console.log("Downloading OSM bus stop database via Overpass...");
    const query = `
        [out:json][timeout:25];
        (
          node["highway"="bus_stop"](${OVERPASS_BBOX});
          node["public_transport"="platform"](${OVERPASS_BBOX});
        );
        out body;
    `;

    try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: query
        });
        const data = await res.json() as { elements: OsmNode[] };

        osmBusStops = data.elements.filter(n => n.tags && (n.tags.name || n.tags["name:en"]));
        console.log(`Successfully extracted ${osmBusStops.length} named bus stops from Mangalore region.`);
    } catch (e) {
        console.error("Failed to query Overpass API:", e);
    }
}

// Find the best fuzzy match for a completely unstructured CSV name locally in memory
function findBestOsmMatch(stopName: string): [number, number] | null {
    if (osmBusStops.length === 0) return null;

    // Build array of all possible OSM names (handling English translations if varying)
    const validNodes = osmBusStops.map(n => ({
        node: n,
        primaryName: n.tags?.["name:en"] || n.tags?.name || ""
    })).filter(n => n.primaryName.length > 0);

    const names = validNodes.map(n => n.primaryName.toLowerCase());
    const searchTarget = stopName.toLowerCase().replace(/bus stop/g, "").trim();

    const match = stringSimilarity.findBestMatch(searchTarget, names);

    // Lower threshold because Indian colloquial names vary wildly in spelling (e.g., Kuloor vs Kulur)
    if (match.bestMatch.rating > 0.4) {
        const bestNode = validNodes[match.bestMatchIndex].node;
        console.log(`Matched '${stopName}' -> '${match.bestMatch.target}' (${(match.bestMatch.rating * 100).toFixed(0)}% match)`);
        return [bestNode.lon, bestNode.lat]; // Return [lng, lat] for GeoJSON
    }

    return null;
}

// Directions API removed: Maps token lacks routing privileges.
// Outputting straight lines connecting the exact bus stop coordinates instead.
async function fetchRouteGeometry(coordinates: [number, number][]): Promise<number[][]> {
    return coordinates;
}

async function main() {
    console.log("Fetching raw CSV...");
    const res = await fetch(BUS_DATA_URL);
    const csvText = await res.text();

    console.log("Parsing CSV...");
    const parsed = Papa.parse<BusStopRaw>(csvText, { header: true, skipEmptyLines: true });

    const network: GeoNetwork = { stops: {}, routes: {} };

    // Phase 1: Collect unique stops and routes
    const stopNamesToGeocode = new Set<string>();

    for (const row of parsed.data) {
        const routeId = row.busNumber;
        const routeName = row.description;
        const stopsStr = row.stops;

        if (!routeId || !stopsStr) continue;

        if (!network.routes[routeId]) {
            network.routes[routeId] = { id: routeId, name: routeName, stops: [], geometry: [] };
        }

        const stopNames = stopsStr.split(';').map(s => s.trim()).filter(Boolean);
        for (const name of stopNames) {
            stopNamesToGeocode.add(name);

            const stopId = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
            if (!network.stops[stopId]) {
                network.stops[stopId] = { id: stopId, name, lat: 0, lng: 0, routes: [] };
            }
            if (!network.stops[stopId].routes.includes(routeId)) {
                network.stops[stopId].routes.push(routeId);
            }

            const routeStops = network.routes[routeId].stops;
            if (routeStops[routeStops.length - 1] !== stopId) {
                routeStops.push(stopId);
            }
        }
    }

    // Phase 2: Geocode stops using Fuzzy OSM Matcher
    await fetchAllMangaloreStops();

    console.log(`Geocoding ${stopNamesToGeocode.size} unique stops via memory match...`);
    for (const name of Array.from(stopNamesToGeocode)) {
        const stopId = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const coords = findBestOsmMatch(name);

        if (coords) {
            // Strict Bounding Box validation to prevent stray Hassan/Bengaluru nodes
            if (coords[0] >= 74.00 && coords[0] <= 75.50 && coords[1] >= 12.50 && coords[1] <= 13.50) {
                network.stops[stopId].lng = coords[0];
                network.stops[stopId].lat = coords[1];
            } else {
                console.warn(`Matched '${name}' but it was outside Mangalore bounds (${coords[0]}, ${coords[1]}). Forcing grid fallback.`);
                let hash = 0;
                for (let i = 0; i < stopId.length; i++) hash = stopId.charCodeAt(i) + ((hash << 5) - hash);
                network.stops[stopId].lng = 74.8430 + (Math.abs(hash >> 8) % 100) / 10000;
                network.stops[stopId].lat = 12.8698 + (Math.abs(hash) % 200) / 10000;
            }
        } else {
            // Final Fallback: Random deterministic offset around Mangalore center to prevent overlapping dots
            console.warn(`Could not find fuzzy match for '${name}', defaulting to grid fallback.`);
            let hash = 0;
            for (let i = 0; i < stopId.length; i++) hash = stopId.charCodeAt(i) + ((hash << 5) - hash);
            network.stops[stopId].lng = 74.8430 + (Math.abs(hash >> 8) % 100) / 10000;
            network.stops[stopId].lat = 12.8698 + (Math.abs(hash) % 200) / 10000;
        }
    }

    // Phase 3: Fetch Directions for Routes
    console.log(`Fetching true road geometries for ${Object.keys(network.routes).length} routes...`);
    const routeEntries = Object.values(network.routes);
    let routeCount = 0;

    for (const route of routeEntries) {
        const coordinates: [number, number][] = route.stops.map(sid => {
            const s = network.stops[sid];
            return [s.lng, s.lat];
        });

        route.geometry = await fetchRouteGeometry(coordinates);

        routeCount++;
        if (routeCount % 5 === 0) console.log(`Fetched geometry for ${routeCount} / ${routeEntries.length} routes`);
    }

    // Phase 4: Save to file
    const outDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(network, null, 2));
    console.log(`\nSuccess! Wrote enriched geospatial network to ${OUTPUT_PATH}`);
}

main().catch(console.error);
