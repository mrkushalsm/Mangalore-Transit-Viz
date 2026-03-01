"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { GraphData, BusStop, SpiderWeb, findNearestStop, computeSpiderWeb } from "@/lib/graph";
import { useTransitState } from "@/hooks/useTransitState";

// NOTE: We need a public Mapbox token. The user didn't specify one, so we are omitting it 
// or expecting the user to provide it. For now we use a dummy or let the user inject it.
// mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.dummy";

interface MapComponentProps {
  graphData: GraphData | null;
  mapboxToken: string;
}

export default function MapComponent({ graphData, mapboxToken }: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const { state, isLoaded, updateCenterZoom, setSelectedStopId } = useTransitState();
  const [spiderWeb, setSpiderWeb] = useState<SpiderWeb | null>(null);

  useEffect(() => {
    if (!mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
  }, [mapboxToken]);

  // Initialize Map (Singleton pattern per component lifecycle)
  useEffect(() => {
    if (!isLoaded || !mapContainer.current || !mapboxToken || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: state.center,
      zoom: state.zoom,
    });

    map.current.on("moveend", () => {
      if (!map.current) return;
      const center = map.current.getCenter();
      updateCenterZoom([center.lng, center.lat], map.current.getZoom());
    });

    map.current.on("load", () => {
      if (!map.current) return;

      // Add sources
      map.current.addSource("stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.current.addSource("level1-routes", {
         type: "geojson",
         data: { type: "FeatureCollection", features: [] },
      });

      map.current.addSource("level2-routes", {
         type: "geojson",
         data: { type: "FeatureCollection", features: [] },
      });

      // Add Layers
      map.current.addLayer({
        id: "level2-lines",
        type: "line",
         source: "level2-routes",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#ff00ff", // Magenta
          "line-width": 3,
          "line-dasharray": [0, 4, 3],
          "line-opacity": 0.6,
        },
      });

      map.current.addLayer({
        id: "level1-lines",
        type: "line",
        source: "level1-routes",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#00ffff", // Neon Cyan
          "line-width": 4,
          "line-dasharray": [0, 4, 3],
          "line-opacity": 0.9,
        },
      });

      map.current.addLayer({
        id: "stops-layer",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": 4,
          "circle-color": "#ffffff",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#000000",
        },
      });

      // Click event for origin stop
      map.current.on("click", (e) => {
        if (!graphData) return;
        const nearest = findNearestStop(e.lngLat.lng, e.lngLat.lat, graphData.stops);
        if (nearest) {
          setSelectedStopId(nearest.id);
        }
      });
      
      // Initial render if state had a selected stop
      if (state.selectedStopId && graphData) {
         // trigger update (effect below will catch it)
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isLoaded, mapboxToken]); // run only once when token and state is loaded

  // Update Map Data when Graph or Selected Stop changes
  useEffect(() => {
    if (!map.current || !graphData || !map.current.isStyleLoaded()) return;

    // Plot all stops
    const stopFeatures = Object.values(graphData.stops).map((stop) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [stop.lng, stop.lat] },
      properties: { id: stop.id, name: stop.name },
    }));

    (map.current.getSource("stops") as mapboxgl.GeoJSONSource)?.setData({
       type: "FeatureCollection",
       features: stopFeatures,
    });

    if (state.selectedStopId) {
      const web = computeSpiderWeb(state.selectedStopId, graphData);
      setSpiderWeb(web);
      
      if (web) {
        // Construct LineStrings for Level 1 routes
        const l1Features = web.level1Routes.map((route) => {
          const coords = route.stops.map(sid => {
            const s = graphData.stops[sid];
            return [s.lng, s.lat];
          });
          return {
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: coords },
            properties: { id: route.id, name: route.name }
          }
        });
        (map.current.getSource("level1-routes") as mapboxgl.GeoJSONSource)?.setData({
          type: "FeatureCollection",
          features: l1Features,
        });

        // Construct LineStrings for Level 2 routes
        const l2Features = web.level2Routes.map((route) => {
          const coords = route.stops.map(sid => {
            const s = graphData.stops[sid];
            return [s.lng, s.lat];
          });
          return {
            type: "Feature" as const,
            geometry: { type: "LineString" as const, coordinates: coords },
            properties: { id: route.id, name: route.name }
          }
        });
        (map.current.getSource("level2-routes") as mapboxgl.GeoJSONSource)?.setData({
          type: "FeatureCollection",
          features: l2Features,
        });

        // Add Animation here using requestAnimationFrame to shift the dasharray if desired, 
        // to implement the "flow outward" effect later.
        
        const animateDashArray = () => {
          if (!map.current) return;
          const step = (Date.now() / 50) % 7;
          
          if (map.current.getLayer("level1-lines")) {
            map.current.setPaintProperty("level1-lines", "line-dasharray", [step, 4, 3]);
          }
          if (map.current.getLayer("level2-lines")) {
            map.current.setPaintProperty("level2-lines", "line-dasharray", [step, 4, 3]);
          }
          
          animationFrameId.current = requestAnimationFrame(animateDashArray);
        };
        
        if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        animateDashArray();

      }
    } else {
       // Clear lines if no selection
       (map.current.getSource("level1-routes") as mapboxgl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: [] });
       (map.current.getSource("level2-routes") as mapboxgl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: [] });
       setSpiderWeb(null);
       if (animationFrameId.current) {
         cancelAnimationFrame(animationFrameId.current);
         animationFrameId.current = null;
       }
    }

  }, [graphData, state.selectedStopId, map.current]);

  useEffect(() => {
    return () => {
       if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />
      {spiderWeb && (
         <div className="absolute top-4 left-4 z-10 pointer-events-none">
           {/* HUD component will go here or be passed spiderWeb state in parent */}
         </div>
      )}
    </div>
  );
}
