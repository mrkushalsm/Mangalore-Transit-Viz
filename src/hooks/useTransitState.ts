import { useState, useEffect } from "react";
import { BusStop, SpiderWeb } from "@/lib/graph";

interface TransitState {
    center: [number, number]; // [lng, lat]
    zoom: number;
    selectedStopId: string | null;
}

const DEFAULT_STATE: TransitState = {
    center: [74.85, 12.87], // Mangalore center
    zoom: 12,
    selectedStopId: null,
};

const STORAGE_KEY = "kudlareach-transit-state";

export function useTransitState() {
    const [state, setState] = useState<TransitState>(DEFAULT_STATE);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setState(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load transit state", e);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        }
    }, [state, isLoaded]);

    const updateCenterZoom = (center: [number, number], zoom: number) => {
        setState((s) => ({ ...s, center, zoom }));
    };

    const setSelectedStopId = (id: string | null) => {
        setState((s) => ({ ...s, selectedStopId: id }));
    };

    return {
        state,
        isLoaded,
        updateCenterZoom,
        setSelectedStopId,
    };
}
