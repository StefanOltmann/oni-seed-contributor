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

// region Version
// Generate a Version.kt with the git-derived project version. Wired as
// a proper task (rather than the old afterEvaluate block) so that
// `compileKotlin` automatically depends on it via srcDir(generateVersionKt).
// This makes `./gradlew clean test` work — the previous version ran
// generation at configuration time, and `clean` would delete the file
// before `compileKotlin` ran.
val generateVersionKt by tasks.registering {
    val outputDir = layout.buildDirectory.dir("generated/source")
    val versionString = providers.provider { project.version.toString() }
    inputs.property("version", versionString)
    outputs.dir(outputDir)
    doLast {
        val dir = outputDir.get().asFile
        dir.mkdirs()
        File(dir, "Version.kt").writeText(
            "const val VERSION: String = \"${versionString.get()}\"\n"
        )
    }
}

sourceSets {
    main {
        kotlin {
            srcDir(generateVersionKt)
        }
    }
}
// endregion

repositories {
    mavenCentral()
    maven(url = "https://central.sonatype.com/repository/maven-snapshots/")
}

dependencies {

    /* Ktor server */
    implementation(libs.bundles.ktor.server)
    implementation(libs.logback.classic)

    /* Ktor client — used by ContributorService to POST uploads to the backend. */
    implementation(libs.ktor.client.core)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.json)

    /* Coroutines */
    implementation(libs.kotlinx.coroutines.core)

    /* Domain model */
    implementation(libs.oniSeedBrowserModel)

    /*
     * Javet — core + per-platform natives.
     * The Windows native is needed for local dev; the two Linux natives
     * are needed for the Docker image (amd64 + arm64 from CI). All three
     * are runtimeOnly so they don't appear on the compile classpath.
     */
    implementation(libs.javet.core)
    runtimeOnly(libs.javet.windows)
    runtimeOnly(libs.javet.linux.amd64)
    runtimeOnly(libs.javet.linux.arm64)

    /* Tests */
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.ktor.server.test.host)
}

