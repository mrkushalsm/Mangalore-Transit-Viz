"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import 'maplibre-gl/dist/maplibre-gl.css';
import { TransitGeoJSON, BusStopFeature, RouteFeature, findNearestStop, TripItinerary } from "@/lib/graph";
import { distance, point } from "@turf/turf";

export const ROUTE_COLORS = [
  "#06b6d4", // Cyan
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#eab308", // Yellow
  "#f97316", // Orange
  "#14b8a6", // Teal
];

interface MapComponentProps {
  graphData: TransitGeoJSON | null;
  originStopId: string | null;
  destinationStopId: string | null;
  itinerary: TripItinerary | null;
  setOriginStopId: (id: string | null) => void;
  setDestinationStopId: (id: string | null) => void;
  clearSelection: () => void;
  onMapClick?: () => void;
}

export default function MapComponent({ 
  graphData, originStopId, destinationStopId, itinerary, 
  setOriginStopId, setDestinationStopId, clearSelection, onMapClick
}: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const stateRef = useRef({ originStopId, destinationStopId });
  useEffect(() => {
     stateRef.current = { originStopId, destinationStopId };
  }, [originStopId, destinationStopId]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [74.85, 12.87],
      zoom: 12,
      attributionControl: false
    });

    map.current.on("load", () => {
      if (!map.current) return;

      map.current.addSource("all-routes", {
         type: "geojson",
         data: { type: "FeatureCollection", features: [] },
      });

      map.current.addSource("stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.current.addSource("route-lines", {
         type: "geojson",
         data: { type: "FeatureCollection", features: [] },
      });

      map.current.addSource("selected-stops", {
         type: "geojson",
         data: { type: "FeatureCollection", features: [] },
      });

      map.current.addLayer({
        id: "all-routes-layer",
        type: "line",
        source: "all-routes",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#3f3f46",
          "line-width": 2,
          "line-opacity": 0.4,
        },
      });

      map.current.addLayer({
        id: "route-lines-layer",
        type: "line",
        source: "route-lines",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });

      map.current.addLayer({
        id: "selected-stops-layer",
        type: "circle",
        source: "selected-stops",
        paint: {
          "circle-radius": 8,
          "circle-color": [
             "match",
             ["get", "type"],
             "origin", "#22c55e",
             "destination", "#ef4444",
             "#ffffff"
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.current.addSource("all-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });

      map.current.addLayer({
        id: "all-stops-points",
        type: "circle",
        source: "all-stops",
        paint: {
          "circle-radius": 4,
          "circle-color": "#e4e4e7",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#18181b",
        },
      });

      // ── Stop click → popup ──────────────────────────────────────────
      map.current.on("click", "all-stops-points", (e) => {
        e.preventDefault(); // stop the event bubbling to the general map click
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const name = feature.properties?.name || feature.properties?.id || "Bus Stop";

        // Close any existing popup
        popupRef.current?.remove();

        popupRef.current = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 14,
          className: "transit-stop-popup",
          maxWidth: "220px",
        })
          .setLngLat([lng, lat])
          .setHTML(
            `<div class="transit-popup-inner">
               <span class="transit-popup-icon">🚌</span>
               <span class="transit-popup-name">${name}</span>
             </div>`
          )
          .addTo(map.current!);
      });

      // ── Cursor changes on stop hover ────────────────────────────────
      map.current.on("mouseenter", "all-stops-points", () => {
        if (map.current) map.current.getCanvas().style.cursor = "pointer";
      });
      map.current.on("mouseleave", "all-stops-points", () => {
        if (map.current) map.current.getCanvas().style.cursor = "";
      });

      // ── General map click (background) ─────────────────────────────
      map.current.on("click", (e) => {
        // Only fire if no stop was clicked (MapLibre fires layer click first when
        // defaultPrevented would be set, but since we can't preventDefault on
        // MapLibre map events from a layer handler, we check queried features)
        const features = map.current!.queryRenderedFeatures(e.point, {
          layers: ["all-stops-points"],
        });
        if (features.length === 0) {
          // Clicked empty map — close popup and notify parent
          popupRef.current?.remove();
          popupRef.current = null;
          if (onMapClick) onMapClick();
        }
      });
      
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  const graphDataRef = useRef(graphData);
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

  useEffect(() => {
    if (!map.current || !graphData || !mapLoaded) return;

    const pointFeatures = graphData.features.filter(f => f.geometry.type === 'Point');
    const lineFeatures = graphData.features.filter(f => f.geometry.type === 'LineString');

    (map.current.getSource("all-stops") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: pointFeatures as any,
    });

    (map.current.getSource("all-routes") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: lineFeatures as any,
    });

    if (itinerary && map.current.getSource("route-lines")) {
       const activeClippedFeatures: any[] = [];
       
       itinerary.legs.forEach((leg, idx) => {
          const routeFeature = graphData.features.find(
             f => f.geometry.type === 'LineString' && String(f.properties?.id) === String(leg.routeId)
          );
          
          if (routeFeature) {
             const coords = routeFeature.geometry.coordinates as [number, number][];
             
             try {
                 const routeStops = routeFeature.properties.stops || [];
                 const stopCoordIndices = new Array(routeStops.length).fill(0);
                 let searchStart = 0;
                 
                 for (let i = 0; i < routeStops.length; i++) {
                     const stopF = pointFeatures.find(f => f.properties?.id === routeStops[i]);
                     if (!stopF) {
                         stopCoordIndices[i] = searchStart;
                         continue;
                     }
                     const pt = point(stopF.geometry.coordinates as [number, number]);
                     let minD = Infinity;
                     let bestIdx = searchStart;
                     
                     for (let j = searchStart; j < coords.length; j++) {
                         const d = distance(pt, point(coords[j]));
                         if (d < minD) {
                             minD = d;
                             bestIdx = j;
                         } else if (d > minD + 0.5 && minD < 0.2) {
                             break;
                         }
                     }
                     stopCoordIndices[i] = bestIdx;
                     if (bestIdx > searchStart) searchStart = bestIdx;
                 }

                 const routeStopsLower = routeStops.map((s: any) => String(s).toLowerCase().trim());
                 const fi = routeStopsLower.indexOf(String(leg.fromStopId).toLowerCase().trim());
                 const ti = routeStopsLower.lastIndexOf(String(leg.toStopId).toLowerCase().trim());
                 
                 if (fi !== -1 && ti !== -1) {
                     const idx1 = stopCoordIndices[fi];
                     const idx2 = stopCoordIndices[ti];
                     const startIdx = Math.min(idx1, idx2);
                     const endIdx = Math.max(idx1, idx2);

                     const slicedCoords = coords.slice(startIdx, endIdx + 1);

                     if (slicedCoords.length >= 2) {
                         activeClippedFeatures.push({
                             ...routeFeature,
                             geometry: { ...routeFeature.geometry, coordinates: slicedCoords },
                             properties: {
                                 ...routeFeature.properties,
                                 color: ROUTE_COLORS[idx % ROUTE_COLORS.length]
                             }
                         });
                     } else {
                         // Fallback: If slice is too small (stops are too close or same location),
                         // draw the full route or just the two points as a tiny line to avoid crash
                         activeClippedFeatures.push({
                            ...routeFeature,
                            properties: {
                                ...routeFeature.properties,
                                color: ROUTE_COLORS[idx % ROUTE_COLORS.length]
                            }
                         });
                     }
                 }
             } catch (e) {
                 console.error("Failed to slice route leg:", e);
             }
          }
       });
       
       (map.current.getSource("route-lines") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: activeClippedFeatures
       });
    } else {
       (map.current.getSource("route-lines") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
    }

    const selectedPointsFeatures: any[] = [];
    if (originStopId) {
       const originF = pointFeatures.find(f => String(f.properties?.id).toLowerCase().trim() === String(originStopId).toLowerCase().trim());
       if (originF) selectedPointsFeatures.push({ ...originF, properties: { ...originF.properties, type: "origin" } });
    }
    if (destinationStopId) {
       const destF = pointFeatures.find(f => String(f.properties?.id).toLowerCase().trim() === String(destinationStopId).toLowerCase().trim());
       if (destF) selectedPointsFeatures.push({ ...destF, properties: { ...destF.properties, type: "destination" } });
    }

    if (map.current.getSource("selected-stops")) {
       (map.current.getSource("selected-stops") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: selectedPointsFeatures as any
       });
    }

  }, [graphData, originStopId, destinationStopId, itinerary, mapLoaded]);

  return (
    <div className="absolute inset-0 z-0 w-full h-full">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
