package de.julian.klangkiste

import android.content.Context
import android.content.Intent
import android.provider.Settings
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
        if (!trusted()) {
            Diagnostics.failed("publish", "refused: ${Diagnostics.pageHost} is not the site")
            return
        }

        val report = try {
            JSONObject(json)
        } catch (error: Exception) {
            // Nothing the page could send is worth crashing the app it is in.
            Diagnostics.failed("publish", error)
            return
        }

        Diagnostics.published()
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

    /**
     * This phone is not the box any more — another one was chosen, or the DOM
     * guard tripped.
     *
     * Deliberately *not* what a quiet moment sends. The page used to say this
     * whenever the SDK reported no state, which happens at every track boundary,
     * and it took the foreground service with it at the one moment the service
     * existed for. src/player/nativeHost.ts `idleFrom` is the other half of that
     * correction: a lull publishes a paused snapshot and keeps the service.
     */
    @JavascriptInterface
    fun stopped() {
        if (!trusted()) return
        Diagnostics.note("page says this phone is no longer the player")
        PlaybackService.stop()
    }

    /**
     * What the plumbing is doing, as JSON, for the panel on /konto.
     *
     * The phones this runs on are never plugged into a laptop, so this is the
     * only way to tell a bridge that was refused from a service that would not
     * start from a notification Android is simply not showing. See [Diagnostics].
     *
     * An untrusted page still gets its own host and the refusal, and nothing
     * else. That is not a hole: a page always knows its own address, so saying
     * it back tells it nothing — and this is the one failure that cannot explain
     * itself from behind the gate that causes it.
     */
    @JavascriptInterface
    fun status(): String {
        if (!trusted()) {
            return JSONObject()
                .put("pageHost", Diagnostics.pageHost)
                .put("trusted", false)
                .toString()
        }
        return Diagnostics.asJson(context)
    }

    /**
     * Opens Android's notification settings for this app.
     *
     * The way back from „Nicht zulassen". Android shows the permission dialog
     * twice and then stops, so from that point asking again from inside the app
     * is a silent no-op and this screen is the only remedy left — which is
     * exactly the state a phone is in by the time anybody goes looking for why
     * the notification never appears.
     */
    @JavascriptInterface
    fun openNotificationSettings() {
        if (!trusted()) return

        try {
            context.startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                    // From the application context, so this needs a task of its own.
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        } catch (error: Exception) {
            // A phone with no such screen is not one to crash over.
            Diagnostics.failed("openNotificationSettings", error)
        }
    }
}
