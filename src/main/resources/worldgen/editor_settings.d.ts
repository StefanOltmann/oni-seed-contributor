// Hand-written types for the worldgen editor JSON API.
//
// Generated to match the bundle structs in
// `crates/oni-config/src/bundle.rs` and the inner type definitions
// in `crates/oni-config/src/{world,subworld,defaults,...}.rs`.
//
// Imported and re-exported by `crates/oni-wasm/index.d.ts` (the
// package's public types entry point). See PUBLISHING.md for the
// publish flow and `docs/WORLDGEN_EDITOR_API.md` for the full
// contract.
//
// Usage:
//
//   import init, { worldgen, type WorldgenBundle } from
//     '@tigin-backwards/oxygen-not-included-worldgen';
//
//   await init();
//   const bundle: WorldgenBundle = worldgen.exportWorldgenBundle();
//   bundle.worlds['worlds/SandstoneDefault'].iconScale = 2.0;
//   worldgen.loadWorldgenBundle(bundle);
//   // Cluster cache invalidated; next worldgen.generate(...) uses mutated settings.

// ---------------------------------------------------------------------------
// Bundle interfaces — top-level shapes returned from / accepted by the
// settings_export_* / settings_load_* functions in lib.rs.
// ---------------------------------------------------------------------------

/**
 * "Shape the map" worldgen settings. Contains every category the
 * layout engine consults: world/subworld/cluster defs, noise trees,
 * biome configs, trait pool, feature settings, and the three mixing
 * tables. Editing any of these changes the cluster that
 * `generate_map_data` produces.
 */
export interface WorldgenBundle {
    /**
     * Global defaults applied when a world doesn't override them —
     * density, avoid-radius, overworld bounds, etc. Loaded from
     * `assets/worldgen/defaults.yaml`.
     */
    defaults: DefaultSettings;
    /**
     * World definitions keyed by config path (e.g.
     * `"worlds/SandstoneDefault"` for basegame,
     * `"expansion1::worlds/VanillaSandstoneDefault"` for SpacedOut).
     * Each entry is one asteroid's worldgen config.
     */
    worlds: Record<string, World>;
    /**
     * Subworld (biome/zone) definitions keyed by config path.
     * Worlds reference these by name via `subworldFiles`.
     */
    subworlds: Record<string, Subworld>;
    /**
     * Cluster layouts keyed by config path (e.g.
     * `"expansion1::clusters/VanillaSandstoneCluster"`). Defines which
     * worlds appear at which ring positions on the starmap.
     */
    clusters: Record<string, ClusterLayout>;
    /**
     * Noise-tree definitions keyed by config path. Drives terrain
     * shape (base noise), biome borders (override noise), and density
     * fields. Editing a noise frequency/scale here changes every
     * cell of every cluster that uses the tree.
     */
    noise: Record<string, NoiseTree>;
    /**
     * Biome definitions (elemental banding, noise thresholds).
     * Keyed by config path (e.g. `"biomes/Sedimentary"`).
     */
    biomes: Record<string, BiomeSettings>;
    /**
     * World trait pool — each entry describes a rollable trait (e.g.
     * `GeoActive`, `Volcanoes`) and the modifiers it applies.
     */
    traits: Record<string, WorldTrait>;
    /**
     * Story trait pool — traits tied to a "story" (`SNDST-C-42-0-4A-*`
     * codes). Applied in addition to `traits` when the coordinate
     * encodes a story.
     */
    story_traits: Record<string, WorldTrait>;
    /**
     * Per-feature configuration (geyser tables, ruins tables, etc.)
     * keyed by feature name. Consumed by feature-generation passes.
     */
    feature_settings: Record<string, FeatureSettings>;
    /**
     * DLC-level mixing settings, keyed by DLC id (e.g.
     * `"expansion1"`). Controls which mixing options are available
     * for SpacedOut vs basegame clusters.
     */
    dlc_mixing: Record<string, DlcMixingSettings>;
    /**
     * Whole-world mixing options — substitute one asteroid type for
     * another (e.g. a Ceres world slotted in for Sandstone). Keyed by
     * mixing-option path.
     */
    world_mixing: Record<string, WorldMixingSettings>;
    /**
     * Subworld mixing options — substitute one biome for another
     * within an asteroid. Keyed by mixing-option path.
     */
    subworld_mixing: Record<string, SubworldMixingSettings>;
}

/**
 * Lookup-table settings referenced by name from the worldgen bundle.
 * Less commonly edited — most presets only touch `WorldgenBundle`.
 */
