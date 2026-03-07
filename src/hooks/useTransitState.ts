import { useState, useEffect } from "react";

interface TransitState {
    center: [number, number]; // [lng, lat]
    zoom: number;
    originStopId: string | null;
    destinationStopId: string | null;
}

const DEFAULT_STATE: TransitState = {
    center: [74.85, 12.87], // Mangalore center
    zoom: 12,
    originStopId: null,
    destinationStopId: null,
};

const STORAGE_KEY = "mangalore-transit-viz-state-v2";

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

    const setOriginStopId = (id: string | null) => {
        setState((s) => ({ ...s, originStopId: id }));
    };

    const setDestinationStopId = (id: string | null) => {
        setState((s) => ({ ...s, destinationStopId: id }));
    };

    const clearSelection = () => {
        setState((s) => ({ ...s, originStopId: null, destinationStopId: null }));
    };

    return {
        state,
        isLoaded,
        updateCenterZoom,
        setOriginStopId,
        setDestinationStopId,
        clearSelection,
    };
}
