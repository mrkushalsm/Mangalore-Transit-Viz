"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { TransitGeoJSON, BusStopFeature, RouteFeature, findNearestStop, computeSpiderWeb } from "@/lib/graph";
import { useTransitState } from "@/hooks/useTransitState";

// NOTE: We need a public Mapbox token. The user didn't specify one, so we are omitting it 
// or expecting the user to provide it. For now we use a dummy or let the user inject it.
// mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.dummy";

interface MapComponentProps {
  graphData: TransitGeoJSON | null;
  mapboxToken: string;
}

export default function MapComponent({ graphData, mapboxToken }: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const { state, isLoaded, updateCenterZoom, setSelectedStopId } = useTransitState();
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
  }, [mapboxToken]);

  const graphDataRef = useRef(graphData);
  useEffect(() => {
    graphDataRef.current = graphData;
  }, [graphData]);

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
          "line-color": "#bfdbfe", // Light blue transfer lines
          "line-width": 3,
          "line-dasharray": [2, 4],
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
          "line-color": "#06b6d4", // Cyan direct lines
          "line-width": 5,
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

      // Add all stops base layer
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
          "circle-color": "#e4e4e7", // zinc-200
          "circle-stroke-width": 1,
          "circle-stroke-color": "#18181b", // zinc-900 border
        },
      });

      // Click event for origin stop
      map.current.on("click", (e) => {
        if (!graphDataRef.current) {
           console.log("Click ignored: graphDataRef is null or empty");
           return;
        }
        console.log("Clicked at:", e.lngLat.lng, e.lngLat.lat);
        const nearest = findNearestStop(e.lngLat.lng, e.lngLat.lat, graphDataRef.current);
        console.log("Nearest stop found:", nearest?.properties?.name, "Distance check passed?", !!nearest);
        
        if (nearest) {
          setSelectedStopId(nearest.properties.id);
        }
      });
      
      // Change cursor on hover over stops
      map.current.on('mouseenter', 'all-stops-points', () => {
         if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', 'all-stops-points', () => {
         if (map.current) map.current.getCanvas().style.cursor = '';
      });
      
      setMapLoaded(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isLoaded, mapboxToken]); // run only once when token and state is loaded

  // Update Map Data when Graph or Selected Stop changes
  useEffect(() => {
    if (!map.current || !graphData || !mapLoaded || !map.current.isStyleLoaded()) return;

    // We can just filter out only the Points to send to the stops layers
    const pointFeatures = graphData.features.filter(f => f.geometry.type === 'Point');

    const allStopsSource = map.current.getSource("all-stops") as mapboxgl.GeoJSONSource;
    console.log("allStopsSource found:", !!allStopsSource, "points:", pointFeatures.length);
    if (allStopsSource) {
      allStopsSource.setData({
        type: "FeatureCollection",
        features: pointFeatures as any,
      });
    }

    const stopsSource = map.current.getSource("stops") as mapboxgl.GeoJSONSource;
    if (stopsSource) {
      stopsSource.setData({
         type: "FeatureCollection",
         features: pointFeatures as any,
      });
    }

    if (state.selectedStopId && map.current.getSource("level1-routes")) {
      const web = computeSpiderWeb(state.selectedStopId, graphData);
      
      if (web) {
        if (web.level1Routes.length > 0) {
          (map.current.getSource('level1-routes') as mapboxgl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: web.level1Routes as any
          });
        }

        if (web.level2Routes.length > 0) {
          (map.current.getSource('level2-routes') as mapboxgl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: web.level2Routes as any
          });
        }
      }
    } else if (map.current.getSource("level1-routes")) {
       // Clear lines if no selection
       (map.current.getSource("level1-routes") as mapboxgl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: [] });
       (map.current.getSource("level2-routes") as mapboxgl.GeoJSONSource)?.setData({ type: "FeatureCollection", features: [] });
    }

  }, [graphData, state.selectedStopId, mapLoaded]);

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-zinc-900 text-red-400 p-4 text-center">
        Error: NEXT_PUBLIC_MAPBOX_TOKEN is missing or undefined on the client.
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0 w-full h-full">
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
