import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Navigation, MapPin, Route, X, Maximize2, Check, ChevronsUpDown } from "lucide-react";
import { TripItinerary } from "@/lib/graph";
import { ROUTE_COLORS } from "./MapComponent";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Stop {
  id: string;
  name: string;
}

interface HUDProps {
  itineraries: TripItinerary[];
  selectedIndex: number;
  onSelectRoute: (index: number) => void;
  originStopId: string | null;
  destinationStopId: string | null;
  onClearSelection?: () => void;
  setOriginStopId: (id: string | null) => void;
  setDestinationStopId: (id: string | null) => void;
  allStops: Stop[];
}

export function HUD({ 
  itineraries, 
  selectedIndex, 
  onSelectRoute, 
  originStopId, 
  destinationStopId, 
  onClearSelection,
  setOriginStopId,
  setDestinationStopId,
  allStops
}: HUDProps) {
  const [openOrigin, setOpenOrigin] = useState(false);
  const [openDest, setOpenDest] = useState(false);
  
  // Group itineraries by transfer count
  const groups = itineraries.reduce((acc, it, idx) => {
    const transfers = it.legs.length - 1;
    if (!acc[transfers]) acc[transfers] = [];
    acc[transfers].push({ itinerary: it, originalIndex: idx });
    return acc;
  }, {} as Record<number, { itinerary: TripItinerary, originalIndex: number }[]>);

  const transferLevels = Object.keys(groups).map(Number).sort((a, b) => a - b);
  const [activeTab, setActiveTab] = useState<number>(transferLevels[0] ?? 0);

  // If activeTab is no longer valid (e.g. data changed), reset it
  if (transferLevels.length > 0 && !transferLevels.includes(activeTab)) {
    setActiveTab(transferLevels[0]);
  }

  const activeItinerary = itineraries[selectedIndex] || null;
  const originName = activeItinerary?.origin.properties.name || originStopId;
  const destName = activeItinerary?.destination.properties.name || destinationStopId;

  // Render a Stop combobox
  const StopSelector = ({ 
    value, 
    onChange, 
    open, 
    setOpen, 
    placeholder,
    icon: Icon,
    iconColor
  }: { 
    value: string | null, 
    onChange: (val: string) => void, 
    open: boolean, 
    setOpen: (o: boolean) => void,
    placeholder: string,
    icon: any,
    iconColor: string
  }) => {
    const selectedStop = allStops.find(s => s.id === value || s.name === value);
    
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800/80 hover:text-white"
          >
            <div className="flex items-center gap-2 truncate">
              <Icon className={cn("w-4 h-4 shrink-0", iconColor)} />
              <span className="truncate">{selectedStop ? selectedStop.name : placeholder}</span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 border-zinc-800 bg-zinc-950 align-start" align="start">
          <Command className="bg-zinc-950">
            <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} className="text-zinc-300" />
            <CommandList className="custom-scrollbar">
              <CommandEmpty>No stop found.</CommandEmpty>
              <CommandGroup>
                {allStops.map((stop) => (
                  <CommandItem
                    key={stop.id}
                    value={stop.name}
                    onSelect={(currentValue) => {
                      onChange(stop.id);
                      setOpen(false);
                    }}
                    className="text-zinc-300 aria-selected:bg-zinc-800 aria-selected:text-white cursor-pointer"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === stop.id || value === stop.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {stop.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  const renderRouteTimeline = (itinerary: TripItinerary) => {
      const getStopName = (id: string) => allStops.find(s => s.id === id)?.name || id;

      return (
          <div className="bg-zinc-950/40 rounded-lg border border-zinc-800/50 p-3 space-y-3 mt-2 animate-in fade-in zoom-in-95 duration-200">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 focus:outline-none">
                <Navigation className="w-3.5 h-3.5" /> Directions
            </h4>
            <ul className="space-y-4 relative before:absolute before:inset-0 before:ml-1 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-px before:bg-zinc-800/50">
                {itinerary.legs.map((leg, i) => {
                  const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
                  return (
                    <li key={`leg-${i}`} className="relative pl-6 text-sm mb-2">
                        <span 
                          className="absolute flex items-center justify-center w-2.5 h-2.5 rounded-full -left-px top-1.5 ring-4 ring-zinc-950/50"
                          style={{ backgroundColor: color }}
                        ></span>
                        <div className="font-medium text-zinc-200 flex items-center gap-2 mb-1.5 flex-wrap">
                          Take 
                          <Badge 
                              variant="outline" 
                              className="text-white border-transparent shadow-sm whitespace-normal text-left h-auto max-w-full"
                              style={{ backgroundColor: color }}
                          >
                              {leg.routeName}
                          </Badge>
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">Board: {getStopName(leg.fromStopId)}</div>
                        <div className="text-xs text-zinc-400">Alight: {getStopName(leg.toStopId)}</div>
                    </li>
                  );
                })}
                <li className="relative pl-6 text-sm pt-1">
                  <span className="absolute flex items-center justify-center w-2.5 h-2.5 bg-red-500 rounded-full -left-px top-2 ring-4 ring-zinc-950/50"></span>
                  <div className="font-medium text-zinc-300">Arrive at {itinerary.destination.properties.name}</div>
                </li>
            </ul>
          </div>
      );
  };

  return (
    <Card className="w-80 md:w-96 backdrop-blur-md bg-zinc-950/80 border-zinc-800 shadow-xl overflow-hidden transition-all duration-300 pointer-events-auto flex flex-col max-h-[90vh]">
      <CardHeader className="pb-4 relative border-b border-zinc-800/50">
         <div className="flex items-center justify-between">
           <CardTitle className="text-xl font-bold flex items-center gap-2 text-zinc-100">
             <Route className="text-cyan-400 w-5 h-5" />
             Journey Planner
           </CardTitle>
           {(originStopId || destinationStopId) && onClearSelection && (
             <button 
               onClick={onClearSelection}
               className="text-zinc-500 hover:text-red-400 transition-colors bg-zinc-900/50 hover:bg-zinc-800 p-1.5 rounded-full"
               title="Clear selection"
             >
               <X className="w-4 h-4" />
             </button>
           )}
         </div>
         <div className="pt-4 space-y-2">
            <StopSelector 
              value={originStopId} 
              onChange={setOriginStopId} 
              open={openOrigin} 
              setOpen={setOpenOrigin} 
              placeholder="Select Origin" 
              icon={MapPin}
              iconColor="text-green-400"
            />
            <StopSelector 
              value={destinationStopId} 
              onChange={setDestinationStopId} 
              open={openDest} 
              setOpen={setOpenDest} 
              placeholder="Select Destination" 
              icon={MapPin}
              iconColor="text-red-500"
            />
         </div>
      </CardHeader>
      
      {transferLevels.length > 0 && (
        <div className="bg-zinc-900/30 px-4 py-2 flex items-center gap-1 border-b border-zinc-800/50">
          {transferLevels.map(level => (
            <button
              key={level}
              onClick={() => setActiveTab(level)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-2",
                activeTab === level 
                  ? "bg-zinc-800 text-cyan-400 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              {level === 0 ? "Direct" : `${level} Transfer${level > 1 ? 's' : ''}`}
              <span className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px]",
                activeTab === level ? "bg-cyan-500/20 text-cyan-400" : "bg-zinc-800 text-zinc-600"
              )}>
                {groups[level].length}
              </span>
            </button>
          ))}
        </div>
      )}

      <CardContent className="pt-2 pb-4 space-y-4 overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
        {itineraries.length === 0 && originStopId && destinationStopId && (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm italic">No routes found between these locations.</p>
          </div>
        )}

        {itineraries.length > 0 && (
           <div className="space-y-2">
              <div className="flex flex-col gap-2">
                 {groups[activeTab]?.map(({ itinerary, originalIndex }) => {
                    const isSelected = originalIndex === selectedIndex;
                    const transferCount = itinerary.legs.length - 1;
                    const isDirect = transferCount === 0;

                    return (
                        <div 
                           key={`option-${originalIndex}`} 
                           className={`p-2 rounded-lg border transition-all cursor-pointer ${
                              isSelected 
                                 ? 'bg-zinc-800/80 border-cyan-500/50 shadow-[0_0_15px_-3px_rgba(6,182,212,0.1)]' 
                                 : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700'
                           }`}
                           onClick={() => onSelectRoute(originalIndex)}
                        >
                           <div className="flex items-center justify-between">
                               <div className="flex flex-col gap-1.5 pr-2">
                                   <div className="flex items-center flex-wrap gap-1">
                                       {itinerary.legs.map((leg, legIdx) => (
                                           <div key={legIdx} className="flex items-center gap-1">
                                               <Badge 
                                                  variant="outline" 
                                                  className="text-white border-transparent text-[11px] px-2 py-0.5 shadow-sm whitespace-normal text-left h-auto max-w-full"
                                                  style={{ backgroundColor: ROUTE_COLORS[legIdx % ROUTE_COLORS.length] }}
                                               >
                                                  {leg.routeName}
                                               </Badge>
                                               {legIdx < itinerary.legs.length - 1 && (
                                                   <span className="text-zinc-500 mx-0.5 text-xs">→</span>
                                               )}
                                           </div>
                                       ))}
                                   </div>
                               </div>
                               {!isSelected && (
                                   <div className="shrink-0">
                                     <ChevronDown className="w-4 h-4 text-zinc-600" />
                                   </div>
                               )}
                           </div>
                           
                           {isSelected && renderRouteTimeline(itinerary)}
                        </div>
                    );
                 })}
              </div>
           </div>
        )}
      </CardContent>
    </Card>
  );
}
