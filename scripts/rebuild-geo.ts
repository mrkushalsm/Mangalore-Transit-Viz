import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import Papa from "papaparse";
import stringSimilarity from "string-similarity";

const BUS_DATA_URL = "https://raw.githubusercontent.com/mrkushalsm/Mangalore-Bus-Routes/master/public/data/bus-data.csv";
const CSV_COORDS_PATH = "/home/mrkus/Downloads/bus_stops_coordinates_v2.csv";
const OUTPUT_PATH = path.resolve(process.cwd(), "public", "data", "bus-network-geo.json");

interface BusStopRaw {
    id: string;
    busNumber: string;
    description: string;
    stops: string;
}

// OSRM helper
async function fetchRouteGeometry(coordinates: [number, number][]): Promise<[number, number][] | null> {
    if (coordinates.length < 2) return null;
    const coordString = coordinates.map(c => `${c[0]},${c[1]}`).join(";");
    const url = `http://router.project-osrm.org/route/v1/driving/${coordString}?overview=simplified&geometries=geojson`;

    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json() as any;
        if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            return data.routes[0].geometry.coordinates;
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Loading authoritative coordinates from CSV...");
    const csvRaw = fs.readFileSync(CSV_COORDS_PATH, "utf-8");
    const lines = csvRaw.split("\n").slice(1);

    // We will build standard GeoJSON features directly
    const features: any[] = [];
    const stopNameToId = new Map<string, string>();
    const allCsvNames: string[] = [];

    // Parse the 256 coordinates
    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(",");
        if (parts.length >= 3) {
            const name = parts[0].trim();
            const lat = parseFloat(parts[1]);
            const lng = parseFloat(parts[2]);
            if (!isNaN(lat) && !isNaN(lng)) {
                allCsvNames.push(name.toLowerCase());
                const id = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
                stopNameToId.set(name.toLowerCase(), id);

                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [lng, lat]
                    },
                    properties: {
                        id,
                        name,
                        routes: []
                    }
                });
            }
        }
    }
    console.log(`Loaded ${features.length} stops from CSV.`);

    console.log("Fetching route definitions from GitHub...");
    const res = await fetch(BUS_DATA_URL);
    const busCsvText = await res.text();
    const parsed = Papa.parse<BusStopRaw>(busCsvText, { header: true, skipEmptyLines: true });

    let routeCount = 0;
    for (let rowIdx = 0; rowIdx < parsed.data.length; rowIdx++) {
        const row = parsed.data[rowIdx];
        if (!row.busNumber || !row.stops) continue;

        const routeStopsRaw = row.stops.split(";").map(s => s.trim()).filter(Boolean);
        const routeStopsIds: string[] = [];
        const routeCoords: [number, number][] = [];

        for (let rawStop of routeStopsRaw) {
            const searchName = rawStop.toLowerCase();
            let matchedId: string | null = null;

            if (stopNameToId.has(searchName)) {
                matchedId = stopNameToId.get(searchName)!;
            } else {
                // Fuzzy match
                const match = stringSimilarity.findBestMatch(searchName, allCsvNames);
                if (match.bestMatch.rating > 0.4) {
                    matchedId = stopNameToId.get(match.bestMatch.target)!;
                }
            }

            if (matchedId) {
                routeStopsIds.push(matchedId);
                const pFeat = features.find(f => f.properties.id === matchedId);
                if (pFeat) {
                    routeCoords.push(pFeat.geometry.coordinates);
                    if (!pFeat.properties.routes.includes(row.busNumber)) {
                        pFeat.properties.routes.push(row.busNumber);
                    }
                }
            }
        }

        if (routeCoords.length >= 2) {
            console.log(`[${rowIdx + 1}/${parsed.data.length}] Mapping Route ${row.busNumber}...`);
            let geometryCoords = routeCoords;

            // OSRM simplification request 
            let queryCoords = routeCoords;
            if (queryCoords.length > 100) {
                // Downsample to fit OSRM URL limits (usually ~100 points)
                queryCoords = queryCoords.filter((_, idx) => idx % Math.ceil(queryCoords.length / 95) === 0);
                queryCoords[0] = routeCoords[0];
                queryCoords[queryCoords.length - 1] = routeCoords[routeCoords.length - 1];
            }

            const osrmCoords = await fetchRouteGeometry(queryCoords);
            if (osrmCoords) {
                geometryCoords = osrmCoords;
            } else {
                console.log(`   -> OSRM failed, falling back to straight lines.`);
            }

            features.push({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: geometryCoords
                },
                properties: {
                    id: `Route_${row.busNumber.replace(/[^a-zA-Z0-9]/g, "_")}`,
                    name: `Route ${row.busNumber}: ${row.description}`,
                    busNumber: row.busNumber,
                    stops: routeStopsIds
                }
            });
            routeCount++;

            // Respect API limits
            await sleep(500);
        }
    }

    console.log(`Rebuilt ${routeCount} full routes.`);

    const geoJson = {
        type: "FeatureCollection",
        features
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geoJson, null, 2));
    console.log(`Saved completely rebuilt network to ${OUTPUT_PATH}!`);
}

main().catch(console.error);
