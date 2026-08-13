package de.julian.klangkiste

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

/**
 * The whole app: one WebView showing the deployed site.
 *
 * Why this exists at all — and why it is not a PWA installed from Chrome:
 * Chrome's "Add to home screen" mints a WebAPK, but that package is only a
 * shell. Launching it hands off to a Chrome activity that does the rendering,
 * so the foreground package is Chrome, and Family Link — which enforces on the
 * foreground package — applies *Chrome's* limit no matter what limit the
 * WebAPK itself is given. Rendering inside our own Activity is what makes the
 * app a first-class app to Family Link: its own limit applies, and being
 * always-allowed actually works.
 *
 * The web app is unchanged and still runs in any browser. This is a second
 * front door onto the same deployment, not a fork of it: the page is loaded
 * from [BuildConfig.SITE_URL], so a Cloudflare deploy updates this app too and
 * a content change never needs a new APK.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView

    /**
     * Main-frame navigation is confined to these hosts. Everything else is
     * handed to the system browser.
     *
     * This is a safety property, not tidiness: without it the wrapper is a
     * browser with no content filtering and — the entire point of the exercise
     * — no screen-time limit, on a supervised phone. That would be a worse hole
     * than the problem being fixed.
     *
     * accounts. and challenge. are the Spotify sign-in and 2FA/captcha steps.
     * Note what is *not* here: open.spotify.com, which is the full Spotify web
     * player and will happily play music videos — admitting it would undo the
     * one guarantee this project exists to make. If a future sign-in step lands
     * on some other host, add that host here; do not widen this to a
     * `.spotify.com` suffix match.
     *
     * Sub-frames are exempt (see [shouldOverrideUrlLoading]): the Web Playback
     * SDK runs in an iframe from sdk.scdn.co, and blocking it would take the
     * phone out of the box picker.
     */
    private val allowedHosts: Set<String> by lazy {
        setOf(
            Uri.parse(BuildConfig.SITE_URL).host.orEmpty(),
            "accounts.spotify.com",
            "challenge.spotify.com",
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView = WebView(this)
        setContentView(webView)
        configure(webView.settings)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean {
                // Sub-frames (sdk.scdn.co) are the SDK's business, not ours.
                if (!request.isForMainFrame) return false
                if (request.url.host.orEmpty() in allowedHosts) return false
                openExternally(request.url)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            /**
             * Widevine. Spotify streams are DRM-protected, so the SDK asks for
             * EME — and in a WebView that arrives here and is *denied* unless
             * granted explicitly. Without this the phone silently stops being
             * usable as a box: playback fails and the app falls back to
             * Connect-only. Nothing else is granted; the app has no use for the
             * camera or microphone and should not be able to reach them.
             */
            override fun onPermissionRequest(request: PermissionRequest) {
                val protectedMedia = request.resources.filter {
                    it == PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID
                }.toTypedArray()

                if (protectedMedia.isEmpty()) request.deny() else request.grant(protectedMedia)
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.SITE_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun configure(settings: WebSettings) {
        settings.javaScriptEnabled = true

        // Every session, token and preference the app has lives in
        // localStorage, so without this the app cannot remember anyone.
        settings.domStorageEnabled = true

        // The Web Playback SDK starts audio from its own callbacks rather than
        // straight out of a tap, so the default gesture requirement would stop
        // playback before it began.
        settings.mediaPlaybackRequiresUserGesture = false

        // The Web Playback SDK refuses to run on a WebView user agent, which
        // surfaces in the app as the 'unsupported' failure and quietly costs
        // the phone its place in the box picker. Dropping the "; wv" token
        // leaves an otherwise untouched, honest Chrome-on-Android string.
        settings.userAgentString = settings.userAgentString.replace("; wv", "")

        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.setSupportMultipleWindows(false)
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.allowFileAccess = false
        settings.allowContentAccess = false
    }

    private fun openExternally(url: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    // Deprecated in favour of the predictive-back callback, which this app does
    // not opt into (see the manifest): while that is so, this is still the hook
    // Android calls. Without it, Back leaves the app from any screen instead of
    // stepping back through it.
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    /**
     * Note what is deliberately absent: no `webView.onPause()` and no
     * `pauseTimers()`. When this phone *is* the box, the kid presses home or
     * locks the screen and the podcast has to keep playing.
     */
    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
