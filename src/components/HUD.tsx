import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SpiderWeb } from "@/lib/graph";
import { Activity, Footprints, Route } from "lucide-react";

interface HUDProps {
  spiderWeb: SpiderWeb | null;
  isWalkingEnabled: boolean;
  onWalkingToggle: (enabled: boolean) => void;
}

export function HUD({ spiderWeb, isWalkingEnabled, onWalkingToggle }: HUDProps) {
  if (!spiderWeb) {
    return (
      <Card className="w-80 backdrop-blur-md bg-zinc-950/80 border-zinc-800 shadow-xl overflow-hidden shadow-cyan-900/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl text-zinc-100 flex items-center gap-2">
            <Activity className="text-cyan-400 w-5 h-5" />
            Transit Engine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400">Click any stop to begin routing.</p>
        </CardContent>
      </Card>
    );
  }

  // Simple Mock Stats
  const l1Count = spiderWeb.level1Routes.length;
  const l2Count = spiderWeb.level2Routes.length;
  const efficiency = Math.min(100, Math.round((l1Count + l2Count) / 2 * 10));

  return (
    <Card className="w-80 backdrop-blur-md bg-zinc-950/80 border-zinc-800 shadow-xl overflow-hidden shadow-cyan-900/20 transition-all duration-300">
      <CardHeader className="pb-2 border-b border-zinc-800/50">
        <div className="flex justify-between items-start">
          <CardTitle className="text-xl text-zinc-100 flex items-center gap-2">
             <Route className="text-cyan-400 w-5 h-5" />
             {spiderWeb.origin.name}
          </CardTitle>
          <Badge variant="outline" className="border-cyan-500/30 text-cyan-300 bg-cyan-500/10">
            {efficiency}% Efficiency
          </Badge>
        </div>
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
