# Keep the JavaScript interface methods
-keepclassmembers class com.odt.app.MainActivity$AppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
