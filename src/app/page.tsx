"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TransitGeoJSON, fetchAndParseData, computeAllPaths, TripItinerary } from "@/lib/graph";
import { HUD } from "@/components/HUD";
import { useTransitState } from "@/hooks/useTransitState";

// Dynamically import MapComponent to avoid SSR issues with Mapbox GL JS window references
const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

function SearchParamsWrapper({ 
  graphData, 
  selectedIndex, 
  setSelectedIndex, 
  state, 
  setOriginStopId, 
  setDestinationStopId, 
  clearSelection 
}: any) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Sync from URL to State on mount or URL change
  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const idx = searchParams.get("idx");

    if (from && from !== state.originStopId) setOriginStopId(from);
    if (to && to !== state.destinationStopId) setDestinationStopId(to);
    if (idx) {
      const parsedIdx = parseInt(idx, 10);
      if (!isNaN(parsedIdx) && parsedIdx !== selectedIndex) {
        setSelectedIndex(parsedIdx);
      }
    }
  }, [searchParams]);

  // Sync from State to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    
    let changed = false;
    if (state.originStopId) {
      if (params.get("from") !== state.originStopId) {
        params.set("from", state.originStopId);
        changed = true;
      }
    } else if (params.has("from")) {
      params.delete("from");
      changed = true;
    }

    if (state.destinationStopId) {
      if (params.get("to") !== state.destinationStopId) {
        params.set("to", state.destinationStopId);
        changed = true;
      }
    } else if (params.has("to")) {
      params.delete("to");
      changed = true;
    }

    if (selectedIndex !== 0) {
      if (params.get("idx") !== String(selectedIndex)) {
        params.set("idx", String(selectedIndex));
        changed = true;
      }
    } else if (params.has("idx")) {
      params.delete("idx");
      changed = true;
    }

    if (changed) {
      router.push(`${pathname}?${params.toString()}`);
    }
  }, [state.originStopId, state.destinationStopId, selectedIndex, pathname, router, searchParams]);

  return null;
}

export default function Home() {
  const [graphData, setGraphData] = useState<TransitGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const { state, setOriginStopId, setDestinationStopId, clearSelection } = useTransitState();

  // Initialize data
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

  const handleSelectRoute = (idx: number) => {
    setSelectedIndex(idx);
  };

  return (
    <main className="relative w-full h-screen overflow-hidden bg-zinc-950">
      
      <Suspense fallback={null}>
        <SearchParamsWrapper 
          state={state}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          setOriginStopId={setOriginStopId}
          setDestinationStopId={setDestinationStopId}
          clearSelection={clearSelection}
        />
      </Suspense>

      {/* HUD Layer */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <HUD 
          itineraries={itineraries}
          selectedIndex={selectedIndex}
          onSelectRoute={handleSelectRoute}
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