export interface LookupsBundle {
    /**
     * Mob spawn configs (critter placement rules) keyed by mob name
     * (e.g. `"Hatch"`). Consumed by `GenerateActionCells`.
     */
    mobs: Record<string, MobConfig>;
    /**
     * Room placement configs keyed by room name. Same call site as
     * mobs; describes density/sample behaviour for carved rooms.
     */
    rooms: Record<string, RoomConfig>;
    /**
     * Named temperature ranges — `[minKelvin, maxKelvin]` per entry.
     * Subworlds reference these via `temperatureRange`.
     */
    temperatures: Record<string, [number, number]>;
    /**
     * Pre-authored templates (bases, geyser rooms, POIs) keyed by
     * template path. Each entry has cells + prefabs that get stamped
     * onto the world grid when `worldTemplateRules` selects it.
     */
    templates: Record<string, TemplateContainer>;
}

/** Atomic full snapshot — both worldgen and lookups in one blob. */
export interface FullBundle extends WorldgenBundle, LookupsBundle {
}

// ---------------------------------------------------------------------------
// Primitives and shared shapes.
// ---------------------------------------------------------------------------

/**
 * Float range. Used for densities, starting-base positions,
 * border sizes, and many other `{min, max}` fields. Min and max
 * are both inclusive; `{min: 0.5, max: 0.5}` means "always 0.5".
 */
export interface MinMax {
    /** Lower bound (inclusive). */
    min: number;
    /** Upper bound (inclusive). */
    max: number;
}

/**
 * Integer 2D vector. The Rust struct accepts uppercase `X/Y` from
 * YAML but serializes lowercase `x/y`, which is the shape you'll
 * always see from the WASM API.
 */
export interface Vector2I {
    x: number;
    y: number;
}

/** Integer `{x, y}` world dimensions in cells. */
export type WorldSize = Vector2I;

/**
 * Overworld-cell layout algorithm.
 * - `Default` (also accepts the legacy alias `VoronoiTree` in YAML): the
 *   standard Voronoi-tree layout used by every stock world.
 * - `PowerTree`: weighted Voronoi via MIConvexHull; only used by a
 *   handful of special worlds.
 */
export type LayoutMethod = 'Default' | 'PowerTree';

/**
 * Display category — affects UI icon and starmap placement semantics.
 * `Asteroid` is the usual; `Moon` is used for orbiting micro-worlds in
 * SpacedOut (e.g. the planetoid above Ceres).
 */
export type WorldCategory = 'Asteroid' | 'Moon';

/**
 * How aggressively the template-spawning pass tries to satisfy a
 * `TemplateSpawnRules` entry:
 * - `GuaranteeOne` — fail worldgen if at least one can't be placed.
 * - `GuaranteeSome` — guarantee `someCount`, fail otherwise.
 * - `GuaranteeSomeTryMore` — `someCount` guaranteed, plus `moreCount`
 *   best-effort.
 * - `GuaranteeAll` — fail if any of the listed names can't be placed.
 * - `GuaranteeRange` — guarantee a count chosen uniformly in
 *   `[range.x, range.y]`.
 * - `TryOne` / `TrySome` / `TryRange` / `TryAll` — best-effort
 *   variants that never fail worldgen.
 */
export type ListRule =
    | 'GuaranteeOne'
    | 'GuaranteeSome'
    | 'GuaranteeSomeTryMore'
    | 'GuaranteeAll'
    | 'GuaranteeRange'
    | 'TryOne'
    | 'TrySome'
    | 'TryRange'
    | 'TryAll';

/**
 * How an `AllowedCellsFilter` treats its `tag` reference when
 * restricting candidate cells.
 * - `Default` — no tag filter.
 * - `AtTag` — only cells with the tag.
 * - `NotAtTag` — only cells without the tag.
 * - `DistanceFromTag` — filter by `minDistance`/`maxDistance` cells
 *   away from any cell carrying the tag.
 */
export type TagCommand = 'Default' | 'AtTag' | 'NotAtTag' | 'DistanceFromTag';

/**
 * Set operation applied to the candidate-cell list when a filter is
 * evaluated. Modelled on C# `HashSet<T>` operations. `Replace` is the
 * default (the filter's results become the new candidate set).
 */
export type FilterCommand =
    | 'Clear'
    | 'Replace'
    | 'UnionWith'
    | 'IntersectWith'
    | 'ExceptWith'
    | 'SymmetricExceptWith'
    | 'All';

/**
 * Point-sampling strategy used when placing subworld centroids and
 * mob/room sample points. `PoissonDisk` (the default) produces
 * evenly-spaced points; `UniformSquare` is a dense grid used by a
 * few special cases.
 */
export type SampleBehaviour = 'PoissonDisk' | 'UniformSquare';

/**
 * Subworld zone type. Drives the game's zone colour, the
 * `StateTransition` background element, and some gameplay systems
 * (e.g. Radioactive exposure). Not every subworld config uses every
 * variant — Ceres/Prehistoric add the later entries in the list.
 */
