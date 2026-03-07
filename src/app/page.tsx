"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { TransitGeoJSON, fetchAndParseData, computeAllPaths, TripItinerary } from "@/lib/graph";
import { HUD } from "@/components/HUD";
import { useTransitState } from "@/hooks/useTransitState";

// Dynamically import MapComponent to avoid SSR issues with Mapbox GL JS window references
const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function Home() {
  const [graphData, setGraphData] = useState<TransitGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const { state, setOriginStopId, setDestinationStopId, clearSelection } = useTransitState();

  useEffect(() => {
    async function initData() {
      try {
        const data = await fetchAndParseData();
        setGraphData(data);
      } catch (e) {
        console.error("Failed to fetch graph data", e);
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, []);

  const itineraries: TripItinerary[] = (graphData && state.originStopId && state.destinationStopId) 
    ? computeAllPaths(state.originStopId, state.destinationStopId, graphData) 
    : [];

  const handleClearSelection = () => {
     setSelectedIndex(0);
     clearSelection();
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-zinc-950">
      
      {/* HUD Layer */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <HUD 
          itineraries={itineraries}
          selectedIndex={selectedIndex}
          onSelectRoute={setSelectedIndex}
          originStopId={state.originStopId}
          destinationStopId={state.destinationStopId}
          onClearSelection={handleClearSelection}
          setOriginStopId={setOriginStopId}
          setDestinationStopId={setDestinationStopId}
          allStops={
            graphData?.features
              .filter(f => f.geometry.type === 'Point')
              .map(f => ({ id: String(f.properties.id), name: String(f.properties.name) }))
              .sort((a, b) => a.name.localeCompare(b.name)) || []
          }
        />
      </div>

      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
           <div className="text-cyan-400 animate-pulse font-medium tracking-widest uppercase">
              Initializing Transit Engine...
           </div>
        </div>
      )}

      {/* MapLibre Layer */}
      <MapComponent 
         graphData={graphData}
         originStopId={state.originStopId}
         destinationStopId={state.destinationStopId}
         itinerary={itineraries[selectedIndex] || null}
         setOriginStopId={setOriginStopId}
         setDestinationStopId={setDestinationStopId}
         clearSelection={handleClearSelection}
      />

    </main>
  );
}
