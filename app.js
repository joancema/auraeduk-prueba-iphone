// Prueba aislada: ¿una web instalada en el iPhone abre sin señal y conserva
// sus datos? Sin datos reales, sin servidor y sin relación con la app.
'use strict';

const VERSION = '1';
const CACHE = 'prueba-offline-v' + VERSION;
const BD = 'prueba-offline';
const MARCA = 'prueba-offline-id';
const BLOQUES = 2000; // 2000 × 2,5 KB ≈ 5 MB, más que un espacio real.
const TAM_BLOQUE = 2500;
const ITERACIONES_PIN = 150000;

const $ = (id) => document.getElementById(id);
let bd;
let datos = {};

function abrirBD() {
	return new Promise((ok, mal) => {
		const r = indexedDB.open(BD, 1);
		r.onupgradeneeded = () => {
			const d = r.result;
			d.createObjectStore('kv');
			d.createObjectStore('bloques');
			d.createObjectStore('notas', { autoIncrement: true });
			d.createObjectStore('aperturas', { autoIncrement: true });
		};
		r.onsuccess = () => ok(r.result);
		r.onerror = () => mal(r.error);
	});
}

function pedir(almacen, modo, accion) {
	return new Promise((ok, mal) => {
		const t = bd.transaction(almacen, modo);
		const r = accion(t.objectStore(almacen));
		t.oncomplete = () => ok(r.result);
		t.onerror = t.onabort = () => mal(t.error);
	});
}
const leer = (k) => pedir('kv', 'readonly', (s) => s.get(k));
const escribir = (k, v) => pedir('kv', 'readwrite', (s) => s.put(v, k));

function fnv(texto, h = 0x811c9dc5) {
	for (let i = 0; i < texto.length; i++) {
		h ^= texto.charCodeAt(i);
		h = Math.imul(h, 16777619) >>> 0;
	}
	return h;
}

function bloque(i) {
	return (('bloque-' + i + '-').repeat(TAM_BLOQUE)).slice(0, TAM_BLOQUE);
}

async function crearDatos() {
	let suma = 0x811c9dc5;
	await new Promise((ok, mal) => {
		const t = bd.transaction('bloques', 'readwrite');
		const s = t.objectStore('bloques');
		for (let i = 0; i < BLOQUES; i++) {
			const b = bloque(i);
			suma = fnv(b, suma);
			s.put(b, i);
		}
		t.oncomplete = ok;
		t.onerror = t.onabort = () => mal(t.error);
	});
	const id = crypto.randomUUID();
	await escribir('id', id);
	await escribir('creado', new Date().toISOString());
	await escribir('suma', suma);
	localStorage.setItem(MARCA, id);
}

async function verificarBloques() {
	const todos = await pedir('bloques', 'readonly', (s) => s.getAll());
	let suma = 0x811c9dc5;
	for (const b of todos) suma = fnv(b, suma);
	return { cantidad: todos.length, integros: suma === (await leer('suma')) };
}

// La página se abre también sin red, así que se comprueba con una petición
// real: navigator.onLine puede decir que hay conexión cuando no la hay.
async function hayRed() {
	try {
		const r = await fetch('manifest.json?red=' + Date.now(), { cache: 'no-store' });
		return r.ok;
	} catch {
		return false;
	}
}

async function revisarCache() {
	if (!('caches' in window)) return false;
	const c = await caches.open(CACHE);
	return !!(await c.match('index.html', { ignoreSearch: true }));
}

function fila(etiqueta, valor, clase = '') {
	return `<div class="fila"><span>${etiqueta}</span><b class="${clase}">${valor}</b></div>`;
}

function textoDias(desde) {
	const ms = Date.now() - new Date(desde).getTime();
	const dias = Math.floor(ms / 86400000);
	const horas = Math.floor(ms / 3600000);
	return dias >= 1 ? `${dias} día(s)` : `${horas} hora(s)`;
}