export type ZoneType =
    | 'FrozenWastes'
    | 'CrystalCaverns'
    | 'BoggyMarsh'
    | 'Sandstone'
    | 'ToxicJungle'
    | 'MagmaCore'
    | 'OilField'
    | 'Space'
    | 'Ocean'
    | 'Rust'
    | 'Forest'
    | 'Radioactive'
    | 'Swamp'
    | 'Wasteland'
    | 'RocketInterior'
    | 'Metallic'
    | 'Barren'
    | 'Moo'
    | 'IceCaves'
    | 'CarrotQuarry'
    | 'SugarWoods'
    | 'PrehistoricGarden'
    | 'PrehistoricRaptor'
    | 'PrehistoricWetlands';

/**
 * Named temperature band that subworlds reference. The actual Kelvin
 * range for each name lives in `LookupsBundle.temperatures`. Stock
 * ONI defines 13 bands spanning extremely cold → extremely hot; the
 * last few aliases are kept for older configs.
 */
export type TemperatureRange =
    | 'ExtremelyCold'
    | 'VeryVeryCold'
    | 'VeryCold'
    | 'Cold'
    | 'Chilly'
    | 'Cool'
    | 'Mild'
    | 'Room'
    | 'HumanWarm'
    | 'HumanHot'
    | 'Hot'
    | 'VeryHot'
    | 'ExtremelyHot'
    | 'HumanIdeal'
    | 'HumanComfortable'
    | 'HotMarginal'
    | 'Warm'
    | 'CoolMarginal';

/**
 * A constraint on which overworld cells a subworld/template is
 * allowed to occupy. Multiple filters chain via `command` — the
 * allowed-cells set is reset/replaced/unioned/intersected in order
 * by `sortOrder`.
 */
export interface AllowedCellsFilter {
    /** How to interpret the `tag` reference (see {@link TagCommand}). */
    tagcommand?: TagCommand;
    /** Layout tag this filter keys off. Omitted when `tagcommand` is `Default`. */
    tag?: string | null;
    /** Minimum cell distance when `tagcommand` is `DistanceFromTag`. */
    minDistance?: number;
    /** Maximum cell distance when `tagcommand` is `DistanceFromTag`. */
    maxDistance?: number;
    /** Set operation applied to the running candidate set. */
    command?: FilterCommand;
    /** Only allow cells with a temperature-range matching one of these. */
    temperatureRanges?: TemperatureRange[];
    /** Only allow cells whose subworld zone-type matches one of these. */
    zoneTypes?: ZoneType[];
    /** Only allow cells whose subworld config path is in this list. */
    subworldNames?: string[];
    /** Evaluation order — lower values apply earlier in the filter chain. */
    sortOrder?: number;
    /**
     * If `tag` is set but no cell in the world has it, drop this
     * filter silently rather than failing the pass.
     */
    ignoreIfMissingTag?: boolean;
}

/**
 * One entry in `World.worldTraitRules`. The roll picks between `min`
 * and `max` traits for the world; `specificTraits` narrows the pool
 * to a specific list; `required*`/`forbidden*` filter on tags.
 */
export interface TraitRule {
    /** Minimum number of traits to pick (inclusive). */
    min?: number;
    /** Maximum number of traits to pick (inclusive). */
    max?: number;
    /** Only pick traits that carry every one of these tags. */
    requiredTags?: string[] | null;
    /** Restrict the pool to exactly these trait names. */
    specificTraits?: string[] | null;
    /** Skip traits carrying any of these tags. */
    forbiddenTags?: string[] | null;
    /** Skip these specific trait names. */
    forbiddenTraits?: string[] | null;
}

/**
 * One entry in `World.subworldMixingRules`. Controls how many copies
 * of a given mixing-subworld can appear in the layout, gated by tag
 * filters.
 */
export interface SubworldMixingRule {
    /** Name of the mixing-subworld this rule targets. */
    name?: string;
    /** Minimum copies to place. Default 0. */
    minCount?: number;
    /** Maximum copies to place. Default `i32::MAX`. */
    maxCount?: number;
    /** Skip if any of these tags are present. */
    forbiddenTags?: string[];
    /** Skip if any of these tags are absent. */
    requiredTags?: string[];
}

/**
 * Rule applied post-layout to add/remove layout tags on cells that
 * pass `allowedCellsFilter`. Used to inject things like `"WarpWorld"`
 * or `"StartWorld"` markers that downstream passes consume.
 */
export interface ModifyLayoutTagsRule {
    /** Tags to add on matching cells. */
    addTags?: string[];
    /** Tags to remove from matching cells. */
    removeTags?: string[];
    /** Filter chain selecting which cells the tag edits apply to. */
    allowedCellsFilter?: AllowedCellsFilter[];
}

