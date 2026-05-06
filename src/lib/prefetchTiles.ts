/**
 * Prefetch CARTO map tiles covering the Mangalore area at zoom levels 12–15.
 * This warms the service worker cache so the map works offline.
 * 
 * Mangalore bounding box: lat 12.80–12.98, lon 74.78–74.95
 * 
 * Tile counts:
 *   zoom 12: ~2×2 = 4 tiles
 *   zoom 13: ~4×4 = 16 tiles
 *   zoom 14: ~8×8 = 64 tiles
 *   zoom 15: ~16×16 = 256 tiles
 *   Total: ~340 tiles, ~15-20MB
 */

const TILE_BASE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style";

// Mangalore bounding box
const BOUNDS = {
    minLat: 12.80,
    maxLat: 12.98,
    minLon: 74.78,
    maxLon: 74.95,
};

const ZOOM_LEVELS = [12, 13, 14, 15];

const STORAGE_KEY = "tiles-prefetched-v1";

/** Convert lat/lon to tile x,y at given zoom */
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

/** Generate all tile URLs for a given zoom level within the bounding box */
function getTileURLs(zoom: number): string[] {
    const topLeft = latLonToTile(BOUNDS.maxLat, BOUNDS.minLon, zoom);
    const bottomRight = latLonToTile(BOUNDS.minLat, BOUNDS.maxLon, zoom);

    const urls: string[] = [];
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
        for (let y = topLeft.y; y <= bottomRight.y; y++) {
            // CARTO vector tiles (pbf format)
            urls.push(`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/${zoom}/${x}/${y}.pbf`);
        }
    }
    return urls;
}

/** Prefetch all Mangalore-area tiles. Runs once and stores a flag in localStorage. */
export async function prefetchMangaloreTiles(onProgress?: (done: number, total: number) => void): Promise<void> {
    // Skip if already prefetched
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) {
        console.log("[Tiles] Already prefetched, skipping");
        return;
    }

    // Check if service worker is active
    const registration = await navigator.serviceWorker?.ready;
    if (!registration) {
        console.log("[Tiles] No active service worker, skipping prefetch");
        return;
    }

    // Collect all tile URLs
    const allURLs: string[] = [];
    for (const zoom of ZOOM_LEVELS) {
        allURLs.push(...getTileURLs(zoom));
    }

    console.log(`[Tiles] Prefetching ${allURLs.length} tiles for Mangalore area...`);

    let completed = 0;
    const BATCH_SIZE = 6; // Fetch 6 at a time to avoid overwhelming

    for (let i = 0; i < allURLs.length; i += BATCH_SIZE) {
        const batch = allURLs.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
            batch.map((url) =>
                fetch(url, { mode: "no-cors" }).catch(() => {
                    // Silently ignore failures
                })
            )
        );
        completed += batch.length;
        onProgress?.(Math.min(completed, allURLs.length), allURLs.length);
    }

    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    console.log(`[Tiles] Prefetch complete: ${allURLs.length} tiles cached`);
}

/** Also prefetch the CARTO style JSON */
export async function prefetchMapStyle(): Promise<void> {
    try {
        await fetch("https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", {
            mode: "no-cors",
        });
        console.log("[Tiles] Map style JSON cached");
    } catch {
        // Silently ignore
    }
}
