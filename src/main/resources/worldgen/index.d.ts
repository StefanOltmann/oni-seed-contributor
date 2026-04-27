// Consumer-facing type surface for
// `@tigin-backwards/oxygen-not-included-worldgen`.
//
// This is the single types entry point for the package. The nested
// editor-bundle types (World, Subworld, BiomeSettings, NoiseTree, etc.)
// live in `editor_settings.d.ts` and are re-exported here so consumers
// can import every type by name from the package root.

// -----------------------------------------------------------------------
// Editor types (imported and re-exported from editor_settings.d.ts)
// -----------------------------------------------------------------------

import type {
    AllowedCellsFilter,
    BaseLocation,
    BiomeSettings,
    ClusterLayout,
    CountRange,
    DefaultSettings,
    DlcMixingSettings,
    Feature,
    FeatureSettings,
    FilterCommand,
    FullBundle,
    InternalMob,
    LayoutMethod,
    ListRule,
    LookupsBundle,
    MinMax,
    MinMaxConfig,
    MobConfig,
    MobLocation,
    ModifyLayoutTagsRule,
    NoiseTree,
    RoomConfig,
    SampleBehaviour,
    Sampler,
    StartingWorldElement,
    Subworld,
    SubworldMixingRule,
    SubworldMixingSettings,
    TagCommand,
    TemperatureRange,
    TemplateCell,
    TemplateContainer,
    TemplateInfo,
    TemplatePrefab,
    TemplateSpawnRules,
    TemplateStorageItem,
    TemplateVec2I,
    TraitRule,
    Vector2I,
    WeightedBiome,
    WeightedSubworldName,
    World,
    WorldCategory,
    WorldgenBundle,
    WorldMixingSettings,
    WorldSize,
    WorldTrait,
    ZoneType,
} from './editor_settings.js';

export type {
    WorldgenBundle,
    LookupsBundle,
    FullBundle,
    MinMax,
    Vector2I,
    WorldSize,
    LayoutMethod,
    WorldCategory,
    ListRule,
    TagCommand,
    FilterCommand,
    SampleBehaviour,
    ZoneType,
    TemperatureRange,
    AllowedCellsFilter,
    TraitRule,
    SubworldMixingRule,
    ModifyLayoutTagsRule,
    TemplateSpawnRules,
    World,
    WeightedSubworldName,
    Sampler,
    Subworld,
    Feature,
    InternalMob,
    CountRange,
    WeightedBiome,
    BaseLocation,
    StartingWorldElement,
    DefaultSettings,
    MinMaxConfig,
    MobLocation,
    MobConfig,
    RoomConfig,
    TemplateVec2I,
    TemplateInfo,
    TemplateCell,
    TemplateStorageItem,
    TemplatePrefab,
    TemplateContainer,
    ClusterLayout,
    NoiseTree,
    BiomeSettings,
    WorldTrait,
    FeatureSettings,
    DlcMixingSettings,
    WorldMixingSettings,
    SubworldMixingSettings,
};

// -----------------------------------------------------------------------
// Map data types (returned by worldgen.generate)
// -----------------------------------------------------------------------

/**
 * Full map payload returned by `worldgen.generate(coordinate)`. One
 * top-level envelope for cluster metadata plus a per-world array with
 * element grid, biome polygons, and entity spawns.
 */
export interface MapData {
    coordinate: string;
    seed: number;
    cluster_id: string;
    /**
     * Short cluster tag from the coord grammar, e.g. `SNDST-C`, `V-BAD-C`,
     * `M-FRZ-C`, `VOLCA`. Matches the `coordinatePrefix` in the cluster
     * YAML. Stable across seeds; use it to group results by cluster type
     * without parsing the full coord string (prefixes can contain hyphens,
     * so naive splitting is unreliable).
     */
    coordinate_prefix: string;
    /** Element ids, indexed by the `element_idx` values in each world's cell grid. */
    element_table: string[];
    /** Spaced Out hex-grid world locations. One entry per asteroid. */
    starmap: StarmapEntry[];
    /** Spaced Out non-asteroid hex POIs (harvestable clouds, artifact sites, etc). */
    starmap_pois: StarmapPoi[];
    /** Basegame (non-SpacedOut) rocket destinations. Empty on SpacedOut clusters. */
    vanilla_starmap: VanillaStarmapEntry[];
    worlds: WorldMapData[];
    /**
     * Populated when the worldgen pipeline detected a fatal failure
     * (e.g. "Could not guarantee minCount of Subworld X", story trait
     * couldn't place on any world, layout collapse). Mirrors the game's
     * `ReportWorldGenError` + abort path. `null` on successful generation.
     */
    failure: WorldgenFailure | null;
    /**
     * Recoverable per-world or cluster-level warnings that didn't abort
     * worldgen. Per-world entries have the world index prepended to the
     * message. Empty array on clean runs.
     */
    telemetry: WorldgenEvent[];
}

