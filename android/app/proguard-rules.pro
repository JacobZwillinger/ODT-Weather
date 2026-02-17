# Keep the JavaScript interface methods
-keepclassmembers class com.odtweather.app.MainActivity$AppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
