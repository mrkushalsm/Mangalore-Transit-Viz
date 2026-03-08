import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  buildExcludes: [/middleware-manifest\.json$/],
  cacheOnFrontEndNav: true,
  dynamicStartUrlRedirect: true,
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      // Cache CARTO map tiles for offline use
      urlPattern: /^https:\/\/.*\.cartocdn\.com\//,
      handler: "CacheFirst",
      options: {
        cacheName: "carto-tiles",
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      // Cache MapLibre style JSON
      urlPattern: /style\.json$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "map-styles",
        expiration: {
          maxEntries: 5,
          maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/api\.mapbox\.com\//,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "mapbox-api",
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
        },
      },
    },
    {
      urlPattern: /^https:\/\/raw\.githubusercontent\.com\//,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "github-raw-data",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24, // 1 day
        },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        },
      },
    },
    {
      // Cache JS and CSS bundles
      urlPattern: /\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        },
      },
    },
    {
      // Cache fonts
      urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "fonts",
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