/**
 * A template-spawn rule — "place one of these templates at an
 * overworld cell satisfying this filter". Collected on `World` or
 * `Subworld` and evaluated in priority order.
 */
export interface TemplateSpawnRules {
    /**
     * Human-readable identifier for this rule (used for diagnostics
     * and to cross-reference other rules). Optional.
     */
    ruleId?: string | null;
    /** Template paths this rule will pick from (e.g. `["geysers/generic_hot"]`). */
    names?: string[];
    /** How aggressively to satisfy the rule (see {@link ListRule}). */
    listRule?: ListRule;
    /** Used by `GuaranteeSome` / `GuaranteeSomeTryMore` — the guaranteed count. */
    someCount?: number;
    /** Used by `GuaranteeSomeTryMore` — additional best-effort count. */
    moreCount?: number;
    /** Total placements to attempt. Default 1. */
    times?: number;
    /**
     * Priority for template-placement scheduling. Higher priority
     * rules are placed before lower ones — use this to ensure
     * hand-authored POIs land before generic fills.
     */
    priority?: number;
    /** Allow the same template name to be picked more than once. */
    allowDuplicates?: boolean;
    /**
     * Allow this template in cells whose temperature range is
     * `ExtremelyCold` / `ExtremelyHot` — normally skipped.
     */
    allowExtremeTemperatureOverlap?: boolean;
    /**
     * Allow placement inside the ring surrounding the starting base
     * cell — normally excluded so players don't get buried in a POI.
     */
    allowNearStart?: boolean;
    /**
     * Skip the usual "don't overlap prior template cells" check.
     * Used sparingly for decorative overlays.
     */
    useRelaxedFiltering?: boolean;
    /** With `GuaranteeRange`/`TryRange`: roll a uniform count in `[x, y]`. */
    range?: Vector2I;
    /** Relative offset from the centroid of the matched cell. Default `(0, 0)`. */
    overrideOffset?: Vector2I;
    /**
     * Absolute placement override. `(-1, -1)` (the default) means
     * "no override" — the rule picks a cell via the filter.
     */
    overridePlacement?: Vector2I;
    /** Filter chain selecting candidate cells for placement. */
    allowedCellsFilter?: AllowedCellsFilter[];
}

/**
 * A single world's full config (ProcGen.World). Editing the worldsize
 * of the starting world changes the grid dimensions of the asteroid
 * you spawn on; editing `subworldFiles` changes which biomes appear
 * in the Voronoi layout. `file_path` is stripped from JSON.
 */
export interface World {
    /** Internal identifier; usually matches the config path's last segment. */
    name: string;
    /** Loc-key or inline description shown in the world-select UI. */
    description?: string | null;
    /** Name-table paths used to generate a display name for this world. */
    nameTables?: string[] | null;
    /** Sprite shown for this asteroid in the starmap / cluster UI. */
    asteroidIcon?: string | null;
    /** Size multiplier on the starmap icon. Default 1.0. */
    iconScale?: number;
    /**
     * Tags used by cluster/mixing/trait filters (e.g. `"RocketInterior"`,
     * `"ForbiddenClusterCategory_Ceres"`). Matching rules in
     * `ClusterLayout`/`WorldTrait`/`*MixingSettings` key off these.
     */
    worldTags?: string[];
    /** Turn the world-traits pass off entirely for this world. */
    disableWorldTraits?: boolean;
    /**
     * One or more rules describing how many traits to roll. Multiple
     * rules stack — e.g. `[{min: 2, max: 4}, {specificTraits: ["GeoActive"]}]`.
     */
    worldTraitRules?: TraitRule[];
    /**
     * Scalar multiplier applied to trait impact (spawn counts, etc.).
     * Default 1.0.
     */
    worldTraitScale?: number;
    /** UI category — `Asteroid` or `Moon`. */
    category?: WorldCategory;
    /** Cell dimensions of this world's grid. Canonical sizes are 256×384 etc. */
    worldsize?: WorldSize;
    /**
     * Number of rows at the top of the world hidden behind the
     * starting-region fog of war until scanned. Default 0.
     */
    hiddenY?: number;
    /**
     * Per-world overrides for global `DefaultSettings`. Example:
     * setting `defaultsOverrides.data.OverworldDensityMin` to a
     * different value changes subworld placement density for this
     * world only, without mutating the cluster-wide defaults.
     */
    defaultsOverrides?: DefaultSettings | null;
    /** Overworld layout algorithm (default Voronoi tree). */
    layoutMethod?: LayoutMethod;
    /**
     * Weighted list of subworld config paths this world is built from.
     * Each subworld gets dropped into the layout according to its
     * weight; counts are driven by `Subworld.density`.
     */
    subworldFiles?: WeightedSubworldName[];
    /**
     * Filter chain used when the layout lands a cell that no
     * `subworldFile` claims — picks a fallback zone.
     */
    unknownCellsAllowedSubworlds?: AllowedCellsFilter[];
    /**
     * Per-world subworld-mixing rules. Populated when a mixing code is
     * active (e.g. `MUWF1` in the coordinate) to inject biomes from
     * other worlds.
     */
    subworldMixingRules?: SubworldMixingRule[];
    /** Rules that add/remove layout tags after the layout finishes. */
    modifyLayoutTags?: ModifyLayoutTagsRule[];
    /** Name of the subworld that hosts the starting base. */
    startSubworldName?: string | null;
    /** Template stamped at the starting-base position (usually `bases/sandstoneBase`). */
    startingBaseTemplate?: string | null;
    /** Horizontal fraction of the world where the starting base lands, `[0, 1]`. */
    startingBasePositionHorizontal?: MinMax;
    /** Vertical fraction of the world where the starting base lands, `[0, 1]`. */
    startingBasePositionVertical?: MinMax;
    /**
     * Insertion-ordered map of feature-name → priority. Controls which
     * features are eligible for subworld placement at what priority.
     * Iteration order is load-bearing — the game iterates this map in
     * insertion order during feature distribution.
     */
    globalFeatures?: Record<string, number>;
    /** World-level template rules (POIs placed by the world, not by subworlds). */
    worldTemplateRules?: TemplateSpawnRules[];
    /**
     * Seasonal-event tags attached to this world (e.g. winter/holiday
     * seasons in SpacedOut).
     */
    seasons?: string[];
    /**
     * World traits that always apply regardless of rolling — the
     * "fixed" part of the worldTraitRules roll.
     */
    fixedTraits?: string[];
    /**
     * True if this world should be spawned adjacent to a Temporal Tear
     * node in the SpacedOut starmap. Only honoured for SpacedOut.
     */
    adjacentTemporalTear?: boolean;
}

