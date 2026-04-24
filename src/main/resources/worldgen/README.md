# @tigin-backwards/oxygen-not-included-worldgen

A WASM build of the Oxygen Not Included worldgen engine. Give it a
game coordinate, get back the same cluster the game would generate.

## What it covers

For a given coordinate, this package returns:

- Cluster layout and starmap (world positions, POIs, rocket destinations).
- Per-world element grid, biome polygons, and world traits.
- Geyser, building, pickupable, and other entity spawn positions.
- Per-cell mass, temperature, and disease (raw after `worldgen.generate`; settled after `worldgen.advance`).
- Both basegame and Spaced Out clusters, including story traits, mixing codes, and DLC toggles.

Output is compared cell-by-cell against snapshots from the real game
(ONI build 720697).

## What's approximate

- **Settle simulation.** After worldgen, the game runs a physics
  pass that settles temperatures, displaces gases and liquids, and
  places critters and plants at suitable locations. `worldgen.advance`
  runs this step, but the output isn't bit-exact against the game
  yet. Note that regardless of how accurate our settle port is, the
  simulation done during worldgen has determinism issues and will
  never match.

## Install

```bash
# Browsers, ESM bundlers (Vite, Webpack 5+, Rspack/Rsbuild, Rollup,
# Parcel, esbuild, etc.)
npm install @tigin-backwards/oxygen-not-included-worldgen

# Node scripts, CLIs, SSR
npm install @tigin-backwards/oxygen-not-included-worldgen-node
```

Same API on both packages. The only difference is the underlying
glue: the web package fetches the `.wasm` at init time, the Node
package loads it synchronously via `fs` at import time.

## Quick start

**Browsers / bundlers** (the web package):

```ts
import init, { worldgen } from
  '@tigin-backwards/oxygen-not-included-worldgen';

await init();
const map = worldgen.generate('V-SNDST-C-42-0-4A-MUWF1');
// map.worlds[0].element_idx    element grid, width * height
// map.worlds[0].biome_cells    overworld biome polygons
// map.worlds[0].geysers        geyser spawn positions
// map.element_table            element names by index
// map.starmap                  hex grid world locations
```

**Node** (the `-node` package, same API, different glue):

```ts
// ESM
import { worldgen } from
  '@tigin-backwards/oxygen-not-included-worldgen-node';

const map = worldgen.generate('V-SNDST-C-42-0-4A-MUWF1');
```

```js
// CommonJS
const { worldgen } =
  require('@tigin-backwards/oxygen-not-included-worldgen-node');

const map = worldgen.generate('V-SNDST-C-42-0-4A-MUWF1');
```

No `init()` needed on Node; the WASM is already loaded by the time
`require`/`import` returns. (A no-op `init` is still exported for
cross-runtime code that wants to `await init()` without branching.)

TypeScript types for every export (`MapData`, `WorldMapData`,
`SettleSnapshot`, bundle types, all function signatures) ship with
the package `.d.ts`. Import them by name:

```ts
import type { MapData, SettleSnapshot } from
  '@tigin-backwards/oxygen-not-included-worldgen';
```

### Loading the WASM binary

On the web target, `await init()` with no arguments looks up the
`.wasm` file at `new URL('oni_wasm_bg.wasm', import.meta.url)`.
Most modern bundlers (Vite, Webpack 5+, Rspack/Rsbuild, Rollup,
Parcel, esbuild) rewrite that pattern at build time so the `.wasm`
is served as a bundled asset.

For setups that don't, pass the URL explicitly:

```ts
// Served from your own origin (copy oni_wasm_bg.wasm into /public/)
await init({ module_or_path: '/oni_wasm_bg.wasm' });

// Bundler-resolved asset (any bundler with ?url query imports)
import wasmUrl from
  '@tigin-backwards/oxygen-not-included-worldgen/oni_wasm_bg.wasm?url';
await init({ module_or_path: wasmUrl });

// Pre-fetched bytes or a compiled WebAssembly.Module
await init({ module_or_path: await fetch(url) });
await init({ module_or_path: myWebAssemblyModule });
```

On the Node package, `init()` is a no-op: the WASM is already loaded
by the time `require`/`import` returns. Calling `await init()` still
works, so the same consumer code runs on both targets.

### Coordinates

`PREFIX-SEED-OTHER-STORYCODE-MIXCODE`:

- `SNDST-A-42-0-0-0` basegame Sandstone, seed 42, no stories or mixing
- `V-SNDST-C-42-0-4A-MUWF1` Spaced Out Vanilla Sandstone, all stories and mixing
- `CER-C-100-0-4A-MUWF1` Spaced Out Ceres, seed 100

## API

The public surface is a default `init` export and a `worldgen`
singleton. The singleton wraps the one-slot cluster cache inside the
WASM module: `worldgen.generate(coord)` populates it, and every
other method operates on whatever's currently cached.

### Generation

