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

        versionCode = 1
        versionName = "1.0"

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
