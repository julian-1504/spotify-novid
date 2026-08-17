package de.julian.klangkiste

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * What keeps the music going once the screen is off.
 *
 * The problem this solves is particular to this app being a WebView. When a kid
 * picks „Dieses Handy", the Web Playback SDK runs *in the page*: the stream, the
 * Widevine session and the Connect registration all live in this app's own
 * processes. Spotify's server advances a playlist, but only onto a device that
 * is still there to receive the next track.
 *
 * With no foreground service, the app became a cached process the moment the
 * Activity stopped — frozen by Android, its network deferred, its renderer's
 * priority waived (see [MainActivity.configure]). The buffered track played out,
 * the boundary was never crossed, and the SDK device was gone by the time the
 * phone was unlocked again: a kid had to press play for every single song.
 *
 * A foreground service of type mediaPlayback is the contract Android actually
 * offers for this, and its notification is not a tax but the point — with the
 * phone in a pocket driving a Bluetooth box, this is the only transport a kid
 * can reach. The page's own `navigator.mediaSession` (src/player/mediaSession.ts)
 * does not reach the system from inside a WebView; this does.
 *
 * State arrives from the page through [PlaybackBridge]. Buttons travel the other
 * way through [Transport], which [MainActivity] implements by calling into the
 * page. This service never talks to Spotify itself.
 *
 * Its lifetime is the kid's *choice*, not the music: it goes up the moment
 * „Dieses Handy" is the selected box and stays up, paused notification and all,
 * until another box is chosen. That is not neatness. Android only lets an app
 * start a foreground service while it is visible, and the moments this service
 * is most needed — a track ending with the phone locked — are precisely the
 * moments it could not be started. So it is claimed at the one reliable
 * opportunity and then never let go of.
 */
class PlaybackService : Service() {

    /** What the notification's buttons do. Implemented by [MainActivity]. */
    interface Transport {
        fun play()
        fun pause()
        fun next()
        fun previous()
        fun seekTo(positionMs: Long)
    }

    /** Everything the notification shows, as the page last reported it. */
    data class Snapshot(
        val playing: Boolean,
        val title: String,
        val artist: String,
        val artworkUrl: String?,
        val durationMs: Long,
        val positionMs: Long,
    )

    private lateinit var session: MediaSession
    private lateinit var notifications: NotificationManager
    private val main = Handler(Looper.getMainLooper())
    private val artworkLoader = Executors.newSingleThreadExecutor()

    private var snapshot = Snapshot(false, "", "", null, 0, 0)
    private var artwork: Bitmap? = null
    private var artworkUrl: String? = null
    private var foregrounded = false

    /**
     * Set once this service is on its way out. Pausing the music is itself a
     * change the page reports back, so without this a swiped-away notification
     * would put itself up again a moment later to announce the pause.
     */
    @Volatile
    private var finishing = false

    /**
     * Held only while something is playing. Audio output keeps the CPU up on its
     * own, but a track boundary is a gap in the audio — and the gap is exactly
     * when the page has fetching and decoding to do.
     *
     * Deliberately absent beside it: a `WifiLock`. Every mode that would have
     * applied here is a documented no-op from Android 10 on, and the one that
     * still works only works with the screen on, which is the case that was
     * never broken. Being a foreground service is what keeps the radio usable.
     */
    private val wakeLock: PowerManager.WakeLock by lazy {
        (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Klangkiste:playback")
    }

    override fun onCreate() {
        super.onCreate()
        instance = this

        notifications = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notifications.createNotificationChannel(
            // LOW: this is a status display with buttons on it, not something
            // that should make a sound of its own over the music.
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.channel_playback),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = getString(R.string.channel_playback_description)
                setShowBadge(false)
            },
        )

