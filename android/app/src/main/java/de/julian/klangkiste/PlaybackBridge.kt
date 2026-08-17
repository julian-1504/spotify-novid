package de.julian.klangkiste

import android.content.Context
import android.webkit.JavascriptInterface
import org.json.JSONObject

/**
 * How the page tells the app what is playing.
 *
 * Injected as `window.Klangkiste`; the page's half is `src/player/nativeHost.ts`,
 * which is a no-op in a plain browser. Commands travel the other way, through
 * [PlaybackService.Transport].
 *
 * Both methods run on the WebView's JavaScript thread, never the main one, and
 * both hand straight off to [PlaybackService], which hops to the main thread
 * itself.
 *
 * The [trusted] guard is the same idea as the navigation allowlist in
 * [MainActivity]: an injected interface is offered to whatever page the WebView
 * has loaded, and the allowlist deliberately admits `accounts.spotify.com` for
 * sign-in. Only the deployed site may say what is playing. The worst a breach
 * could do is post a wrong notification — but a bridge that is open to a page we
 * do not write is not a thing to leave lying around, and the guard costs a line.
 */
class PlaybackBridge(
    private val context: Context,
    private val trusted: () -> Boolean,
) {

    /** `{playing, title, artist, artworkUrl, durationMs, positionMs}` as JSON. */
    @JavascriptInterface
    fun publish(json: String) {
        if (!trusted()) return

        val report = try {
            JSONObject(json)
        } catch (_: Exception) {
            // Nothing the page could send is worth crashing the app it is in.
            return
        }

        PlaybackService.publish(
            context,
            PlaybackService.Snapshot(
                playing = report.optBoolean("playing"),
                title = report.optString("title"),
                artist = report.optString("artist"),
                artworkUrl = report.optString("artworkUrl").ifBlank { null },
                durationMs = report.optLong("durationMs"),
                positionMs = report.optLong("positionMs"),
            ),
        )
    }

    /** Nothing is playing any more: no device, no track, or the guard tripped. */
    @JavascriptInterface
    fun stopped() {
        if (!trusted()) return
        PlaybackService.stop()
    }
}
