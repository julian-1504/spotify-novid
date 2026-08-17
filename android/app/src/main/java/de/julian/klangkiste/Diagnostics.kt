package de.julian.klangkiste

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject

/**
 * What the playback plumbing is actually doing, in one place a phone can be
 * asked about it.
 *
 * This exists because of where the app runs. The phones are on kids' wrists and
 * in kids' pockets, not on a desk beside a laptop, so `adb logcat` is not
 * available when something goes wrong — and every link in the chain from the
 * page to the notification fails *silently* on purpose: the trust gate returns,
 * the JSON parse gives up, `startForeground` is caught, a foreground start from
 * the background is refused. Each of those is the right thing to do to a music
 * player, and together they made „es geht nicht" the whole of the diagnosis.
 *
 * So every one of those paths writes a line here on its way past, and
 * [PlaybackBridge.status] hands the result back to the page, which shows it on
 * /konto. The same lines go to logcat under [TAG] for the day there *is* a
 * laptop.
 *
 * Deliberately nothing but facts the app already shows or already knows: a host
 * name, some booleans, a count. No tokens, no URLs, no track titles — those are
 * on the lock screen either way, and there is no reason to copy them here.
 */
object Diagnostics {

    const val TAG = "Klangkiste"

    /** The host of the page in the WebView, and whether the bridge accepts it. */
    @Volatile
    var pageHost: String = ""

    @Volatile
    var trusted: Boolean = false

    /** Reports accepted from the page, and when the last one arrived. */
    @Volatile
    var publishCount: Int = 0

    @Volatile
    private var lastPublishAt: Long = 0

    /**
     * The last thing that was swallowed, with the place it happened.
     *
     * One slot rather than a list: the useful answer is almost always the most
     * recent failure, and a growing buffer in a process that is meant to live
     * for hours is a leak with a nice name.
     */
    @Volatile
    var lastError: String? = null

    fun published() {
        publishCount++
        lastPublishAt = SystemClock.elapsedRealtime()
    }

    /** Something went wrong and was survived. Says where, so the page can too. */
    fun failed(where: String, why: String) {
        lastError = "$where: $why"
        Log.w(TAG, "$where: $why")
    }

    fun failed(where: String, error: Throwable) =
        failed(where, error.javaClass.simpleName + ": " + (error.message ?: "no message"))

    /** Worth saying out loud even when nothing is wrong. */
    fun note(message: String) = Log.i(TAG, message)

    /**
     * Everything above plus what has to be read from the system at the time of
     * asking — whether Android is showing notifications at all is a setting the
     * adult may change while this panel is open.
     */
    fun asJson(context: Context): String {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val service = PlaybackService.running()

        return JSONObject().apply {
            put("pageHost", pageHost)
            put("trusted", trusted)
            put("serviceRunning", service != null)
            put("foregrounded", service?.isForegrounded() == true)
            put("notificationsEnabled", manager.areNotificationsEnabled())
            put("channelImportance", PlaybackService.channelImportance(manager))
            put("publishCount", publishCount)
            put(
                "lastPublishAgoMs",
                if (lastPublishAt == 0L) -1 else SystemClock.elapsedRealtime() - lastPublishAt,
            )
            lastError?.let { put("lastError", it) }
            put("androidSdk", Build.VERSION.SDK_INT)
        }.toString()
    }
}
