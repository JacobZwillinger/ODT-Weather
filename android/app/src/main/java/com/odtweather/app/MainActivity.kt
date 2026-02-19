package com.odtweather.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.preference.PreferenceManager
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val LOCATION_PERMISSION_REQUEST = 1001

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        // Set up WebViewAssetLoader to serve assets via https:// scheme
        // This avoids file:// CORS issues with PMTiles and fetch()
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        // Configure WebView settings
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // localStorage for toggle state
            allowContentAccess = true
            setGeolocationEnabled(true)
            // Allow mixed content for API calls from local page
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        // Handle geolocation permissions
        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                // Check if we have location permission
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false)
                } else {
                    // Store callback and request permission
                    pendingGeoCallback = callback
                    pendingGeoOrigin = origin
                    requestLocationPermission()
                }
            }
        }

        // Add JavaScript bridge for API key management
        webView.addJavascriptInterface(AppBridge(this), "AndroidBridge")

        // Load the web app via asset loader
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingGeoOrigin: String? = null

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ),
            LOCATION_PERMISSION_REQUEST
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            val granted = grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingGeoCallback?.invoke(pendingGeoOrigin ?: "", granted, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null

            if (!granted) {
                Toast.makeText(this, "Location permission needed for GPS tracking", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Pause GPS when app goes to background
    override fun onPause() {
        super.onPause()
        webView.evaluateJavascript("if(window._gpsCleanup) window._gpsCleanup()", null)
    }

    // Resume GPS when app comes back to foreground
    override fun onResume() {
        super.onResume()
        webView.evaluateJavascript("if(window._gpsResume) window._gpsResume()", null)
    }

    // Handle back button: close overlays before exiting
    @Deprecated("Use OnBackPressedCallback instead")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            "(function() { " +
                "var overlays = document.querySelectorAll('.fullscreen-overlay:not([hidden]), .sources-modal.visible');" +
                "if (overlays.length > 0) { " +
                "  var top = overlays[overlays.length - 1]; " +
                "  if (top.classList.contains('fullscreen-overlay')) { top.setAttribute('hidden', ''); } " +
                "  top.classList.remove('visible'); " +
                "  return 'closed'; " +
                "} " +
                "return 'none'; " +
            "})()"
        ) { result ->
            if (result == "\"none\"") {
                @Suppress("DEPRECATION")
                super.onBackPressed()
            }
        }
    }

    // JavaScript bridge for API key and Android detection
    class AppBridge(private val activity: MainActivity) {

        @JavascriptInterface
        fun getApiKey(): String {
            return PreferenceManager.getDefaultSharedPreferences(activity)
                .getString("pirateweather_api_key", "") ?: ""
        }

        @JavascriptInterface
        fun setApiKey(key: String) {
            PreferenceManager.getDefaultSharedPreferences(activity)
                .edit()
                .putString("pirateweather_api_key", key)
                .apply()
        }

        @JavascriptInterface
        fun isAndroid(): Boolean = true
    }
}
