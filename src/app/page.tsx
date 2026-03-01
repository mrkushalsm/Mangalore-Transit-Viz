"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { GraphData, fetchAndParseData, computeSpiderWeb } from "@/lib/graph";
import { HUD } from "@/components/HUD";
import { useTransitState } from "@/hooks/useTransitState";

// Dynamically import MapComponent to avoid SSR issues with Mapbox GL JS window references
const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function Home() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWalkingEnabled, setIsWalkingEnabled] = useState(false);
  
  const { state } = useTransitState();

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

  const spiderWeb = (graphData && state.selectedStopId) 
    ? computeSpiderWeb(state.selectedStopId, graphData) 
    : null;

  return (
    <main className="relative w-full h-screen overflow-hidden bg-zinc-950">
      
      {/* HUD Layer */}
      <div className="absolute top-4 left-4 z-20 pointer-events-auto">
        <HUD 
          spiderWeb={spiderWeb} 
          isWalkingEnabled={isWalkingEnabled}
          onWalkingToggle={setIsWalkingEnabled}
        />
      </div>

      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
           <div className="text-cyan-400 animate-pulse font-medium tracking-widest uppercase">
              Initializing Transit Engine...
           </div>
        </div>
      )}

      {/* Mapbox Layer */}
      {/* Note: You must provide a valid NEXT_PUBLIC_MAPBOX_TOKEN in your .env.local */}
      <MapComponent 
         graphData={graphData} 
         mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ""} 
      />

    </main>
  );
}