function pintar() {
	const d = datos;
	const instalada = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
	const conservado = d.bloques.cantidad === BLOQUES && d.bloques.integros && d.marcaOk;

	const banner = $('banner');
	if (!instalada) {
		banner.className = '';
		banner.textContent = 'Estás en Safari. Agrégala a inicio y ábrela desde el ícono.';
	} else if (d.primera) {
		banner.className = '';
		banner.textContent = 'Listo: datos de prueba creados. Sigue los pasos de abajo.';
	} else if (!conservado) {
		banner.className = 'mal';
		banner.textContent = 'Se perdieron datos. Copia los resultados y pégalos en el chat.';
	} else if (!d.red) {
		banner.className = 'ok';
		banner.textContent = 'Funciona sin señal y conserva los datos.';
	} else {
		banner.className = 'ok';
		banner.textContent = 'Datos conservados. Falta probar en modo avión.';
	}

	$('estado').innerHTML =
		fila('Abierta desde', instalada ? 'El ícono de inicio' : 'Safari', instalada ? 'ok' : 'aviso') +
		fila('Conexión', d.red ? 'Con señal' : 'Sin señal', d.red ? 'aviso' : 'ok') +
		fila('Datos creados hace', textoDias(d.creado)) +
		fila('Datos de prueba (5 MB)', `${d.bloques.cantidad}/${BLOQUES} ${d.bloques.integros ? 'íntegros' : 'DAÑADOS'}`, d.bloques.integros ? 'ok' : 'mal') +
		fila('Marca en localStorage', d.marcaOk ? 'Presente' : 'Falta', d.marcaOk ? 'ok' : 'mal') +
		fila('Copia de la página', d.cache ? 'Presente' : 'Falta', d.cache ? 'ok' : 'mal') +
		fila('Trabajador offline', d.sw ? 'Activo' : 'Inactivo', d.sw ? 'ok' : 'aviso') +
		fila('Almacenamiento persistente', d.persistente === null ? 'No disponible' : d.persistente ? 'Concedido' : 'No concedido', d.persistente ? 'ok' : 'aviso') +
		fila('Aperturas', d.aperturas.length);

	$('nNotas').textContent = d.notas;
	$('btnPin').textContent = d.tienePin ? 'Comprobar PIN' : 'Crear PIN';
	$('pinAyuda').textContent = d.tienePin
		? 'Escribe el PIN. Se revisa en el teléfono, sin servidor.'
		: 'Crea un PIN de 4 dígitos. Se revisa en el teléfono, sin servidor.';

	const ultimas = d.aperturas.slice(-30).map((a) =>
		`${a.fecha} ${a.instalada ? 'icono' : 'safari'} ${a.red ? 'red' : 'SIN-RED'} bloques=${a.bloques} integros=${a.integros} marca=${a.marca} cache=${a.cache} sw=${a.sw} notas=${a.notas}`
	);
	$('reporte').textContent = [
		`prueba v${VERSION}`,
		navigator.userAgent,
		`creado: ${d.creado}`,
		`id: ${d.id}`,
		`persistente: ${d.persistente}`,
		`uso: ${d.uso}`,
		`pin: ${d.tienePin ? 'creado' : 'no'} ${d.pinInfo ?? ''}`,
		`aperturas: ${d.aperturas.length}`,
		...ultimas
	].join('\n');
}

async function refrescarNotas() {
	datos.notas = await pedir('notas', 'readonly', (s) => s.count());
}