export interface WorldgenFailure {
    /** Where in the pipeline the failure was detected (e.g. "AssignClusterLocations", "render_to_map"). */
    stage: string;
    /** World index where the failure happened. `-1` for cluster-level failures. */
    world_index: number;
    /** Human-readable description. */
    message: string;
}

export interface WorldgenEvent {
    /** Stable short tag for grouping (e.g. "layout", "noise", "mob_spawning", "template_rules"). */
    category: string;
    /** Free-form description. Per-world entries are prefixed with `world[N]:`. */
    message: string;
}

export interface WorldMapData {
    /** World config path. */
    name: string;
    width: number;
    height: number;
    is_starting: boolean;
    world_traits: string[];
    /**
     * u16 per cell, row-major (`width * height`). Backed by a
     * freshly-allocated JS typed array (`wasm-bindgen` copies out of
     * WASM linear memory), so it's safe to retain across subsequent
     * `worldgen.generate` calls without being invalidated.
     */
    element_idx: Uint16Array;
    mass: Float32Array;
    temperature: Float32Array;
    /** u8 per cell; 255 means no disease. */
    disease_idx: Uint8Array;
    /** i32 per cell. */
    disease_count: Int32Array;
    biome_cells: BiomeCell[];
    geysers: GeyserSpawn[];
    buildings: EntitySpawn[];
    pickupables: EntitySpawn[];
    other_entities: EntitySpawn[];
}

export interface BiomeCell {
    id: number;
    /** Subworld type path, e.g. `"expansion1::subworlds/jungle/med_Jungle"`. */
    type: string;
    /**
     * The Subworld's `ZoneType` enum value as a string — one of
     * `"FrozenWastes" | "CrystalCaverns" | "BoggyMarsh" | "Sandstone"
     * | "ToxicJungle" | "MagmaCore" | "OilField" | "Space" | "Ocean"
     * | "Rust" | "Forest" | "Radioactive" | "Swamp" | "Wasteland"
     * | "RocketInterior" | "Metallic" | "Barren" | "Moo" | "IceCaves"
     * | "CarrotQuarry" | "SugarWoods" | "PrehistoricGarden"
     * | "PrehistoricRaptor" | "PrehistoricWetlands"`. `null` when the
     * subworld path couldn't be resolved in the current settings.
     */
    zone_type: string | null;
    x: number;
    y: number;
    /** Flat polygon vertex array: `[x0, y0, x1, y1, ...]`. */
    poly: number[];
}

export interface EntitySpawn {
    /** Game prefab name. */
    tag: string;
    /** Grid cell index. */
    cell: number;
    /** `cell % width`. */
    x: number;
    /** `cell / width`. */
    y: number;
    /**
     * Connections bitmask preserved from the source
     * `TemplatePrefab.connections`. Present only for template-placed
     * conduit-aware buildings (LogicGate, LogicWire, etc.). Absent for
     * ambient / terrain mob spawns and for prefabs that had no
     * connections field in the YAML.
     */
    connections?: number;
    /**
     * Rotation / orientation preserved from
     * `TemplatePrefab.rotationOrientation` — e.g. `"R90"`, `"R180"`,
     * `"R270"`, `"FlipH"`. Present only for rotated template buildings
     * (e.g. the R270 LiquidValve in `poi_old_pool`). Absent otherwise.
     */
    rotationOrientation?: string;
}

/**
 * Geyser spawn. `type` is the resolved template id (what the game
 * rolls `GeyserGeneric_*` into); `scaled_*` fields come from the
 * per-geyser stats roll and are absent for non-random geysers.
 */
export interface GeyserSpawn extends EntitySpawn {
    type: string;
    scaled_rate?: number;
    scaled_iter_len?: number;
    scaled_iter_pct?: number;
    scaled_year_len?: number;
    scaled_year_pct?: number;
}

export interface StarmapEntry {
    world_index: number;
    q: number;
    r: number;
}

export interface StarmapPoi {
    /** e.g. `"HarvestableSpacePOI_*"`, `"ArtifactSpacePOI"`. */
    poi_type: string;
    q: number;
    r: number;
    // Present only on harvestable POIs:
    capacity_roll?: number;
    recharge_roll?: number;
    total_capacity?: number;
    recharge_time?: number;
}

export interface VanillaStarmapEntry {
    type: string;
    distance: number;
}

// -----------------------------------------------------------------------
// Settle snapshot (returned by worldgen.advance)
// -----------------------------------------------------------------------

/**
 * A per-tick snapshot of settle state, one decoded v4 binary frame.
 * Arrays are parallel (indexed by row-major cell position).
 */
export interface SettleSnapshot {
    /** Tick this snapshot was taken at. Monotonic, 1..=500. */
    tick: number;
    worlds: SettleWorld[];
}

