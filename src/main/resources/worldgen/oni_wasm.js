/* @ts-self-types="./oni_wasm.d.ts" */

/**
 * Bench harness — time just the Rust `generate_with_settings` call without
 * the JSON-serialization overhead every production entry point pays.
 *
 * Gated behind `debug` so release WASM doesn't ship with it. Returns a
 * small JSON blob containing per-phase wall-clock in ms so the bench
 * script can separate cluster-gen time from
 * `build_result` + `serde_json::to_string` cost.
 * @param {number} seed
 * @param {string} cluster_id
 * @returns {string}
 */
export function bench_cluster_phases(seed, cluster_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.bench_cluster_phases(seed, ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Bench harness — returns the accumulated phase totals as JSON
 * (`{"phase": {"ms": number, "calls": number}, ...}`) and clears the
 * accumulator. Gated behind `debug`.
 * @returns {string}
 */
export function bench_profile_dump() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.bench_profile_dump();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Bench harness — enable the fine-grained `oni_worldgen::profile`
 * phase accumulator. Pair with `bench_profile_dump()` after running the
 * measured work. Gated behind `debug`.
 */
export function bench_profile_enable() {
    wasm.bench_profile_enable();
}

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
 * Compute a `ClusterDigest` from a coordinate, returning JSON.
 *
 * This is the canonical Rust path for digest regeneration — calling
 * this function from JS via wasm-pack ensures the digest comes from
 * the SAME math the production WASM build uses, not from a separate
 * native binary that might have different precision.
 *
 * `mode` must be either "templates" or "notemplates".
 *
 * On parse error returns a JSON object with an `error` field.
 * @param {string} coordinate
 * @param {string} mode
 * @returns {string}
 */
export function compute_digest_from_coordinate(coordinate, mode) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(coordinate, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.compute_digest_from_coordinate(ptr0, len0, ptr1, len1);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
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
 * Generate a cluster and return the rendered SimCell grid for each world.
 * Returns JSON with element_idx, mass_hex, temp_hex, disease_idx, disease_count arrays.
 * This is the same data format as the C# snapshot for parity verification.
 * @param {number} seed
 * @param {string} cluster_id
 * @returns {string}
 */
export function generate_cluster_rendered(seed, cluster_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_cluster_rendered(seed, ptr0, len0);
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
 * Returns a `MapData` structure containing per-world element grids,
 * biome cell polygons, entity spawns, and starmap locations. Designed
 * for rendering a complete map preview in a web UI.
 *
 * **WASM path** (`#[cfg(target_arch = "wasm32")]`): returns a
 * `JsValue` with per-cell grids as typed arrays (`Uint16Array`,
 * `Float32Array`, etc.) for zero-JSON-parse delivery — ~35 ms
 * faster than the JSON path and an order of magnitude lighter on
 * the JS heap.
 *
 * **Native path**: returns a JSON string, for use by native
 * benchmarks / PGO tooling that can't host `JsValue`.
 * @param {string} coordinate
 * @returns {any}
 */
export function generate_map_data(coordinate) {
    const ptr0 = passStringToWasm0(coordinate, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.generate_map_data(ptr0, len0);
    return ret;
}

/**
 * Generate a cluster from coordinate and return per-world element grids.
 * Used for parity verification against C# snapshots.
 * @param {string} coordinate
 * @returns {string}
 */
export function generate_rendered_from_coordinate(coordinate) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(coordinate, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_rendered_from_coordinate(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate a single SandstoneDefault world and return timing + cell count data.
 * @param {number} seed
 * @returns {string}
 */
export function generate_sandstone_default(seed) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.generate_sandstone_default(seed);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Generate terrain cells for the starting world and return as JSON.
 * Used to verify WASM vs native parity.
 * @param {number} seed
 * @param {string} cluster_id
 * @returns {string}
 */
export function generate_terrain_cells(seed, cluster_id) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(cluster_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_terrain_cells(seed, ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate a VanillaSandstoneCluster (8-world DLC cluster) and return timing + cell count data.
 * @param {number} seed
 * @returns {string}
 */
export function generate_vanilla_sandstone_cluster(seed) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.generate_vanilla_sandstone_cluster(seed);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
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
            ptr1 = 0;
            len1 = 0;
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
            ptr1 = 0;
            len1 = 0;
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
            ptr1 = 0;
            len1 = 0;
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

/**
 * JSON twin of `settle_cluster_advance` — same simulation work, same
 * per-tick snapshot, but emits a JSON string so we can benchmark the
 * format cost without the simulation cost dominating. Gated behind
 * `debug` so release builds don't ship with it.
 *
 * The `sim.step` work is identical to the binary version; only the
 * output formatter changes. Lets the bench isolate "is binary worth
 * the maintenance?" for this specific entry point.
 * @param {number} target_tick
 * @returns {string}
 */
export function settle_cluster_advance_json(target_tick) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.settle_cluster_advance_json(target_tick);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_83742b46f01ce22d: function (arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_String_8564e559799eccda: function (arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_string_7ef6b97b02428fae: function (arg0) {
            const ret = typeof (arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function (arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_get_3ef1eba1850ade27: function () {
            return handleError(function (arg0, arg1) {
                const ret = Reflect.get(arg0, arg1);
                return ret;
            }, arguments);
        },
        __wbg_get_a8ee5c45dabc1b3b: function (arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_new_49d5571bd3f0c4d4: function () {
            const ret = new Map();
            return ret;
        },
        __wbg_new_a70fbab9066b301f: function () {
            const ret = new Array();
            return ret;
        },
        __wbg_new_ab79df5bd7c26067: function () {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_22da9388ac046e50: function (arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_c62f8165d6102476: function (arg0, arg1) {
            const ret = new Int32Array(getArrayI32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_dddccc7a7dc2cc04: function (arg0, arg1) {
            const ret = new Uint16Array(getArrayU16FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_ff2c15e8e05ffdfc: function (arg0, arg1) {
            const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_now_16f0c993d5dd6c27: function () {
            const ret = Date.now();
            return ret;
        },
        __wbg_set_282384002438957f: function (arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_6be42768c690e380: function (arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_7eaa4f96924fd6b3: function () {
            return handleError(function (arg0, arg1, arg2) {
                const ret = Reflect.set(arg0, arg1, arg2);
                return ret;
            }, arguments);
        },
        __wbg_set_bf7251625df30a02: function (arg0, arg1, arg2) {
            const ret = arg0.set(arg1, arg2);
            return ret;
        },
        __wbindgen_cast_0000000000000001: function (arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000002: function (arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000003: function (arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function (arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function () {
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

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;

function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint16ArrayMemory0 = null;

function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
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

let cachedTextDecoder = new TextDecoder('utf-8', {ignoreBOM: true, fatal: true});
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;

function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', {ignoreBOM: true, fatal: true});
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
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
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

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return {instance, module};
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic':
            case 'cors':
            case 'default':
                return true;
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

    const {instance, module} = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export {initSync, __wbg_init as default};
