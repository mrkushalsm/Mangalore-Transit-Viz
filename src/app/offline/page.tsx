"use client";

export default function OfflinePage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-50">
      <div className="text-center space-y-4 px-6">
        <div className="text-5xl">🚌</div>
        <h1 className="text-2xl font-bold text-cyan-400">You&apos;re Offline</h1>
        <p className="text-zinc-400 max-w-sm">
          Mangalore Transit Viz needs an internet connection for map tiles and route data.
          Please reconnect and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors font-medium"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
