// public/sw.js

const CACHE_NAME = "aerostation-hub-v6";
const BADGE_STATE_CACHE = "aerostation-hub-badge-v1";
const BADGE_STATE_URL = "/__aerostation_badge_state__";

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
// APP BADGE HELPERS
// ============================================================

function normalizeBadgeCount(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

async function readStoredBadgeCount() {
  try {
    const cache = await caches.open(BADGE_STATE_CACHE);
    const response = await cache.match(BADGE_STATE_URL);

    if (!response) {
      return 0;
    }

    const data = await response.json();
    return normalizeBadgeCount(data?.count);
  } catch (error) {
    console.warn(
      "Could not read AeroStation Hub badge state:",
      error
    );

    return 0;
  }
}

async function writeStoredBadgeCount(value) {
  const count = normalizeBadgeCount(value);

  try {
    const cache = await caches.open(BADGE_STATE_CACHE);

    await cache.put(
      BADGE_STATE_URL,
      new Response(
        JSON.stringify({
          count,
          updatedAt: new Date().toISOString(),
        }),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }
      )
    );
  } catch (error) {
    console.warn(
      "Could not save AeroStation Hub badge state:",
      error
    );
  }

  return count;
}

async function applyAppBadge(value) {
  const count = normalizeBadgeCount(value);

  await writeStoredBadgeCount(count);

  try {
    if (count <= 0) {
      if (
        self.navigator &&
        typeof self.navigator.clearAppBadge === "function"
      ) {
        await self.navigator.clearAppBadge();
        return;
      }

      if (
        self.navigator &&
        typeof self.navigator.setAppBadge === "function"
      ) {
        await self.navigator.setAppBadge(0);
      }

      return;
    }

    if (
      self.navigator &&
      typeof self.navigator.setAppBadge === "function"
    ) {
      await self.navigator.setAppBadge(count);
    }
  } catch (error) {
    console.warn(
      "AeroStation Hub background badge unavailable:",
      error
    );
  }
}

async function incrementAppBadge() {
  const current = await readStoredBadgeCount();
  const next = current + 1;

  await applyAppBadge(next);

  return next;
}

function getPayloadBadgeCount(data) {
  const candidates = [
    data?.badgeCount,
    data?.badge_count,
    data?.unreadCount,
    data?.unread_count,
  ];

  for (const candidate of candidates) {
    if (
      candidate !== undefined &&
      candidate !== null &&
      candidate !== ""
    ) {
      const parsed = Number.parseInt(candidate, 10);

      if (
        Number.isFinite(parsed) &&
        parsed >= 0
      ) {
        return parsed;
      }
    }
  }

  return null;
}

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
        console.error(
          "AeroStation Hub cache install error:",
          error
        );
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
            .filter(
              (key) =>
                key !== CACHE_NAME &&
                key !== BADGE_STATE_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ============================================================
// MESSAGES FROM THE APP
// ============================================================

self.addEventListener("message", (event) => {
  const message = event.data;

  if (message === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (message === "CLEAR_APP_CACHE") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key !== BADGE_STATE_CACHE
              )
              .map((key) =>
                caches.delete(key)
              )
          )
        )
    );

    return;
  }

  if (
    message &&
    typeof message === "object" &&
    message.type === "AEROSTATION_BADGE_SYNC"
  ) {
    event.waitUntil(
      applyAppBadge(
        message.count
      )
    );

    return;
  }

  if (
    message &&
    typeof message === "object" &&
    message.type === "AEROSTATION_BADGE_CLEAR"
  ) {
    event.waitUntil(
      applyAppBadge(0)
    );
  }
});