        session = MediaSession(this, "Klangkiste").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() { transport?.play() }
                override fun onPause() { transport?.pause() }
                override fun onSkipToNext() { transport?.next() }
                override fun onSkipToPrevious() { transport?.previous() }
                override fun onSeekTo(pos: Long) { transport?.seekTo(pos) }
                // A headset's stop button. There is nothing to stop but the
                // sound, so it means pause.
                override fun onStop() { transport?.pause() }
            })
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_COMMAND -> {
                dispatch(intent.getStringExtra(EXTRA_COMMAND))
                // Nothing here knows what the page will make of the button yet,
                // so re-rendering would only re-post the state being left —
                // the old play/pause icon, and a wake lock taken or dropped on
                // a snapshot that is about to be replaced. The page's report
                // arrives in a moment and renders the truth.
                //
                // Only safe once the notification is up: before that, render()
                // is what meets startForegroundService's deadline.
                if (foregrounded) return START_NOT_STICKY
            }
            ACTION_STOP -> {
                // Swiped away. Silence first, then take the notification with it:
                // a notification that is gone while music plays leaves a kid with
                // no way to stop it.
                transport?.pause()
                finish()
                return START_NOT_STICKY
            }
            else -> intent?.let { snapshot = snapshotFrom(it) }
        }

        // Unconditional, and load-bearing: a service started with
        // startForegroundService that does not go foreground within a few
        // seconds is killed with a crash, whatever the intent was for.
        render()
        return START_NOT_STICKY
    }

    /**
     * A fresh report from the page. Called straight from [PlaybackBridge] rather
     * than through another `startForegroundService`, because Android 12 and
     * later refuse to *start* a foreground service from the background — and
     * every interesting update (the track that follows the one that just ended)
     * arrives precisely then.
     */
    fun update(next: Snapshot) {
        if (finishing) return
        main.post {
            snapshot = next
            render()
        }
    }

    /**
     * Whether the notification is actually up. Running and foregrounded are two
     * different things, and the gap between them is one of the failures worth
     * being able to name from /konto.
     */
    fun isForegrounded(): Boolean = foregrounded

    /** Playback is over. Drops the notification and the service with it. */
    fun finish() {
        finishing = true
        // Straight away, and on this thread rather than the main one: everything
        // that arrives between here and onDestroy is dropped by the `finishing`
        // guard, and while `instance` still pointed at this corpse a later
        // report could neither update it nor start a replacement. That window is
        // short in wall-clock terms and long enough to have swallowed the resume
        // after a pause.
        instance = null
        main.post {
            releaseWakeLock()
            session.isActive = false
            stopForeground(STOP_FOREGROUND_REMOVE)
            foregrounded = false
            stopSelf()
        }
    }

    private fun dispatch(command: String?) {
        val t = transport ?: return
        when (command) {
            COMMAND_PLAY -> t.play()
            COMMAND_PAUSE -> t.pause()
            COMMAND_NEXT -> t.next()
            COMMAND_PREVIOUS -> t.previous()
        }
    }

    /** Pushes the current snapshot to the session, the notification and the CPU. */
    private fun render() {
        if (finishing) return
        loadArtwork(snapshot.artworkUrl)
        publishSession()

        val notification = buildNotification()
        if (foregrounded) {
            notifications.notify(NOTIFICATION_ID, notification)
        } else {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
                foregrounded = true
                Diagnostics.note("foreground service up")
            } catch (error: Exception) {
                // Android 12+ refuses a foreground start from the background. The
                // music is already playing at this point; losing the notification
                // is worth less than crashing the app out from under it.
                //
                // Recorded rather than only survived: this is the failure that
                // costs the music once the screen goes off, and from the outside
                // it looks exactly like a notification that never showed up.
                Diagnostics.failed("startForeground", error)
                stopSelf()
                return
            }
        }

        if (snapshot.playing) acquireWakeLock() else releaseWakeLock()
    }

    private fun publishSession() {
        session.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title())
                .putString(MediaMetadata.METADATA_KEY_ARTIST, snapshot.artist)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, snapshot.durationMs)
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork)
                .build(),
        )

        session.setPlaybackState(
            PlaybackState.Builder()
                // Android 13 and later draw their media control from these, not
                // from the notification's own actions.
                .setActions(
                    PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_PLAY_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_SEEK_TO,
                )
                .setState(
                    if (snapshot.playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                    snapshot.positionMs,
                    if (snapshot.playing) 1f else 0f,
                )
                .build(),
        )

        // Active means "this is the session the volume keys and a Bluetooth
        // box's own buttons talk to". Kept on across a pause, or the buttons
        // would stop working at the moment they are needed to resume.
        session.isActive = true
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_note)
            .setContentTitle(title())
            .setContentText(snapshot.artist)
            .setLargeIcon(artwork)
            .setContentIntent(openApp())
            .setDeleteIntent(serviceIntent(ACTION_STOP))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setShowWhen(false)
            .setOngoing(snapshot.playing)
            .addAction(
                action(R.drawable.ic_previous, R.string.playback_previous, COMMAND_PREVIOUS),
            )
            .addAction(
                if (snapshot.playing) {
                    action(R.drawable.ic_pause, R.string.playback_pause, COMMAND_PAUSE)
                } else {
                    action(R.drawable.ic_play, R.string.playback_play, COMMAND_PLAY)
                },
            )
            .addAction(action(R.drawable.ic_next, R.string.playback_next, COMMAND_NEXT))
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    // All three, so the collapsed notification is a transport
                    // rather than a label.
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .build()

    private fun title(): String =
        snapshot.title.ifBlank { getString(R.string.playback_unknown_title) }

    private fun action(icon: Int, label: Int, command: String): Notification.Action =
        Notification.Action.Builder(
            Icon.createWithResource(this, icon),
            getString(label),
            serviceIntent(ACTION_COMMAND, command),
        ).build()

    private fun serviceIntent(action: String, command: String? = null): PendingIntent {
        val intent = Intent(this, PlaybackService::class.java)
            .setAction(action)
            .putExtra(EXTRA_COMMAND, command)
        return PendingIntent.getService(
            this,
            command.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun openApp(): PendingIntent =
        PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )

    /**
     * Cover art, fetched off the main thread and remembered until the song
     * changes. Best effort throughout: the notification says the right thing
     * with or without a picture, so a failure here is silent.
     */
    private fun loadArtwork(url: String?) {
        if (url == artworkUrl) return
        artworkUrl = url
        artwork = null

        if (url.isNullOrBlank() || !url.startsWith("https://")) return
        artworkLoader.execute {
            var connection: HttpURLConnection? = null
            val bitmap = try {
                connection = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = ARTWORK_TIMEOUT_MS
                    readTimeout = ARTWORK_TIMEOUT_MS
                }
                connection.inputStream.use(BitmapFactory::decodeStream)
            } catch (_: Exception) {
                null
            } finally {
                connection?.disconnect()
            } ?: return@execute

            main.post {
                // The song may have moved on while this was in flight.
                if (url != artworkUrl) return@post
                artwork = bitmap
                publishSession()
                if (foregrounded) notifications.notify(NOTIFICATION_ID, buildNotification())
            }
        }
    }

    private fun acquireWakeLock() {
        if (!wakeLock.isHeld) wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS)
    }

    private fun releaseWakeLock() {
        if (wakeLock.isHeld) wakeLock.release()
    }

    override fun onDestroy() {
        releaseWakeLock()
        artworkLoader.shutdown()
        session.release()
        // Only if it is still ours. `finish` clears it early so a replacement
        // can be started at once, and that replacement may already be the one
        // this field points at by the time this runs.
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val CHANNEL_ID = "playback"
        private const val NOTIFICATION_ID = 1

        private const val ACTION_COMMAND = "de.julian.klangkiste.COMMAND"
        private const val ACTION_STOP = "de.julian.klangkiste.STOP"
        private const val EXTRA_COMMAND = "command"

        private const val COMMAND_PLAY = "play"
        private const val COMMAND_PAUSE = "pause"
        private const val COMMAND_NEXT = "next"
        private const val COMMAND_PREVIOUS = "previous"

        private const val EXTRA_PLAYING = "playing"
        private const val EXTRA_TITLE = "title"
        private const val EXTRA_ARTIST = "artist"
        private const val EXTRA_ARTWORK = "artwork"
        private const val EXTRA_DURATION = "duration"
        private const val EXTRA_POSITION = "position"

        /**
         * A ceiling, not a schedule. The lock is released the moment the page
         * says playback stopped; this is only there so a page that dies without
         * saying so cannot hold the CPU up until the battery is flat.
         */
        private const val WAKE_LOCK_TIMEOUT_MS = 3 * 60 * 60 * 1000L

        private const val ARTWORK_TIMEOUT_MS = 10_000

        /** The running service, so an update need not start one. */
        @Volatile
        private var instance: PlaybackService? = null

        /**
         * Where the notification's buttons go. Set by [MainActivity] for as long
         * as there is a WebView to send them to.
         */
        @Volatile
        var transport: Transport? = null

        /**
         * Tell the notification what is playing, starting the service if this is
         * the first word of it.
         */
        fun publish(context: Context, snapshot: Snapshot) {
            instance?.let {
                it.update(snapshot)
                return
            }

            try {
                context.startForegroundService(
                    Intent(context, PlaybackService::class.java)
                        .putExtra(EXTRA_PLAYING, snapshot.playing)
                        .putExtra(EXTRA_TITLE, snapshot.title)
                        .putExtra(EXTRA_ARTIST, snapshot.artist)
                        .putExtra(EXTRA_ARTWORK, snapshot.artworkUrl)
                        .putExtra(EXTRA_DURATION, snapshot.durationMs)
                        .putExtra(EXTRA_POSITION, snapshot.positionMs),
                )
            } catch (error: Exception) {
                // Playback that begins while the app is hidden cannot start a
                // foreground service on Android 12+. The music still plays; it
                // simply plays the way it did before this service existed —
                // which is to say not for long, so this is worth recording.
                Diagnostics.failed("startForegroundService", error)
            }
        }

        /** The live service, for [Diagnostics]. Null when there is none. */
        fun running(): PlaybackService? = instance

        /** 0 means the adult switched the channel off; -1 that it is not there yet. */
        fun channelImportance(manager: NotificationManager): Int =
            manager.getNotificationChannel(CHANNEL_ID)?.importance ?: -1

        /** Playback is over, or the app is going away. */
        fun stop() {
            instance?.finish()
        }

        private fun snapshotFrom(intent: Intent) = Snapshot(
            playing = intent.getBooleanExtra(EXTRA_PLAYING, false),
            title = intent.getStringExtra(EXTRA_TITLE).orEmpty(),
            artist = intent.getStringExtra(EXTRA_ARTIST).orEmpty(),
            artworkUrl = intent.getStringExtra(EXTRA_ARTWORK),
            durationMs = intent.getLongExtra(EXTRA_DURATION, 0),
            positionMs = intent.getLongExtra(EXTRA_POSITION, 0),
        )
    }
}
