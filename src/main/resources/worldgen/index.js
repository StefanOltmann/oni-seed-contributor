// Consumer-facing wrapper around the wasm-bindgen-generated glue.
//
// This file is target-agnostic: it's dropped into both pkg-web/ (the
// web-target tarball) and pkg-node/ (the nodejs-target tarball) by the
// publish script. `oni_wasm.js` in each tarball is target-specific, but
// the named exports have the same shape in both, so one wrapper works
// for both.

import * as _wasm from './oni_wasm.js';

// Web target: `./oni_wasm.js` has a default export — the `init` function
// that takes { module_or_path } and resolves once the WASM is
// instantiated. Node target: WASM is initialized synchronously at
// import time (via fs.readFileSync), so there's no init to run. We
// expose a function that does the right thing on both targets.
const _init = typeof _wasm.default === 'function' ? _wasm.default : null;

async function init(opts) {
  if (_init) return _init(opts);
  // Node target already initialized; return a resolved promise so
  // `await init()` is valid regardless of which tarball is in use.
}

export default init;

// Decode a v4 `settle_cluster_advance` binary snapshot.
function decodeSnapshot(buf) {
  if (!buf || buf.length === 0) {
    throw new Error(
      'settle_cluster_advance returned an empty buffer — no cached cluster, or tick out of range. Did you call worldgen.generate(coord) first?'
    );
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 0;
  const version = view.getUint32(offset, true); offset += 4;
  if (version !== 4) {
    throw new Error(`decodeSnapshot: expected version 4, got ${version}`);
  }
  const tick = view.getUint32(offset, true); offset += 4;
  const worldCount = view.getUint32(offset, true); offset += 4;

  const worlds = [];
  for (let w = 0; w < worldCount; w++) {
    const width = view.getUint32(offset, true); offset += 4;
    const height = view.getUint32(offset, true); offset += 4;
    const cells = width * height;

    const element_idx = new Uint16Array(cells);
    const mass = new Float32Array(cells);
    const temperature = new Float32Array(cells);
    const disease_idx = new Uint8Array(cells);
    const disease_count = new Int32Array(cells);

    for (let c = 0; c < cells; c++) {
      element_idx[c] = view.getUint16(offset, true); offset += 2;
      mass[c] = view.getFloat32(offset, true); offset += 4;
      temperature[c] = view.getFloat32(offset, true); offset += 4;
      disease_idx[c] = view.getUint8(offset); offset += 1;
      disease_count[c] = view.getInt32(offset, true); offset += 4;
    }

    worlds.push({
      width, height,
      element_idx, mass, temperature,
      disease_idx, disease_count,
    });
  }

  return { tick, worlds };
}

// Singleton that backs the one-slot CLUSTER_CACHE in WASM. All methods
// except `generate` operate on whatever's currently cached; call
// `generate(coord)` first to populate it.
export const worldgen = {
  generate(coord) {
    // Typed-array transport: per-cell grids arrive as Uint16Array /
    // Float32Array / Uint8Array / Int32Array — no JSON.parse.
    return _wasm.generate_map_data(coord);
  },
  advance(tick) {
    return decodeSnapshot(_wasm.settle_cluster_advance(tick));
  },
  entities() {
    return JSON.parse(_wasm.get_entity_spawners());
  },
  clear() {
    _wasm.clear_cluster_cache();
  },

  // Editor bundles. `load*` calls evict the cluster cache.
  exportWorldgenBundle() {
    return JSON.parse(_wasm.settings_export_worldgen());
  },
  loadWorldgenBundle(bundle) {
    _wasm.settings_load_worldgen(JSON.stringify(bundle));
  },
  exportLookupsBundle() {
    return JSON.parse(_wasm.settings_export_lookups());
  },
  loadLookupsBundle(bundle) {
    _wasm.settings_load_lookups(JSON.stringify(bundle));
  },
  exportFullBundle() {
    return JSON.parse(_wasm.settings_export_bundle());
  },
  loadFullBundle(bundle) {
    _wasm.settings_load_bundle(JSON.stringify(bundle));
  },

  // Drop both the SettingsCache and the cluster cache. Next generate()
  // reloads the embedded defaults.
  reset() {
    _wasm.settings_reset();
  },

  version() {
    return _wasm.game_version();
  },
};
