package com.anonymous.androMolt.automation

/**
 * Maps common app names to their package names
 */
object AppPackageMapper {
    private val commonApps = mapOf(
        // Social
        "whatsapp" to "com.whatsapp",
        "instagram" to "com.instagram.android",
        "facebook" to "com.facebook.katana",
        "twitter" to "com.twitter.android",
        "x" to "com.twitter.android",
        "telegram" to "org.telegram.messenger",
        "linkedin" to "com.linkedin.android",
        "snapchat" to "com.snapchat.android",
        "tiktok" to "com.zhiliaoapp.musically",
        "reddit" to "com.reddit.frontpage",

        // Media
        "youtube" to "com.google.android.youtube",
        "spotify" to "com.spotify.music",
        "netflix" to "com.netflix.mediaclient",
        "prime video" to "com.amazon.avod.thirdpartyclient",
        "hotstar" to "in.startv.hotstar",
        "jio cinema" to "com.jio.media.jiobeats",
        "youtube music" to "com.google.android.apps.youtube.music",

        // Productivity
        "gmail" to "com.google.android.gm",
        "chrome" to "com.android.chrome",
        "drive" to "com.google.android.apps.docs",
        "maps" to "com.google.android.apps.maps",
        "google maps" to "com.google.android.apps.maps",
        "calendar" to "com.google.android.calendar",
        "notes" to "com.google.android.keep",
        "keep" to "com.google.android.keep",
        "docs" to "com.google.android.apps.docs.editors.docs",
        "sheets" to "com.google.android.apps.docs.editors.sheets",
        "slides" to "com.google.android.apps.docs.editors.slides",

        // Shopping
        "amazon" to "in.amazon.mShop.android.shopping",
        "flipkart" to "com.flipkart.android",
        "myntra" to "com.myntra.android",
        "swiggy" to "in.swiggy.android",
        "zomato" to "com.application.zomato",
        "paytm" to "net.one97.paytm",
        "phonepe" to "com.phonepe.app",
        "gpay" to "com.google.android.apps.nbu.paisa.user",
        "google pay" to "com.google.android.apps.nbu.paisa.user",

        // Messaging
        "messages" to "com.google.android.apps.messaging",
        "phone" to "com.google.android.dialer",
        "contacts" to "com.google.android.contacts",

        // System
        "settings" to "com.android.settings",
        "camera" to "com.android.camera2",
        "gallery" to "com.google.android.apps.photos",
        "photos" to "com.google.android.apps.photos",
        "clock" to "com.google.android.deskclock",
        "calculator" to "com.google.android.calculator",

        // Entertainment
        "games" to "com.android.vending",
        "play store" to "com.android.vending",
        "playstore" to "com.android.vending",
    )

    private val userMappings = mutableMapOf<String, String>()

    /**
     * Get package name from app name
     */
    fun getPackageName(appName: String): String? {
        val normalized = appName.lowercase().trim()

        // Check user-defined mappings first
        userMappings[normalized]?.let { return it }

        // Check common apps
        return commonApps[normalized]
    }

    /**
     * Add custom app mapping
     */
    fun addUserMapping(appName: String, packageName: String) {
        userMappings[appName.lowercase()] = packageName
    }

    /**
     * Get all known app names
     */
    fun getAllKnownApps(): List<String> {
        return (commonApps.keys + userMappings.keys).distinct().sorted()
    }
}
