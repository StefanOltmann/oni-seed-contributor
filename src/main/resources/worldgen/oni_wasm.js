/* @ts-self-types="./oni_wasm.d.ts" */

/**
 * Clear the cached cluster to free memory.
 *
 * Call this when the user navigates away from a map preview or when
 * the settle result has been consumed and is no longer needed.
 */
export function clear_cluster_cache() {
    wasm.clear_cluster_cache();
}

/**
 * Returns the build identifier this WASM was compiled against.
 * Format: `<ONI_BUILD>+<PACKAGE_VERSION>` e.g. `"720697+0.1.0"`.
 * Editors should display this so users know which game build their
 * settings preset matches.
 * @returns {string}
 */
export function game_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.game_version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Generate a cluster using the active `SettingsCache` and return summary as JSON.
 * Reads from the thread-local `SETTINGS` — lazily initialized from
 * embedded defaults via `load_generated()`, then overlaid with any
 * `settings_load_worldgen` / `settings_load_bundle` edits the editor
 * has applied. No filesystem access needed, works in WASM.
 * @param {number} seed
 * @param {string} cluster_id
 * @returns {string}
 */
export function generate_cluster(seed, cluster_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_cluster(seed, ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate all worlds in a cluster and return per-cell polygon data for each.
 *
 * Returns JSON: `{ "cluster_id", "seed", "worlds": [{ "name", "width", "height", "is_starting", "cells": [...] }] }`
 * @param {number} seed
 * @param {string} cluster_id
 * @returns {string}
 */
export function generate_cluster_cells(seed, cluster_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_cluster_cells(seed, ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate a cluster with provided cluster YAML config override.
 * @param {number} seed
 * @param {string} cluster_id
 * @param {string} cluster_yaml
 * @param {string} _world_yamls
 * @returns {string}
 */
export function generate_cluster_with_configs(seed, cluster_id, cluster_yaml, _world_yamls) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(cluster_yaml, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(_world_yamls, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.generate_cluster_with_configs(seed, ptr0, len0, ptr1, len1, ptr2, len2);
        deferred4_0 = ret[0];
        deferred4_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Generate a cluster from an in-game coordinate string.
 *
 * The coordinate encodes cluster, seed, story traits, and mixing levels.
 * Example: `SNDST-A-42-0-4A-MUWF1`
 *
 * This is the primary entry point — it matches what the game does when
 * a player starts a new world with specific settings.
 * @param {string} coordinate
 * @returns {string}
 */
export function generate_from_coordinate(coordinate) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(coordinate, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_from_coordinate(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate layout for the starting world of VanillaSandstoneCluster and return
 * per-cell data as JSON for comparison against C# reference snapshots.
 *
 * Returns JSON: `{ "cells": [{ "site_id", "x", "y", "type" }, ...] }`
 * @param {number} seed
 * @param {string} cluster_id
 * @returns {string}
 */
export function generate_layout_cells(seed, cluster_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_layout_cells(seed, ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate a full map preview from a coordinate string.
 *
 * Returns a JSON `MapData` structure containing per-world element grids,
 * biome cell polygons, entity spawns, and starmap locations. Designed
 * for rendering a complete map preview in a web UI.
 * @param {string} coordinate
 * @returns {string}
 */
export function generate_map_data(coordinate) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(coordinate, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_map_data(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Re-run ambient mob spawning against the cached cluster's current
 * `sim_cells` and return the refreshed entity list as JSON.
 *
 * Call this from the frontend whenever you want the mob positions
 * refreshed to match the current simulation state — e.g. after a
 * batch of `settle_cluster_advance` ticks has flooded some cavities.
 * `generate_map_data` must have been called first to populate
 * `CLUSTER_CACHE`; this endpoint operates on whatever's currently
 * cached.
 *
 * Why this exists:
 * `generate_map_data` runs worldgen with `do_settle=false`, so the
 * ambient mobs it places sit on *pre-settle* cells. If the frontend
 * then advances the sim via `settle_cluster_advance`, water can flow
 * into cavities the mobs were placed in — and C#'s real game path
 * would re-validate / skip those spawns. This endpoint mirrors that
 * by rerunning the Air/Water/Floor rules against the live cells.
 *
 * The re-run only replaces *ambient mob* entries; template-placed
 * entities (geysers, oil wells, props) persist across calls. The
 * partition is recorded on `WorldData::template_entity_count` at
 * initial worldgen.
 *
 * Output shape matches per-world `geysers` + `other_entities` from
 * `generate_map_data`, plus a top-level `worlds` array.
 * @returns {string}
 */
export function get_entity_spawners() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.get_entity_spawners();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Toggle template placement on/off for WASM (env vars don't work).
 * @param {boolean} skip
 */
export function set_skip_templates(skip) {
    wasm.set_skip_templates(skip);
}

/**
 * Export the entire `SettingsCache` (both worldgen and lookups) as
 * a JSON string matching the `FullBundle` schema.
 * @returns {string}
 */
export function settings_export_bundle() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.settings_export_bundle();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Export lookup-table settings (mobs, rooms, temperatures, templates)
 * as a JSON string matching the `LookupsBundle` schema.
 * @returns {string}
 */
export function settings_export_lookups() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.settings_export_lookups();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Export the worldgen-shaped settings (worlds, subworlds, clusters,
 * biomes, noise, traits, story_traits, feature_settings, defaults,
 * mixing) as a JSON string matching the `WorldgenBundle` schema.
 * @returns {string}
 */
export function settings_export_worldgen() {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.settings_export_worldgen();
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Replace the entire `SettingsCache` from a `FullBundle` JSON string.
 * Returns an error and leaves the cache untouched on parse failure.
 * @param {string} json
 */
export function settings_load_bundle(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.settings_load_bundle(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Replace lookup-table settings from a `LookupsBundle` JSON string.
 * Returns an error and leaves the cache untouched on parse failure.
 * Worldgen-shaped settings are preserved.
 * @param {string} json
 */
export function settings_load_lookups(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.settings_load_lookups(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Replace the worldgen-shaped settings from a `WorldgenBundle` JSON
 * string. Returns an error and leaves the cache untouched on parse
 * failure. Lookup tables (mobs, rooms, templates, temperatures) are
 * preserved.
 * @param {string} json
 */
export function settings_load_worldgen(json) {
    const ptr0 = passStringToWasm0(json, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.settings_load_worldgen(ptr0, len0);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

/**
 * Drop the in-memory `SettingsCache` and the cached cluster.
 * The next `generate_*` call reloads the stock embedded defaults.
 */
export function settings_reset() {
    wasm.settings_reset();
}

/**
 * Resumable progressive settle: advance the cached cluster's in-flight
 * sim from its current tick to `target_tick` and return a single
 * snapshot at that tick for every world. Intended to be called
 * successively (e.g. `target_tick = 100, 200, 300, 400, 500`) so the
 * frontend can yield back to JS between chunks and paint each frame
 * as it arrives. Unlike a single 500-frame WASM call, each chunk is
 * short enough to keep the worker responsive — target_tick=100 is
 * roughly 1/5 of one full settle.
 *
 * Rules:
 * - `target_tick` must be in `1..=500`.
 * - `target_tick` must be ≥ the current cached tick. Calling with a
 *   tick ≤ the current tick is a no-op except that it still returns
 *   a fresh snapshot at the current state (useful for re-reading the
 *   last paint after a worker round-trip).
 * - On first call (before any `generate_map_data` follow-up), the
 *   in-flight sim is lazily built from `pre_template_sim_cells`.
 * - Frame 498 runs the real `stamp_templates` onto the live sim
 *   (matches C#'s `DoSettleSim` at `j == 498`). Ticks < 498 return
 *   a throwaway-stamped view; ticks ≥ 498 return the live stamped
 *   state.
 * - Once target_tick hits 500 the final cells are also written back
 *   into `cached.cluster.worlds[*].data.sim_cells` and
 *   `cached.settled = true`.
 *
 * Returns an empty Vec on empty cache or out-of-range tick. Callers
 * are expected to have invoked `generate_map_data` first to populate
 * `CLUSTER_CACHE`; this function operates on whatever's currently
 * cached.
 *
 * Binary format (all little-endian) — mirrors the v3 layout but with
 * exactly ONE snapshot per call:
 * - 4 bytes: version tag (u32 = 4)
 * - 4 bytes: tick (u32) — the tick this snapshot was taken at
 * - 4 bytes: world count (u32)
 * - Per world:
 *   - 4 bytes: width (u32)
 *   - 4 bytes: height (u32)
 *   - width * height * 15 bytes: cell data (u16 elem, f32 mass, f32
 *     temp, u8 dis, i32 dis_count) — same layout as v2.
 * @param {number} target_tick
 * @returns {Uint8Array}
 */
export function settle_cluster_advance(target_tick) {
    const ret = wasm.settle_cluster_advance(target_tick);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_now_16f0c993d5dd6c27: function() {
            const ret = Date.now();
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./oni_wasm_bg.js": import0,
    };
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('oni_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
