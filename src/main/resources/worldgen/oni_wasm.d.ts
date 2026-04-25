/* tslint:disable */
/* eslint-disable */

/**
 * Bench harness — time just the Rust `generate_with_settings` call without
 * the JSON-serialization overhead every production entry point pays.
 *
 * Gated behind `debug` so release WASM doesn't ship with it. Returns a
 * small JSON blob containing per-phase wall-clock in ms so the bench
 * script can separate cluster-gen time from
 * `build_result` + `serde_json::to_string` cost.
 */
export function bench_cluster_phases(seed: number, cluster_id: string): string;

/**
 * Bench harness — returns the accumulated phase totals as JSON
 * (`{"phase": {"ms": number, "calls": number}, ...}`) and clears the
 * accumulator. Gated behind `debug`.
 */
export function bench_profile_dump(): string;

/**
 * Bench harness — enable the fine-grained `oni_worldgen::profile`
 * phase accumulator. Pair with `bench_profile_dump()` after running the
 * measured work. Gated behind `debug`.
 */
export function bench_profile_enable(): void;

/**
 * Clear the cached cluster to free memory.
 *
 * Call this when the user navigates away from a map preview or when
 * the settle result has been consumed and is no longer needed.
 */
export function clear_cluster_cache(): void;

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
 */
export function compute_digest_from_coordinate(coordinate: string, mode: string): string;

/**
 * Returns the build identifier this WASM was compiled against.
 * Format: `<ONI_BUILD>+<PACKAGE_VERSION>` e.g. `"720697+0.1.0"`.
 * Editors should display this so users know which game build their
 * settings preset matches.
 */
export function game_version(): string;

/**
 * Generate a cluster using the active `SettingsCache` and return summary as JSON.
 * Reads from the thread-local `SETTINGS` — lazily initialized from
 * embedded defaults via `load_generated()`, then overlaid with any
 * `settings_load_worldgen` / `settings_load_bundle` edits the editor
 * has applied. No filesystem access needed, works in WASM.
 */
export function generate_cluster(seed: number, cluster_id: string): string;

/**
 * Generate all worlds in a cluster and return per-cell polygon data for each.
 *
 * Returns JSON: `{ "cluster_id", "seed", "worlds": [{ "name", "width", "height", "is_starting", "cells": [...] }] }`
 */
export function generate_cluster_cells(seed: number, cluster_id: string): string;

/**
 * Generate a cluster and return the rendered SimCell grid for each world.
 * Returns JSON with element_idx, mass_hex, temp_hex, disease_idx, disease_count arrays.
 * This is the same data format as the C# snapshot for parity verification.
 */
export function generate_cluster_rendered(seed: number, cluster_id: string): string;

/**
 * Generate a cluster with provided cluster YAML config override.
 */
export function generate_cluster_with_configs(seed: number, cluster_id: string, cluster_yaml: string, _world_yamls: string): string;

/**
 * Generate a cluster from an in-game coordinate string.
 *
 * The coordinate encodes cluster, seed, story traits, and mixing levels.
 * Example: `SNDST-A-42-0-4A-MUWF1`
 *
 * This is the primary entry point — it matches what the game does when
 * a player starts a new world with specific settings.
 */
export function generate_from_coordinate(coordinate: string): string;

/**
 * Generate layout for the starting world of VanillaSandstoneCluster and return
 * per-cell data as JSON for comparison against C# reference snapshots.
 *
 * Returns JSON: `{ "cells": [{ "site_id", "x", "y", "type" }, ...] }`
 */
export function generate_layout_cells(seed: number, cluster_id: string): string;

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
 */
export function generate_map_data(coordinate: string): any;

/**
 * Generate a cluster from coordinate and return per-world element grids.
 * Used for parity verification against C# snapshots.
 */
export function generate_rendered_from_coordinate(coordinate: string): string;

/**
 * Generate a single SandstoneDefault world and return timing + cell count data.
 */
export function generate_sandstone_default(seed: number): string;

/**
 * Generate terrain cells for the starting world and return as JSON.
 * Used to verify WASM vs native parity.
 */
export function generate_terrain_cells(seed: number, cluster_id: string): string;

/**
 * Generate a VanillaSandstoneCluster (8-world DLC cluster) and return timing + cell count data.
 */