export interface SettleWorld {
    width: number;
    height: number;
    element_idx: Uint16Array;
    mass: Float32Array;
    temperature: Float32Array;
    /** 255 = no disease on that cell. */
    disease_idx: Uint8Array;
    disease_count: Int32Array;
}

// -----------------------------------------------------------------------
// Entity spawners (returned by worldgen.entities)
// -----------------------------------------------------------------------

/**
 * Refreshed entity spawns against the cached cluster's current sim
 * state. Shape mirrors the per-world entity arrays in `MapData`.
 */
export interface EntitySpawners {
    worlds: EntitySpawnerWorld[];
}

export interface EntitySpawnerWorld {
    geysers: GeyserSpawn[];
    buildings: EntitySpawn[];
    pickupables: EntitySpawn[];
    other_entities: EntitySpawn[];
}

// -----------------------------------------------------------------------
// init + worldgen singleton
// -----------------------------------------------------------------------

/** Options accepted by `init()`. Matches wasm-bindgen's web-target signature. */
export interface InitOptions {
    /**
     * URL (or resolved URL, Request, or pre-compiled WebAssembly.Module) of
     * the .wasm binary. Omit to use the bundler-rewritten default
     * (`new URL('oni_wasm_bg.wasm', import.meta.url)`).
     */
    module_or_path?:
        | string
        | URL
        | Request
        | Response
        | BufferSource
        | WebAssembly.Module
        | Promise<
        string | URL | Request | Response | BufferSource | WebAssembly.Module
    >;
}

/**
 * Initialize the WASM module.
 *
 * - On the **web target**, fetches and instantiates the `.wasm` binary
 *   (using the `options.module_or_path` or the default
 *   `new URL('oni_wasm_bg.wasm', import.meta.url)` pattern).
 * - On the **nodejs target**, WASM is already loaded via `fs` at import
 *   time; `init()` resolves immediately.
 *
 * Safe to call multiple times: subsequent calls short-circuit on both
 * targets.
 */
export default function init(options?: InitOptions): Promise<void>;

/**
 * Singleton that wraps the one-slot cluster cache in WASM. All methods
 * (except `generate`, `reset`, and `version`) operate on whatever
 * cluster is currently cached; call `generate(coord)` first to populate.
 */
export const worldgen: {
    /**
     * Generate a cluster from a game coordinate. Caches the cluster in
     * the WASM thread-local slot, replacing any previously cached cluster.
     */
    generate(coordinate: string): MapData;

    /**
     * Advance the cached cluster's settle sim to `targetTick` (1..=500)
     * and return a decoded snapshot at that tick. Call repeatedly with
     * increasing ticks (e.g. 25, 50, ..., 500) for progressive rendering.
     *
     * Throws if the cache is empty or `targetTick` is out of range.
     */
    advance(targetTick: number): SettleSnapshot;

    /**
     * Re-run ambient mob spawning against the cached cluster's current
     * cell state and return the refreshed entity lists. Pairs with
     * `advance()` — liquid/gas settling can invalidate earlier mob
     * placements. Template-placed entities persist across calls.
     */
    entities(): EntitySpawners;

    /**
     * Drop the cached generated cluster. Editor settings (if mutated)
     * are preserved.
     */
    clear(): void;

    /**
     * Export the "shape the map" settings as a `WorldgenBundle`. Round-trip
     * through `loadWorldgenBundle` to apply edits.
     */
    exportWorldgenBundle(): WorldgenBundle;

    /**
     * Replace the worldgen settings from a `WorldgenBundle`. Lookup tables
     * (mobs, rooms, temperatures, templates) are preserved. Evicts the
     * cluster cache — next `generate()` rebuilds with the new settings.
     *
     * Throws on parse failure; the in-memory cache is left untouched.
     */
    loadWorldgenBundle(bundle: WorldgenBundle): void;

    /**
     * Export the lookup tables (mobs, rooms, temperatures, templates) as
     * a `LookupsBundle`.
     */
    exportLookupsBundle(): LookupsBundle;

    /** Replace lookup tables from a `LookupsBundle`. Evicts cluster cache. */
    loadLookupsBundle(bundle: LookupsBundle): void;

    /** Export both worldgen + lookup settings as a single `FullBundle`. */
    exportFullBundle(): FullBundle;

    /** Replace both worldgen + lookup settings atomically. Evicts cluster cache. */
    loadFullBundle(bundle: FullBundle): void;

    /**
     * Drop both the editor settings and the cluster cache. Next
     * `generate()` reloads the embedded stock settings from scratch.
     */
    reset(): void;

    /**
     * Build identifier this WASM was compiled against. Format:
     * `"<ONI_BUILD>+rust<PORT_VERSION>"` — e.g. `"720697+rust0.1.0"`. The
     * number before the `+` is the ONI build this version targets.
     */
    version(): string;
};

