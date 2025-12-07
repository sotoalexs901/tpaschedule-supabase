// public/sw.js

// Se instala el SW
self.addEventListener("install", (event) => {
  console.log("Service worker instalado.");
  self.skipWaiting();
});

// Se activa el SW
self.addEventListener("activate", (event) => {
  console.log("Service worker activo.");
  clients.claim();
});

// Por ahora NO interceptamos nada
self.addEventListener("fetch", () => {
  // Puedes implementar cache en una fase futura
});
