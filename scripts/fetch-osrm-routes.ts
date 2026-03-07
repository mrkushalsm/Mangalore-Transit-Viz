import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { TransitGeoJSON, RouteFeature } from "../src/lib/graph";

const DATA_PATH = path.resolve(process.cwd(), "public", "data", "bus-network-geo.json");

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRouteGeometry(coordinates: [number, number][]): Promise<[number, number][] | null> {
    // OSRM expects: longitude,latitude;longitude,latitude
    const coordString = coordinates.map(c => `${c[0]},${c[1]}`).join(";");

    // Driving profile, simplified overview to greatly reduce GeoJSON size, return as GeoJSON linestring
    const url = `http://router.project-osrm.org/route/v1/driving/${coordString}?overview=simplified&geometries=geojson`;

    try {
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`OSRM API returned ${res.status}: ${res.statusText}`);
            return null;
        }
        const data = await res.json() as any;

        if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            // Return the high-res [lng, lat][] array
            return data.routes[0].geometry.coordinates;
        } else {
            console.warn(`OSRM Route not found or invalid response code: ${data.code}`);
            return null;
        }
    } catch (e) {
        console.error("OSRM fetch error:", e);
        return null;
    }
}

async function main() {
    console.log("Loading bus network data...");
    const rawData = fs.readFileSync(DATA_PATH, "utf8");
    const network = JSON.parse(rawData) as TransitGeoJSON;

    const routeFeatures = network.features.filter(f => f.geometry.type === 'LineString') as RouteFeature[];
    console.log(`Found ${routeFeatures.length} routes to process.`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < routeFeatures.length; i++) {
        const route = routeFeatures[i];

        // Skip lines that have too few coordinates to route reliably
        if (!route.geometry.coordinates || route.geometry.coordinates.length < 2) continue;

        // Skip over-complex lines to avoid OSRM URI length limit (approx 100 coords max recommended)
        // If a route has > 50 stops, we'll downsample it for the query.
        let queryCoords = route.geometry.coordinates as [number, number][];
        if (queryCoords.length > 50) {
            console.log(`Route ${route.properties.name} is too long (${queryCoords.length} stops), downsampling for query...`);
            queryCoords = queryCoords.filter((_, idx) => idx % Math.ceil(queryCoords.length / 45) === 0);
            // Ensure start and end are preserved
            queryCoords[0] = route.geometry.coordinates[0] as [number, number];
            queryCoords[queryCoords.length - 1] = route.geometry.coordinates[route.geometry.coordinates.length - 1] as [number, number];
        }

        process.stdout.write(`Processing Route ${i + 1}/${routeFeatures.length} (${route.properties.name})... `);

        const geom = await fetchRouteGeometry(queryCoords);
        if (geom) {
            route.geometry.coordinates = geom;
            successCount++;
            console.log("OK");
        } else {
            failCount++;
            console.log("FAILED - Kept straight line fallback");
        }

        // 1 second pause to respect public OSRM usage limits
        await sleep(1000);
    }

    console.log(`\nFinished processing! Success: ${successCount}, Failed: ${failCount}`);

    fs.writeFileSync(DATA_PATH, JSON.stringify(network, null, 2));
    console.log(`Saved updated geometry to ${DATA_PATH}`);
}

main().catch(console.error);