// ============================================================
// PUSH
// ============================================================

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data
      ? event.data.json()
      : {};
  } catch {
    try {
      payload = {
        body: event.data
          ? event.data.text()
          : "",
      };
    } catch {
      payload = {};
    }
  }

  const data =
    payload?.data ||
    payload ||
    {};

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

  const exactBadgeCount =
    getPayloadBadgeCount(data);

  const options = {
    body,
    icon: "/icons/icon-192.png",

    // This is the notification status icon used by supported systems.
    // The numeric app-icon badge is handled separately by setAppBadge().
    badge: "/icons/icon-192.png",

    data: {
      url: targetUrl,
      ...data,
    },
  };

  if (data.tag) {
    options.tag = String(data.tag);
  }

  if (
    data.renotify === true ||
    data.renotify === "true"
  ) {
    options.renotify = true;
  }

  event.waitUntil(
    (async () => {
      try {
        if (exactBadgeCount !== null) {
          await applyAppBadge(
            exactBadgeCount
          );
        } else {
          await incrementAppBadge();
        }
      } catch (badgeError) {
        console.warn(
          "Could not update AeroStation Hub badge from Push:",
          badgeError
        );
      }

      await self.registration.showNotification(
        title,
        options
      );
    })()
  );
});

// ============================================================
// NOTIFICATION CLICK
// ============================================================

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
              await client.navigate(
                targetUrl
              );
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
          return self.clients.openWindow(
            targetUrl
          );
        }

        return null;
      })
  );
});

// ============================================================
// FETCH / OFFLINE CACHE
// ============================================================

self.addEventListener("fetch", (event) => {
  const request =
    event.request;

  if (
    request.method !== "GET"
  ) {
    return;
  }

  const url =
    new URL(
      request.url
    );

  if (
    url.origin !==
    self.location.origin
  ) {
    return;
  }

  if (
    url.pathname ===
    BADGE_STATE_URL
  ) {
    return;
  }

  if (
    request.mode ===
    "navigate"
  ) {
    event.respondWith(
      fetch(request, {
        cache: "no-store",
      })
        .then((response) => {
          const copy =
            response.clone();

          caches
            .open(CACHE_NAME)
            .then((cache) =>
              cache.put(
                "/index.html",
                copy
              )
            )
            .catch(() => {});

          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(
              "/index.html"
            )) ||
            (await caches.match(
              "/"
            ));

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

                    <p
                      style="
                        opacity:.65;
                        font-size:14px;
                      "
                    >
                      Reconnect to the internet and open
                      AeroStation Hub again.
                    </p>
                  </div>
                </body>
              </html>
            `,
            {
              headers: {
                "Content-Type":
                  "text/html; charset=utf-8",
              },
            }
          );
        })
    );

    return;
  }

  if (
    url.pathname.startsWith(
      "/assets/"
    )
  ) {
    event.respondWith(
      caches
        .match(request)
        .then((cached) => {
          if (cached) {
            return cached;
          }

          return fetch(
            request
          ).then(
            (response) => {
              if (
                !response ||
                response.status !==
                  200
              ) {
                return response;
              }

              const copy =
                response.clone();

              caches
                .open(
                  CACHE_NAME
                )
                .then(
                  (cache) =>
                    cache.put(
                      request,
                      copy
                    )
                )
                .catch(
                  () => {}
                );

              return response;
            }
          );
        })
    );

    return;
  }

  if (
    url.pathname ===
      "/manifest.webmanifest" ||
    url.pathname ===
      "/version.json" ||
    url.pathname ===
      "/sw.js"
  ) {
    event.respondWith(
      fetch(request, {
        cache: "no-store",
      }).catch(() =>
        caches.match(
          request
        )
      )
    );

    return;
  }

  event.respondWith(
    fetch(request, {
      cache: "no-store",
    })
      .then((response) => {
        if (
          !response ||
          response.status !== 200
        ) {
          return response;
        }

        const copy =
          response.clone();

        caches
          .open(CACHE_NAME)
          .then((cache) =>
            cache.put(
              request,
              copy
            )
          )
          .catch(() => {});

        return response;
      })
      .catch(() =>
        caches.match(
          request
        )
      )
  );
});

// END sw.