/**
 * Weighted entry in a subworld pool. Total subworld count is driven
 * by density; `weight` controls the proportional share each subworld
 * claims. The `minCount` / `maxCount` pair clamps how many copies
 * of this subworld can land in the layout.
 */
export interface WeightedSubworldName {
    /** Subworld config path. */
    name: string;
    /**
     * Minimum copies to place (floor on the weighted roll).
     * C# default 0.
     */
    minCount?: number;
    /**
     * Maximum copies to place (cap on the weighted roll).
     * C# default `int.MaxValue`.
     */
    maxCount?: number;
    /** Relative weight — higher means more copies placed. C# default 1.0. */
    weight?: number;
    /**
     * Priority — higher-priority subworlds are placed before lower-
     * priority ones when the count roll contends across the pool.
     * Default 0.
     */
    priority?: number;
    /**
     * Power-tree weighting override. Only consulted when the hosting
     * world uses `layoutMethod: PowerTree`. Default 0.0.
     */
    overridePower?: number;
}

/**
 * Point-sampling layer used for additional mob/room sample point
 * generation within a Subworld. Each subworld can stack multiple
 * samplers (e.g. one for Hatches, another for sweetle nests).
 */
export interface Sampler {
    /** Point-count range for this layer. */
    density?: MinMax;
    /** Minimum cell distance between accepted points. */
    avoidRadius?: number;
    /**
     * If true, reject candidates that are too close to points from
     * prior samplers (used to keep layers from overlapping).
     */
    doAvoidPoints?: boolean;
    /** Point-sampler algorithm. */
    sampleBehaviour?: SampleBehaviour;
}

/**
 * A biome/zone definition (ProcGen.Subworld). Subworlds are the
 * building blocks of a world's Voronoi layout — each cell in the
 * overworld is assigned a subworld, and the subworld drives the
 * cell's temperature, elemental banding, feature pool, and
 * template rules.
 */
