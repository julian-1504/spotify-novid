// Versions are pinned rather than left to a catalogue: this is a single-module
// project with one plugin and no libraries, so a catalogue would be more moving
// parts than it saves. Bumping these is safe and expected — Android Studio will
// offer it, and nothing here depends on a particular AGP feature.
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
