// Trabajador de la prueba: guarda la página y la sirve sin red. Su alcance
// es solo esta carpeta; no intercepta nada de la app real.
'use strict';

const CACHE = 'prueba-offline-v1';
const ARCHIVOS = ['./', 'index.html', 'app.js', 'manifest.json', 'icon-180.png'];

self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches.keys()
			.then((k) => Promise.all(k.filter((n) => n.startsWith('prueba-offline-') && n !== CACHE).map((n) => caches.delete(n))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e) => {
	if (e.request.method !== 'GET') return;
	const url = new URL(e.request.url);
	// La comprobación de señal debe llegar a la red de verdad.
	if (url.searchParams.has('red')) return;
	e.respondWith(
		caches.match(e.request, { ignoreSearch: true }).then(
			(guardado) => guardado ?? fetch(e.request).catch(() => caches.match('index.html'))
		)
	);
});