export interface Subworld {
    /** Internal identifier (often null for subworlds loaded by path). */
    name?: string | null;
    /** Loc-key for display name. */
    nameKey?: string | null;
    /** Loc-key for description. */
    descriptionKey?: string | null;
    /** Loc-key for utility/tooltip string. */
    utilityKey?: string | null;
    /** Path into `noise` — the primary biome noise. */
    biomeNoise?: string | null;
    /** Path into `noise` — used for biome-to-biome border transitions. */
    overrideNoise?: string | null;
    /** Path into `noise` — optional density modulation. */
    densityNoise?: string | null;
    /** Name of the border-biome config applied around this subworld. */
    borderOverride?: string | null;
    /** Higher wins when two neighbouring subworlds both claim a border. */
    borderOverridePriority?: number;
    /** Border thickness range in cells. C# default is `{min: 1.0, max: 2.5}`. */
    borderSizeOverride?: MinMax;
    /** Named temperature band (entries in `LookupsBundle.temperatures`). */
    temperatureRange?: TemperatureRange;
    /**
     * Single guaranteed feature placed near the centre of this
     * subworld's region (e.g. a geyser). Null means no central feature.
     */
    centralFeature?: Feature | null;
    /** Additional features that may spawn scattered through the subworld. */
    features?: Feature[];
    /** Layout tags attached to every cell of this subworld. */
    tags?: string[];
    /** Subworld-count density in the Voronoi layout. */
    density?: MinMax;
    /** Minimum cell distance between centroids. */
    avoidRadius?: number;
    /** Respect the avoid-radius when placing relative to prior subworlds. */
    doAvoidPoints?: boolean;
    /**
     * When true, child-cell Voronoi relaxation is skipped — produces
     * jaggier edges, used by a handful of biomes (Sandstone included).
     */
    dontRelaxChildren?: boolean;
    /** Centroid-sampling algorithm. */
    sampleBehaviour?: SampleBehaviour;
    /** Extra point-sample layers for mob/room placement. */
    samplers?: Sampler[];
    /** Minimum child-cell count before the subworld is considered valid. */
    minChildCount?: number;
    /** Force every instance to have exactly one child cell. */
    singleChildCount?: boolean;
    /** Additional children to add on top of the density roll. */
    extraBiomeChildren?: number;
    /** Weighted pool of biome configs used to paint this subworld's cells. */
    biomes?: WeightedBiome[];
    /** Zone type (affects colour, StateTransition background, gameplay). */
    zoneType?: ZoneType;
    /** Weight used by `PowerTree` layouts. Ignored for `Default` layout. */
    pdWeight?: number;
    /** Relaxation iteration count (advanced — rarely edited). */
    iterations?: number;
    /** Minimum Voronoi-energy threshold before stopping relaxation. */
    minEnergy?: number;
    /** Template-spawn rules scoped to this subworld's cells. */
    subworldTemplateRules?: TemplateSpawnRules[] | null;

    /** Catch-all for Subworld fields not enumerated above. */
    [key: string]: unknown;
}

/**
 * A geological feature (geyser room, dormant volcano, ancient ruins)
 * that can spawn inside a subworld. Matches `ProcGen.Feature`.
 */
export interface Feature {
    /**
     * Feature type — either a direct prefab name (e.g. `"GeyserGeneric"`)
     * or a feature-settings path.
     */
    type?: string | null;
    /** Layout tags attached to cells this feature occupies. */
    tags?: string[];
    /**
     * Mobs spawned inside the feature when it generates (e.g. Hatches
     * in a geyser room).
     */
    internalMobs?: InternalMob[] | null;
}

/**
 * A mob entry inside a `Feature` — rolls `count` copies of the
 * named mob prefab at generation time.
 */
export interface InternalMob {
    /** Integer count range rolled uniformly. */
    count?: CountRange | null;
    /** Mob prefab name (e.g. `"Hatch"`). */
    mob?: string | null;
}

/** Integer range used for internal-mob counts. */
export interface CountRange {
    min: number;
    max: number;
}

/**
 * Weighted biome entry in `Subworld.biomes`. The worldgen picks
 * one biome per subworld-cell weighted by these entries.
 */
export interface WeightedBiome {
    /** Biome config path. */
    name: string;
    /** Relative weight. */
    weight?: number;
    /**
     * Layout tags attached to cells painted with this biome choice
     * (on top of the subworld-level `tags`). Used by downstream
     * filter chains.
     */
    tags?: string[];
}

/**
 * Normalized-coordinate bounding box for the overworld base region.
 * Lives under `DefaultSettings.baseData`. Units are arbitrary game
 * space (not cells) — the game scales this at placement time.
 */
export interface BaseLocation {
    left: number;
    right: number;
    bottom: number;
    top: number;
}

/**
 * One starting-inventory element to drop around the printing pod.
 * Lives under `DefaultSettings.startingWorldElements`.
 */
export interface StartingWorldElement {
    /** Element name (e.g. `"Algae"`, `"Water"`). */
    element: string;
    /** Total mass in kilograms. */
    amount: number;
}

/**
 * Global default settings (ProcGen.DefaultSettings). The free-form
 * `data` field carries key-value pairs like `OverworldDensityMin:
 * 600` — see `assets/worldgen/defaults.yaml` for the full key list.
 * Per-world overrides live on `World.defaultsOverrides` and layer
 * on top of these at lookup time.
 */
