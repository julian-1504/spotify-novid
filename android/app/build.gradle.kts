import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * Release signing, if a keystore has been set up. `android/keystore.properties`
 * is deliberately not in the repo (see .gitignore) and holds:
 *
 *   storeFile=/absolute/path/to/klangkiste.jks
 *   storePassword=…
 *   keyAlias=klangkiste
 *   keyPassword=…
 *
 * Without it, `assembleRelease` still builds — it just produces an unsigned APK
 * that no phone will install. That is a clearer failure than a build that dies
 * on a missing file, and it keeps `assembleDebug` working on a fresh clone.
 */
val keystoreProperties = Properties().apply {
    val file = rootProject.file("keystore.properties")
    if (file.exists()) file.inputStream().use(::load)
}

android {
    namespace = "de.julian.klangkiste"
    compileSdk = 35

    defaultConfig {
        applicationId = "de.julian.klangkiste"
        minSdk = 26

        // Not 35, on purpose. Targeting 35 opts into Android 15's forced
        // edge-to-edge layout, which would draw the page under the status bar —
        // and a WebView does not hand the page usable safe-area insets, so the
        // app's own header would sit under the clock. Play Store uploads
        // require 35; this APK is sideloaded, so it does not apply.
        targetSdk = 34

        // Gradle properties rather than constants, for the same reason siteUrl is
        // one: the release workflow sets them per build, so cutting a version
        // needs no source change. gradle.properties holds the defaults, so a bare
        // `./gradlew assembleRelease` on a fresh clone still works.
        //
        // versionCode only ever has to climb. CI feeds it the run number, which is
        // monotonic and shared by both channels; Android refuses to install an APK
        // over one with a higher code.
        versionCode = providers.gradleProperty("klangkiste.versionCode").get().toInt()
        versionName = providers.gradleProperty("klangkiste.versionName").get()

        val siteUrl = providers.gradleProperty("klangkiste.siteUrl").get()
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
    }

    signingConfigs {
        if (keystoreProperties.isNotEmpty()) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }

        /**
         * The channel the APK workflow publishes for testing, pointed at a preview
         * deployment via -Pklangkiste.siteUrl.
         *
         * It inherits from `release` rather than from `debug`, and that is the
         * whole point of it existing: a debug build is `android:debuggable`, and
         * anything debuggable can be entered with `adb run-as` to read the app's
         * data directory — which holds a Spotify refresh token for every account
         * on the phone. A preview APK is published to a public repo and installed
         * on real phones, so it must be as locked down as the real thing.
         *
         * signingConfig is restated rather than left to initWith, so the key this
         * is signed with is visible here instead of inferred.
         *
         * Note for whoever installs one: the suffix makes this a *separate
         * package*, so Family Link sees a second app with its own screen-time
         * limit. Set that limit, or uninstall the preview when finished.
         */
        create("preview") {
            initWith(getByName("release"))
            applicationIdSuffix = ".preview"
            versionNameSuffix = "-preview"
            signingConfig = signingConfigs.findByName("release")
        }

        debug {
            // So a debug build can sit beside the real one on the same phone
            // without either replacing the other.
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

// No dependencies at all — not even AndroidX. The whole app is one Activity and
// a WebView, both in the platform, so anything added here would be weight
// without a job.
dependencies {
}
