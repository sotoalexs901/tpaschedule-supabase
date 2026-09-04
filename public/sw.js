// public/sw.js

const CACHE_NAME = "aerostation-hub-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/aerostation-icon.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ============================================================
// INSTALL
// ============================================================

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => {
        console.error("AeroStation Hub cache install error:", error);
      })
  );
});

// ============================================================
// ACTIVATE
// ============================================================

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ============================================================
// MESSAGES FROM APP
// ============================================================

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data === "CLEAR_APP_CACHE") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(keys.map((key) => caches.delete(key)))
        )
    );
  }
});

// ============================================================
// FETCH
// ============================================================

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Do not interfere with Firebase, APIs or external resources.
  if (url.origin !== self.location.origin) {
    return;
  }

  // ----------------------------------------------------------
  // NAVIGATION
  // Always try the latest AeroStation Hub version first.
  // If offline, use cached index.html.
  // ----------------------------------------------------------

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, {
        cache: "no-store",
      })
        .then((response) => {
          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then((cache) =>
              cache.put("/index.html", copy)
            )
            .catch(() => {});

          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match("/index.html")) ||
            (await caches.match("/"));

          if (cached) {
            return cached;
          }

          return new Response(
            `
              <!doctype html>
              <html>
                <head>
                  <meta charset="UTF-8" />
                  <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1"
                  />
                  <title>AeroStation Hub</title>
                </head>

                <body
                  style="
                    margin:0;
                    min-height:100vh;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    background:#0b1120;
                    color:white;
                    font-family:system-ui,sans-serif;
                    text-align:center;
                    padding:24px;
                    box-sizing:border-box;
                  "
                >
                  <div>
                    <h1 style="margin-bottom:8px;">
                      AeroStation Hub
                    </h1>

                    <p style="opacity:.8;">
                      You appear to be offline.
                    </p>

                    <p style="opacity:.65;font-size:14px;">
                      Reconnect to the internet and open AeroStation Hub again.
                    </p>
                  </div>
                </body>
              </html>
            `,
            {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
              },
            }
          );
        })
    );

    return;
  }

  // ----------------------------------------------------------
  // VITE ASSETS
  // Vite normally generates versioned filenames.
  // Cache-first is safe and makes the installed app faster.
  // ----------------------------------------------------------

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }

          const copy = response.clone();

          caches
            .open(CACHE_NAME)
            .then((cache) =>
              cache.put(request, copy)
            )
            .catch(() => {});

          return response;
        });
      })
    );

    return;
  }

  // ----------------------------------------------------------
  // MANIFEST / SERVICE WORKER / VERSION
  // These should always check the server first.
  // ----------------------------------------------------------

  if (
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/version.json" ||
    url.pathname === "/sw.js"
  ) {
    event.respondWith(
      fetch(request, {
        cache: "no-store",
      }).catch(() => caches.match(request))
    );

    return;
  }

  // ----------------------------------------------------------
  // ICONS / OTHER STATIC FILES
  // Network first, cache as fallback.
  // ----------------------------------------------------------

  event.respondWith(
    fetch(request, {
      cache: "no-store",
    })
      .then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }

        const copy = response.clone();

        caches
          .open(CACHE_NAME)
          .then((cache) =>
            cache.put(request, copy)
          )
          .catch(() => {});

        return response;
      })
      .catch(() => caches.match(request))
  );
});