```ts
worldgen.generate(coord: string): MapData
```

Generate a cluster from a game coordinate and return the decoded
map (see [`MapData` shape](#mapdata-shape)). Caches the cluster
internally, replacing anything previously cached.

```ts
worldgen.entities(): EntitySpawners
```

Re-run ambient mob spawning against the cached cluster's current
cell state and return the refreshed entity lists (geysers, buildings,
pickupables, others). Requires a prior `worldgen.generate` call;
useful after `worldgen.advance` chunks, when settled liquid/gas flow
can invalidate earlier mob placements. Template-placed entities
(geysers, oil wells, props) persist across calls.

```ts
worldgen.version(): string
```

Returns something like `"720697+0.1.0"`. The number before the
`+` is the ONI build this version targets; the number after is the
package version.

### Settle simulation (two-phase)

Worldgen takes hundreds of milliseconds. Settling the cluster takes
several seconds. The API is split so you can show a preview first
and fill in settled data progressively.

```ts
worldgen.advance(targetTick: number): SettleSnapshot
```

Advance the cached cluster's settle sim to `targetTick` (in
`1..=500`) and return a decoded snapshot at that tick. Call
repeatedly with increasing ticks to paint intermediate frames
instead of blocking the worker on one long 500-frame call. The last
call with `targetTick = 500` finalises the cluster.

```ts
const preview = worldgen.generate(coord);
renderPreview(preview);

for (let tick = 25; tick <= 500; tick += 25) {
  const snapshot = worldgen.advance(tick);
  renderFrame(snapshot);
}

worldgen.clear();
```

Throws if the cache is empty or `targetTick` is out of range.

### Editor

For tools that let users tweak worldgen and re-render: biome
tweakers, noise-tree editors, mob/critter balancers, preset
share-and-load flows. Normal consumers who just want the same
clusters the game produces don't need any of this. `worldgen.generate`
reads the stock settings the WASM ships with.

Every setting the worldgen pipeline reads (worlds, subworlds,
biomes, noise, traits, mobs, temperatures, rooms, templates, mixing
tables) can be exported and replaced as JS objects. Load, mutate,
load back, then call `worldgen.generate` again.

```ts
const full = worldgen.exportFullBundle();
// ...mutate the object...
worldgen.loadFullBundle(full);
// next worldgen.generate(...) uses the mutated settings
```

| Method | Returns / accepts | What's in it |
|---|---|---|
| `worldgen.exportWorldgenBundle()` | `WorldgenBundle` | Worlds, subworlds, clusters, biomes, noise, traits, story traits, feature settings, defaults, mixing |
| `worldgen.loadWorldgenBundle(b)` |  | Replace worldgen settings |
| `worldgen.exportLookupsBundle()` | `LookupsBundle` | Mobs, rooms, temperatures, templates |
| `worldgen.loadLookupsBundle(b)` |  | Replace lookup tables |
| `worldgen.exportFullBundle()` | `FullBundle` | Both of the above in one object |
| `worldgen.loadFullBundle(b)` |  | Replace both atomically |

Every `load*Bundle` call invalidates the cluster cache. If the
bundle is malformed, the current settings are kept and the call
throws.

Full TypeScript types for the bundles and their inner shapes
(`WorldgenBundle`, `LookupsBundle`, `FullBundle`, `World`,
`SubWorld`, `BiomeSettings`, `NoiseTree`, `WorldTrait`,
`FeatureSettings`, `MobConfig`, `RoomConfig`, `TemplateContainer`,
and the primitives they compose) ship with the package `.d.ts`.
Import them by name.

### Cache lifecycle

```ts
worldgen.clear(): void
worldgen.reset(): void
```

- `clear()` drops the cached generated cluster. Editor mutations
  (via `loadWorldgenBundle` / `loadLookupsBundle` / `loadFullBundle`)
  are preserved.
- `reset()` drops **both** the cluster cache and the editor
  mutations; next `generate()` reloads the embedded stock settings
  from scratch.

Cache semantics:

- **One slot.** A new `generate()` replaces the cached cluster.
- **Per-worker.** The cache is thread-local in WASM, so each Web
  Worker (or Node worker thread) has its own independent slot.
- **Evicted by `load*Bundle` / `reset`.** Mutated settings mean any
  cached cluster is out of date.

### Running in a web worker

The WASM module is several megabytes and worldgen can block the
thread for hundreds of milliseconds; settling several seconds. Run
it in a worker to keep the main thread responsive.

```ts
// worker.ts
import init, { worldgen } from
  '@tigin-backwards/oxygen-not-included-worldgen';

await init();

self.onmessage = async ({ data: { coord } }) => {
  const preview = worldgen.generate(coord);
  self.postMessage({ kind: 'preview', data: preview });

  for (let tick = 25; tick <= 500; tick += 25) {
    const snapshot = worldgen.advance(tick);
    self.postMessage({ kind: 'frame', data: snapshot });
  }

  worldgen.clear();
};
```

```ts
// main thread
const worker = new Worker(new URL('./worker.ts', import.meta.url),
                          { type: 'module' });
worker.onmessage = ({ data: { kind, data } }) => {
  if (kind === 'preview') renderPreview(data);
  if (kind === 'frame')   renderFrame(data);
};
worker.postMessage({ coord: 'V-SNDST-C-42-0-4A-MUWF1' });
```

### `MapData` shape

```ts
interface MapData {
  coordinate: string;
  seed: number;
  cluster_id: string;
  element_table: string[];            // element names indexed by element_idx
  starmap: StarmapEntry[];            // Spaced Out hex grid world locations
  starmap_pois: StarmapPoi[];         // Spaced Out non-asteroid hex POIs
  vanilla_starmap: VanillaStarmapEntry[]; // basegame rocket destinations
  worlds: WorldMapData[];
  failure: WorldgenFailure | null;    // populated on fatal worldgen error
  telemetry: WorldgenEvent[];         // fail-slow warnings (empty on clean runs)
}

interface WorldgenFailure {
  stage: string;                      // pipeline stage that reported the error
  world_index: number;                // -1 for cluster-level failures
  message: string;
}

interface WorldgenEvent {
  category: string;                   // e.g. "layout", "mob_spawning", "template_rules"
  message: string;                    // per-world entries prefixed with "world[N]:"
}

interface WorldMapData {
  name: string;                       // world config path
  width: number;
  height: number;
  is_starting: boolean;
  world_traits: string[];
  element_idx: number[];              // u16 per cell, row-major (width * height)
  mass: number[];                     // f32 per cell
  temperature: number[];              // f32 per cell
  disease_idx: number[];              // u8 per cell, 255 = none
  disease_count: number[];            // i32 per cell
  biome_cells: BiomeCell[];
  geysers: GeyserSpawn[];
  buildings: EntitySpawn[];
  pickupables: EntitySpawn[];
  other_entities: EntitySpawn[];
}

interface BiomeCell {
  id: number;
  type: string;                       // subworld type path
  x: number;
  y: number;
  poly: number[];                     // flat [x0,y0,x1,y1,...]
}

interface EntitySpawn {
  tag: string;                        // game prefab name
  cell: number;                       // grid cell index
  x: number;                          // cell % width
  y: number;                          // cell / width
}

interface GeyserSpawn extends EntitySpawn {
  type: string;                       // resolved geyser template name
  // Present when geyser stats were rolled:
  scaled_rate?: number;
  scaled_iter_len?: number;
  scaled_iter_pct?: number;
  scaled_year_len?: number;
  scaled_year_pct?: number;
}

interface StarmapEntry {
  world_index: number;
  q: number; r: number;               // hex grid coords
}

interface StarmapPoi {
  poi_type: string;                   // e.g. "HarvestableSpacePOI_*", "ArtifactSpacePOI"
  q: number; r: number;
  // Only on harvestable POIs:
  capacity_roll?: number;
  recharge_roll?: number;
  total_capacity?: number;
  recharge_time?: number;
}

// Basegame rocket destinations. Empty on Spaced Out clusters.
interface VanillaStarmapEntry {
  type: string;                       // destination type id
  distance: number;                   // distance tier
}
```

### `SettleSnapshot` shape

`worldgen.advance` returns typed-array views over cell data, not a
JSON array. One snapshot covers every world in the cluster.

```ts
interface SettleSnapshot {
  tick: number;                       // 1..=500
  worlds: SettleWorld[];
}

interface SettleWorld {
  width: number;
  height: number;
  element_idx: Uint16Array;
  mass: Float32Array;
  temperature: Float32Array;
  disease_idx: Uint8Array;            // 255 = none
  disease_count: Int32Array;
}
```

## Performance

Worldgen runtime, same machine both rows. Coordinate:
`V-SNDST-C-42-0-4A-MUWF1`, the Spaced Out Vanilla Sandstone cluster
at seed 42, with every story trait (`4A`) and every DLC mixing
option (`MUWF1`) enabled. 8 worlds, ~170,000 cells total.

**Time per seed:**

| Runtime | Time |
|---|---|
| In-game World Generation | 10.4 s |
| This package (Node 24) | 0.58 s |

WASM worldgen runs roughly 18x faster than the game's C# worldgen.

**Memory usage** (one worldgen at a time, measured on the same
cluster, resident memory only):

| Runtime | Working set |
|---|---|
| In-game World Generation | ~3.3 GB |
| This package (Node 24) | ~0.2 GB |

WASM worldgen uses roughly 15x less memory than the game's C# worldgen.

Package size: 1.4 MB gzipped, 9.5 MB uncompressed (the WASM module
is nearly all of it). Load it in a web worker so the download and
instantiate don't block the main thread.

## License

**MIT.**