export interface DefaultSettings {
    /** Bounding box used when the overworld renderer positions the base region. */
    baseData?: BaseLocation | null;
    /**
     * Free-form key-value map used by the `get_float/int/bool/string`
     * accessors in Rust. Values are typed `unknown` because the
     * underlying Rust map stores `serde_yaml::Value` which can hold
     * primitives, sequences, or nested mappings. Concrete stock keys
     * include `OverworldDensityMin`, `OverworldAvoidRadius`,
     * `OverworldMinNodes`, `DrawWorldBorder`, `OverworldSampleBehaviour`.
     */
    data?: Record<string, unknown> | null;
    /** Initial resources placed around the printing pod. */
    startingWorldElements?: StartingWorldElement[] | null;
    /** Layout tags added to every overworld cell at the start of generation. */
    overworldAddTags?: string[] | null;
    /** Default `moveTags` applied when populating a subworld with cells. */
    defaultMoveTags?: string[] | null;
}

// ---------------------------------------------------------------------------
// Mob & room configs (used for GenerateActionCells mob/room placement).
// ---------------------------------------------------------------------------

/** Integer count range used by mob/room `density`. */
export interface MinMaxConfig {
    min: number;
    max: number;
}

/**
 * Mob placement region (ProcGen.Mob.Location). Drives where a mob's
 * sample points are valid — e.g. `Floor` requires a solid floor
 * below the cell; `Air` requires an empty gas cell; `Liquid`
 * requires a liquid cell. The default is `Floor`.
 */
export type MobLocation =
    | 'Floor'
    | 'Ceiling'
    | 'Air'
    | 'BackWall'
    | 'NearWater'
    | 'NearLiquid'
    | 'Solid'
    | 'Water'
    | 'ShallowLiquid'
    | 'Surface'
    | 'LiquidFloor'
    | 'AnyFloor'
    | 'LiquidCeiling'
    | 'Liquid'
    | 'EntombedFloorPeek';

/**
 * Mob spawn configuration (ProcGen.Mob). Controls how many copies of
 * a mob prefab get scattered across the grid after layout — consumed
 * by the `GenerateActionCells` pass.
 */
export interface MobConfig {
    /** Prefab-selection strategy name (e.g. `"WeightedRandom"`). */
    selectMethod?: string;
    /** Roll range for the count of this mob placed per world. */
    density?: MinMaxConfig;
    /** Point-sampling strategy name for placement. */
    sampleBehaviour?: string;
    /** Cell-type region where sample points are accepted. */
    location?: MobLocation;
    /** Prefab name spawned by this entry. */
    prefabName?: string | null;
    /** Footprint width in cells. */
    width?: number;
    /** Footprint height in cells. */
    height?: number;
    /** Horizontal spacing to enforce between copies. */
    paddingX?: number;
}

/**
 * Room placement configuration (ProcGen.Room). Same mechanics as
 * `MobConfig` but for carved rooms rather than creatures.
 */
export interface RoomConfig {
    /** Room-selection strategy name. */
    selectMethod?: string;
    /** Roll range for the number of rooms. */
    density?: MinMaxConfig;
    /** Point-sampling strategy name. */
    sampleBehaviour?: string;
}

// ---------------------------------------------------------------------------
// Template containers (POIs, geysers, bases).
// ---------------------------------------------------------------------------

/**
 * Template coordinate vector. Uppercase `X/Y` (matches the on-disk
 * YAML), distinct from the lowercase {@link Vector2I} used by
 * world/subworld configs.
 */
export interface TemplateVec2I {
    X: number;
    Y: number;
}

/**
 * Template metadata. Populated by Rust's `refresh_info()` when the
 * loaded YAML's `min` is `(0, 0)`.
 */
export interface TemplateInfo {
    /** Bounding-box dimensions in cells. */
    size: TemplateVec2I;
    /** Total cell count (`cells.length` in practice). */
    area: number;
    /** Lower-left cell of the bounding box, relative to the template origin. */
    min: TemplateVec2I;
    /** Upper-right cell of the bounding box. */
    max: TemplateVec2I;
}

/**
 * A single cell in a template — one element of mass at a relative
 * grid position. Templates are stamped onto the world grid by
 * translating these positions by the template's spawn point.
 */
export interface TemplateCell {
    /** Element name (e.g. `"SandStone"`, `"Oxygen"`). Null for vacuum. */
    element?: string | null;
    /** Element mass in kg. */
    mass: number;
    /** Temperature in Kelvin. */
    temperature: number;
    /** X offset from template origin. */
    location_x: number;
    /** Y offset from template origin. */
    location_y: number;
    /** Disease name (e.g. `"SlimeLung"`). Null for sterile. */
    diseaseName?: string | null;
    /** Germ count. */
    diseaseCount: number;
    /**
     * If true, this cell stays un-revealed (fog-of-war) even when
     * templates are normally pre-revealed. Used by puzzle/POI cells.
     */
    preventFoWReveal?: boolean | null;
}

/**
 * One item stored inside a container building (e.g. a RationBox
 * pre-filled with meal-lice). Lives under `TemplatePrefab.storage`.
 */