export function generate_vanilla_sandstone_cluster(seed: number): string;

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
 */
export function get_entity_spawners(): string;

/**
 * Toggle template placement on/off for WASM (env vars don't work).
 */
export function set_skip_templates(skip: boolean): void;

/**
 * Export the entire `SettingsCache` (both worldgen and lookups) as
 * a JSON string matching the `FullBundle` schema.
 */
export function settings_export_bundle(): string;

/**
 * Export lookup-table settings (mobs, rooms, temperatures, templates)
 * as a JSON string matching the `LookupsBundle` schema.
 */
export function settings_export_lookups(): string;

/**
 * Export the worldgen-shaped settings (worlds, subworlds, clusters,
 * biomes, noise, traits, story_traits, feature_settings, defaults,
 * mixing) as a JSON string matching the `WorldgenBundle` schema.
 */
export function settings_export_worldgen(): string;

/**
 * Replace the entire `SettingsCache` from a `FullBundle` JSON string.
 * Returns an error and leaves the cache untouched on parse failure.
 */
export function settings_load_bundle(json: string): void;

/**
 * Replace lookup-table settings from a `LookupsBundle` JSON string.
 * Returns an error and leaves the cache untouched on parse failure.
 * Worldgen-shaped settings are preserved.
 */
export function settings_load_lookups(json: string): void;

/**
 * Replace the worldgen-shaped settings from a `WorldgenBundle` JSON
 * string. Returns an error and leaves the cache untouched on parse
 * failure. Lookup tables (mobs, rooms, templates, temperatures) are
 * preserved.
 */
export function settings_load_worldgen(json: string): void;

/**
 * Drop the in-memory `SettingsCache` and the cached cluster.
 * The next `generate_*` call reloads the stock embedded defaults.
 */
export function settings_reset(): void;

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
 */
export function settle_cluster_advance(target_tick: number): Uint8Array;

/**
 * JSON twin of `settle_cluster_advance` — same simulation work, same
 * per-tick snapshot, but emits a JSON string so we can benchmark the
 * format cost without the simulation cost dominating. Gated behind
 * `debug` so release builds don't ship with it.
 *
 * The `sim.step` work is identical to the binary version; only the
 * output formatter changes. Lets the bench isolate "is binary worth
 * the maintenance?" for this specific entry point.
 */
export function settle_cluster_advance_json(target_tick: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly bench_cluster_phases: (a: number, b: number, c: number) => [number, number];
    readonly bench_profile_dump: () => [number, number];
    readonly clear_cluster_cache: () => void;
    readonly compute_digest_from_coordinate: (a: number, b: number, c: number, d: number) => [number, number];
    readonly game_version: () => [number, number];
    readonly generate_cluster: (a: number, b: number, c: number) => [number, number];
    readonly generate_cluster_cells: (a: number, b: number, c: number) => [number, number];
    readonly generate_cluster_rendered: (a: number, b: number, c: number) => [number, number];
    readonly generate_cluster_with_configs: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly generate_from_coordinate: (a: number, b: number) => [number, number];
    readonly generate_layout_cells: (a: number, b: number, c: number) => [number, number];
    readonly generate_map_data: (a: number, b: number) => any;
    readonly generate_rendered_from_coordinate: (a: number, b: number) => [number, number];
    readonly generate_sandstone_default: (a: number) => [number, number];
    readonly generate_terrain_cells: (a: number, b: number, c: number) => [number, number];
    readonly generate_vanilla_sandstone_cluster: (a: number) => [number, number];
    readonly get_entity_spawners: () => [number, number];
    readonly set_skip_templates: (a: number) => void;
    readonly settings_export_bundle: () => [number, number, number, number];
    readonly settings_export_lookups: () => [number, number, number, number];
    readonly settings_export_worldgen: () => [number, number, number, number];
    readonly settings_load_bundle: (a: number, b: number) => [number, number];
    readonly settings_load_lookups: (a: number, b: number) => [number, number];
    readonly settings_load_worldgen: (a: number, b: number) => [number, number];
    readonly settings_reset: () => void;
    readonly settle_cluster_advance: (a: number) => [number, number];
    readonly settle_cluster_advance_json: (a: number) => [number, number];
    readonly bench_profile_enable: () => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
