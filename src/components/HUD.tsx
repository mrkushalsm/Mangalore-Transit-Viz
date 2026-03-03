import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SpiderWebGeo } from "@/lib/graph";
import { Activity, Route, MapPin, Footprints, X } from "lucide-react";

interface HUDProps {
  spiderWeb: SpiderWebGeo | null;
  isWalkingEnabled: boolean;
  onWalkingToggle: () => void;
  onClearSelection?: () => void;
}

export function HUD({ spiderWeb, isWalkingEnabled, onWalkingToggle, onClearSelection }: HUDProps) {
  const originName = spiderWeb?.origin.properties.name || "Select a stop";
  const l1Count = spiderWeb?.level1Routes.length || 0;
  const l2Count = spiderWeb?.level2Routes.length || 0;
  const totalPaths = l1Count + l2Count;
  
  // Fictional efficiency metric to look cool (Direct vs Transfer ratio)
  const efficiency = totalPaths > 0 
    ? Math.round((l1Count / totalPaths) * 100) 
    : 0;

  return (
    <Card className="w-80 backdrop-blur-md bg-zinc-950/80 border-zinc-800 shadow-xl overflow-hidden shadow-cyan-900/20 transition-all duration-300">
      <CardHeader className="pb-4 relative">
         <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500 rounded-l-md" />
         <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent pointer-events-none" />
         <div className="flex items-center justify-between">
           <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
             <Activity className="text-cyan-400" />
             Transit Engine
           </CardTitle>
           {spiderWeb && onClearSelection && (
             <button 
               onClick={onClearSelection}
               className="text-zinc-500 hover:text-red-400 transition-colors bg-zinc-900/50 hover:bg-zinc-800 p-1.5 rounded-full"
               title="Clear selection"
             >
               <X className="w-4 h-4" />
             </button>
           )}
         </div>
         <CardDescription className="text-zinc-400 pt-2 text-sm flex items-start gap-1.5">
            <Route className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="truncate">{originName}</span>
         </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Direct Routes</span>
            <div className="text-2xl font-bold text-cyan-400">{l1Count}</div>
          </div>
          <div className="space-y-1">
            <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Transfers</span>
            <div className="text-2xl font-bold text-fuchsia-400">{l2Count}</div>
          </div>
        </div>

        <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <Footprints className="text-zinc-400 w-4 h-4" />
             <span className="text-sm text-zinc-300 font-medium">Walking Radius</span>
          </div>
          <Switch 
            checked={isWalkingEnabled} 
            onCheckedChange={onWalkingToggle} 
            className="data-[state=checked]:bg-cyan-500"
          />
        </div>

      </CardContent>
    </Card>
  );
}