export interface TemplateStorageItem {
    /** Prefab id of the stored item. */
    id?: string | null;
    /** Element override, if the item is an element-carrier. */
    element?: string | null;
    /** Quantity (mass for elements, count for creatures/items). */
    units: number;
    /** Temperature in Kelvin. */
    temperature: number;
    /** Free-form rottable state — carried through verbatim. */
    rottable?: unknown;
}

/**
 * A prefab placed by a template (building, pickupable, ore deposit,
 * or other entity). Which `TemplateContainer` array it lives in
 * determines how the game spawns it.
 */
export interface TemplatePrefab {
    /** Prefab id (e.g. `"Tile"`, `"Headquarters"`, `"Hatch"`). */
    id?: string | null;
    /** X offset from template origin (can be fractional). */
    location_x: number;
    /** Y offset from template origin (can be fractional). */
    location_y: number;
    /** Element override (for ore-like prefabs). */
    element?: string | null;
    /** Spawn temperature in Kelvin. */
    temperature: number;
    /** Count or mass — interpreted per prefab type. */
    units: number;
    /** Prefab type hint (e.g. `"Pickupable"`, `"Ore"`). */
    type?: string | null;
    /** Container contents (for storage buildings like RationBox). */
    storage?: TemplateStorageItem[];
    /** Rotation hint for orientable buildings. */
    rotationOrientation?: string | null;
    /** Connections bitfield for connectable prefabs (pipes, wires). */
    connections?: number | null;
}

/**
 * A pre-authored template (starting base, geyser room, artifact POI,
 * etc.). Templates are stamped onto the world grid by a
 * `TemplateSpawnRule` that picks this container's path. Matches
 * `ProcGen.TemplateContainer`.
 */
export interface TemplateContainer {
    /** Internal template name. Usually matches the config path's last segment. */
    name?: string | null;
    /** Bounding-box metadata. */
    info: TemplateInfo;
    /** Element/mass/temperature per cell. */
    cells: TemplateCell[];
    /** Building prefabs (tiles, machines). */
    buildings: TemplatePrefab[];
    /** Pickupable prefabs (items, creatures). */
    pickupables: TemplatePrefab[];
    /** Elemental-ore deposits. */
    elementalOres: TemplatePrefab[];
    /** Other entities (lights, furniture, decor). */
    otherEntities: TemplatePrefab[];
}

// ---------------------------------------------------------------------------
// Heavier types — surfaced as opaque records for now. Editors can
// round-trip them safely; field-level typing can be added later as
// the editor grows form support for them.
//
// Source of truth (Rust):
//   ClusterLayout      — crates/oni-config/src/cluster_layout.rs
//   NoiseTree          — crates/oni-config/src/noise_tree.rs
//   BiomeSettings      — crates/oni-config/src/biome_bands.rs
//   WorldTrait         — crates/oni-config/src/world_trait.rs
//   FeatureSettings    — crates/oni-config/src/feature_settings.rs
//   *MixingSettings    — crates/oni-config/src/mixing.rs
// ---------------------------------------------------------------------------

/**
 * Cluster layout — which worlds appear at which ring positions on
 * the starmap, plus starmap POI placements. See
 * `crates/oni-config/src/cluster_layout.rs`.
 */
export interface ClusterLayout {
    [key: string]: unknown
}

/**
 * Noise-tree definition (base/override/density). Editing primitive
 * frequencies and seeds here changes every cell of every world that
 * references the tree. See `crates/oni-config/src/noise_tree.rs`.
 */
export interface NoiseTree {
    [key: string]: unknown
}

/**
 * Biome banding settings — element/mass bands keyed on noise-field
 * thresholds. See `crates/oni-config/src/biome_bands.rs`.
 */
export interface BiomeSettings {
    [key: string]: unknown
}

/**
 * World trait definition — names, tags, and modifiers applied when
 * a roll picks this trait. See
 * `crates/oni-config/src/world_trait.rs`.
 */
export interface WorldTrait {
    [key: string]: unknown
}

/**
 * Per-feature configuration (geyser type pool, ruins content
 * tables). See `crates/oni-config/src/feature_settings.rs`.
 */
export interface FeatureSettings {
    [key: string]: unknown
}

/**
 * DLC-level mixing settings — drives which asteroid/subworld
 * substitutions are eligible for a given DLC. See
 * `crates/oni-config/src/mixing.rs`.
 */
export interface DlcMixingSettings {
    [key: string]: unknown
}

/**
 * Whole-world mixing option (substitute asteroid type A for B).
 * See `crates/oni-config/src/mixing.rs`.
 */
export interface WorldMixingSettings {
    [key: string]: unknown
}

/**
 * Subworld mixing option (substitute biome A for B inside an
 * asteroid). See `crates/oni-config/src/mixing.rs`.
 */
export interface SubworldMixingSettings {
    [key: string]: unknown
}
