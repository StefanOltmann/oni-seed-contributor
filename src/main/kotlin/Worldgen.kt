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
            """
                // TODO
            """.trimIndent()
        ).executeVoid()

        nodeRuntime.await()
    }

    fun generate(coordinate: String): String =
        nodeRuntime.getExecutor(
            // FIXME Use clearer naming
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
