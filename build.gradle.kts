plugins {
    application
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ktor)
    alias(libs.plugins.git.versioning)
}

group = "de.stefan-oltmann"

gitVersioning.apply {

    refs {
        /* The main branch contains the current dev version */
        branch("main") {
            version = "\${commit.short}"
        }
    }

    /* Fallback if the branch was not found (for feature branches) */
    rev {
        version = "\${commit.short}"
    }
}

kotlin {
    jvmToolchain(jdkVersion = 25)
}

application {

    mainClass.set("ApplicationKt")

    val isDevelopment: Boolean = project.ext.has("development")
    applicationDefaultJvmArgs = listOf("-Dio.ktor.development=$isDevelopment")
}

sourceSets {
    main {
        kotlin {
            srcDir(layout.buildDirectory.dir("generated/source"))
        }
    }
}

repositories {
    mavenCentral()
    maven(url = "https://central.sonatype.com/repository/maven-snapshots/")
}

dependencies {

    /* Ktor server */
    implementation(libs.bundles.ktor.server)
    implementation(libs.logback.classic)

    /* Ktor client (kept for future contributor wiring) */
    implementation(libs.ktor.client.okhttp)

    /* Coroutines */
    implementation(libs.kotlinx.coroutines.core)

    /* Domain model */
    implementation(libs.oniSeedBrowserModel)

    /* Javet — core + per-platform natives.
     * The Windows native is needed for local dev; the two Linux natives
     * are needed for the Docker image (amd64 + arm64 from CI). All three
     * are runtimeOnly so they don't appear on the compile classpath. */
    implementation(libs.javet.core)
    runtimeOnly(libs.javet.windows)
    runtimeOnly(libs.javet.linux.amd64)
    runtimeOnly(libs.javet.linux.arm64)

    /* Tests */
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.ktor.server.test.host)
}

// region Version
project.afterEvaluate {

    logger.lifecycle("Generate Version.kt")

    val outputDir = layout.buildDirectory.file("generated/source/").get().asFile

    outputDir.mkdirs()

    val file = File(outputDir.absolutePath, "Version.kt")

    file.printWriter().use { writer ->

        writer.println("const val VERSION: String = \"$version\"")

        writer.flush()
    }
}
// endregion
