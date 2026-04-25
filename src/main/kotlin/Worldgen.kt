package de.stefanoltmann.onised.contributor

import com.caoccao.javet.interop.NodeRuntime
import com.caoccao.javet.interop.V8Host
import com.caoccao.javet.values.reference.V8ValueGlobalObject

object Worldgen {

    private val nodeRuntime: NodeRuntime

    init {

        nodeRuntime = V8Host.getNodeInstance().createV8Runtime()

        val globalObject: V8ValueGlobalObject = nodeRuntime.globalObject

        val wasmBytes = Thread.currentThread().contextClassLoader
            .getResourceAsStream("worldgen/oni_wasm_bg.wasm")!!
            .readAllBytes()

        globalObject.set("wasmBytes", wasmBytes)

        nodeRuntime.getExecutor(
            "let cachedUint8ArrayMemory0 = null;" +
                "function getUint8ArrayMemory0() {" +
                "    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {" +
                "        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);" +
                "    }" +
                "    return cachedUint8ArrayMemory0;" +
                "}" +
                "let WASM_VECTOR_LEN = 0;" +
                "const cachedTextEncoder = new TextEncoder();" +
                "const cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });" +
                "function passStringToWasm0(arg, malloc, realloc) {" +
                "    if (realloc === undefined) {" +
                "        const buf = cachedTextEncoder.encode(arg);" +
                "        const ptr = malloc(buf.length, 1) >>> 0;" +
                "        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);" +
                "        WASM_VECTOR_LEN = buf.length;" +
                "        return ptr;" +
                "    }" +
                "    let len = arg.length;" +
                "    let ptr = malloc(len, 1) >>> 0;" +
                "    const mem = getUint8ArrayMemory0();" +
                "    let offset = 0;" +
                "    for (; offset < len; offset++) {" +
                "        const code = arg.charCodeAt(offset);" +
                "        if (code > 0x7F) break;" +
                "        mem[ptr + offset] = code;" +
                "    }" +
                "    if (offset !== len) {" +
                "        if (offset !== 0) { arg = arg.slice(offset); }" +
                "        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;" +
                "        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);" +
                "        const ret = cachedTextEncoder.encodeInto(arg, view);" +
                "        offset += ret.written;" +
                "        ptr = realloc(ptr, len, offset, 1) >>> 0;" +
                "    }" +
                "    WASM_VECTOR_LEN = offset;" +
                "    return ptr;" +
                "}" +
                "function getStringFromWasm0(ptr, len) {" +
                "    ptr = ptr >>> 0;" +
                "    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));" +
                "}" +
                "let wasmModule, wasm;" +
                "function __wbg_get_imports() {" +
                "    const import0 = {" +
                "        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) { throw new Error(getStringFromWasm0(arg0, arg1)); }," +
                "        __wbg_now_16f0c993d5dd6c27: function() { return Date.now(); }," +
                "        __wbindgen_cast_0000000000000001: function(arg0, arg1) { return getStringFromWasm0(arg0, arg1); }," +
                "        __wbindgen_init_externref_table: function() {" +
                "            const table = wasm.__wbindgen_externrefs;" +
                "            const offset = table.grow(4);" +
                "            table.set(0, undefined);" +
                "            table.set(offset + 0, undefined);" +
                "            table.set(offset + 1, null);" +
                "            table.set(offset + 2, true);" +
                "            table.set(offset + 3, false);" +
                "        }," +
                "    };" +
                "    return { './oni_wasm_bg.js': import0 };" +
                "}" +
                "function __wbg_finalize_init(instance, module) {" +
                "    wasm = instance.exports;" +
                "    wasmModule = module;" +
                "    cachedUint8ArrayMemory0 = null;" +
                "    wasm.__wbindgen_start();" +
                "    return wasm;" +
                "}" +
                "(function() {" +
                "    const wasmByteArray = wasmBytes;" +
                "    const imports = __wbg_get_imports();" +
                "    const result = WebAssembly.instantiate(wasmByteArray.buffer, imports);" +
                "    if (result instanceof WebAssembly.Instance) {" +
                "        __wbg_finalize_init(result, undefined);" +
                "    } else {" +
                "        result.then(function(res) { __wbg_finalize_init(res.instance, res.module); });" +
                "    }" +
                "})();" +
                "globalThis.worldgen = {" +
                "    generate: function(coord) {" +
                "        let deferred2_0, deferred2_1;" +
                "        try {" +
                "            const ptr0 = passStringToWasm0(coord, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);" +
                "            const len0 = WASM_VECTOR_LEN;" +
                "            const ret = wasm.generate_map_data(ptr0, len0);" +
                "            deferred2_0 = ret[0]; deferred2_1 = ret[1];" +
                "            return getStringFromWasm0(ret[0], ret[1]);" +
                "        } finally {" +
                "            if (deferred2_0) wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);" +
                "        }" +
                "    }" +
                "};"
        ).executeVoid()

        nodeRuntime.await()
    }

    fun generate(coordinate: String): String =
        nodeRuntime.getExecutor(
            "const r = JSON.parse(worldgen.generate('$coordinate'));" +
                "delete r.element_table;" +
                "for (const world of r.worlds) {" +
                "    delete world.element_idx;" +
                "    delete world.mass;" +
                "    delete world.temperature;" +
                "    delete world.disease_idx;" +
                "    delete world.disease_count;" +
                "    delete world.pickupables;" +
                "    for (const cell of world.biome_cells) { delete cell.type; }" +
                "    for (const geyserSpawn of world.geysers) { delete geyserSpawn.cell; }" +
                "    for (const entitySpawn of world.other_entities) { delete entitySpawn.cell; }" +
                "    for (const entitySpawn of world.buildings) {" +
                "        delete entitySpawn.cell;" +
                "        delete entitySpawn.connections;" +
                "        delete entitySpawn.rotationOrientation;" +
                "    }" +
                "}" +
                "for (const poi of r.starmap_pois) {" +
                "    delete poi.capacity_roll;" +
                "    delete poi.recharge_roll;" +
                "    delete poi.total_capacity;" +
                "    delete poi.recharge_time;" +
                "}" +
                "JSON.stringify(r);"
        ).executeString()
}
