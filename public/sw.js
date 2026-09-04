// public/sw.js

const CACHE_NAME = "aerostation-hub-v5";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/aerostation-icon.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

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

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = {
        body: event.data ? event.data.text() : "",
      };
    } catch {
      payload = {};
    }
  }

  const data = payload?.data || payload || {};

  const title =
    payload?.notification?.title ||
    data.title ||
    "AeroStation Hub";

  const body =
    payload?.notification?.body ||
    data.body ||
    "You have a new notification.";

  const targetUrl =
    data.url ||
    data.link ||
    "/dashboard";

  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      url: targetUrl,
      ...data,
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url ||
    "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then(async (clients) => {
        for (const client of clients) {
          try {
            if ("navigate" in client) {
              await client.navigate(targetUrl);
            }

            if ("focus" in client) {
              return client.focus();
            }
          } catch (error) {
            console.warn(
              "Could not focus existing AeroStation Hub window:",
              error
            );
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }

        return null;
      })
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

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
                    <h1 style="margin-bottom:8px;">AeroStation Hub</h1>
                    <p style="opacity:.8;">You appear to be offline.</p>
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

// END sw.js