async function iniciar() {
	bd = await abrirBD();
	datos.primera = !(await leer('id'));
	if (datos.primera) await crearDatos();

	datos.creado = await leer('creado');
	datos.id = await leer('id');
	datos.red = await hayRed();
	datos.bloques = await verificarBloques();
	datos.marcaOk = localStorage.getItem(MARCA) === datos.id;
	datos.tienePin = !!(await leer('pinHash'));
	datos.pinInfo = await leer('pinInfo');
	await refrescarNotas();

	if ('serviceWorker' in navigator) {
		try {
			await navigator.serviceWorker.register('sw.js', { scope: './' });
			await navigator.serviceWorker.ready;
		} catch (e) {
			console.error(e);
		}
	}
	datos.sw = !!navigator.serviceWorker?.controller;
	datos.cache = await revisarCache();

	datos.persistente = null;
	if (navigator.storage?.persist) {
		datos.persistente = (await navigator.storage.persisted()) || (await navigator.storage.persist());
	}
	datos.uso = 'n/d';
	if (navigator.storage?.estimate) {
		const e = await navigator.storage.estimate();
		datos.uso = `${(e.usage / 1048576).toFixed(1)} MB de ${(e.quota / 1048576).toFixed(0)} MB`;
	}

	const instalada = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
	await pedir('aperturas', 'readwrite', (s) => s.add({
		fecha: new Date().toISOString(),
		instalada,
		red: datos.red,
		bloques: datos.bloques.cantidad,
		integros: datos.bloques.integros,
		marca: datos.marcaOk,
		cache: datos.cache,
		sw: datos.sw,
		notas: datos.notas
	}));
	datos.aperturas = await pedir('aperturas', 'readonly', (s) => s.getAll());
	pintar();
}

async function hashPin(pin, sal) {
	const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES_PIN }, clave, 256);
	return Array.from(new Uint8Array(bits)).join(',');
}

$('btnPin').addEventListener('click', async () => {
	const pin = $('pin').value;
	const resultado = $('pinResultado');
	if (!/^\d{4}$/.test(pin)) {
		resultado.className = 'mal';
		resultado.textContent = 'Escribe 4 dígitos.';
		return;
	}
	const inicio = performance.now();
	if (datos.tienePin) {
		const correcto = (await hashPin(pin, await leer('pinSal'))) === (await leer('pinHash'));
		const ms = Math.round(performance.now() - inicio);
		datos.pinInfo = `comprobado=${correcto} ${ms}ms red=${datos.red}`;
		await escribir('pinInfo', datos.pinInfo);
		resultado.className = correcto ? 'ok' : 'mal';
		resultado.textContent = correcto ? `PIN correcto (${ms} ms).` : 'PIN incorrecto.';
	} else {
		const sal = crypto.getRandomValues(new Uint8Array(16));
		const hash = await hashPin(pin, sal);
		await escribir('pinSal', sal);
		await escribir('pinHash', hash);
		datos.tienePin = true;
		datos.pinInfo = `creado ${Math.round(performance.now() - inicio)}ms`;
		await escribir('pinInfo', datos.pinInfo);
		resultado.className = 'ok';
		resultado.textContent = 'PIN creado.';
	}
	$('pin').value = '';
	pintar();
});

$('btnNota').addEventListener('click', async () => {
	await pedir('notas', 'readwrite', (s) => s.add({ fecha: new Date().toISOString(), valor: 8.5 }));
	await refrescarNotas();
	pintar();
});

$('btnCopiar').addEventListener('click', async () => {
	try {
		await navigator.clipboard.writeText($('reporte').textContent);
		$('copiado').textContent = 'Copiado. Pégalo en el chat.';
	} catch {
		$('copiado').textContent = 'No se pudo copiar. Toma una captura de pantalla de este texto.';
	}
});

// Dos toques en lugar de una ventana de confirmación.
let borrarArmado = false;
$('btnBorrar').addEventListener('click', async () => {
	if (!borrarArmado) {
		borrarArmado = true;
		$('btnBorrar').textContent = 'Toca otra vez para borrar';
		return;
	}
	bd.close();
	localStorage.removeItem(MARCA);
	await new Promise((ok) => {
		const r = indexedDB.deleteDatabase(BD);
		r.onsuccess = r.onerror = r.onblocked = ok;
	});
	location.reload();
});

iniciar().catch((e) => {
	$('banner').className = 'mal';
	$('banner').textContent = 'Error: ' + (e?.message ?? e);
});
