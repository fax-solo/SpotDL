package com.spotdl.app;

import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.webClick;
import static androidx.test.espresso.web.webdriver.DriverAtoms.getText;
import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static org.hamcrest.Matchers.containsString;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject;
import androidx.test.uiautomator.UiSelector;

import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PermissionsE2ETest {

    @Rule
    public ActivityTestRule<MainActivity> activityRule =
            new ActivityTestRule<>(MainActivity.class, true, true);

    private Context appContext;
    private UiDevice device;

    @Before
    public void setUp() {
        appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    }

    @Test
    public void appLaunchesSuccessfully() {
        assertNotNull(activityRule.getActivity());
    }

    @Test
    public void appHasInternetPermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.INTERNET);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasVibratePermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.VIBRATE);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasWakeLockPermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.WAKE_LOCK);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasForegroundServicePermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.FOREGROUND_SERVICE);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasForegroundServiceDataSyncPermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.FOREGROUND_SERVICE_DATA_SYNC);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasForegroundServiceMediaPlaybackPermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasPostNotificationsPermissionDeclared() {
        // POST_NOTIFICATIONS is a runtime permission on Android 13+,
        // but it must be declared in the manifest on all versions
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.POST_NOTIFICATIONS);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void appHasReceiveBootCompletedPermission() {
        int result = appContext.checkCallingOrSelfPermission(
                android.Manifest.permission.RECEIVE_BOOT_COMPLETED);
        assertEquals(PackageManager.PERMISSION_GRANTED, result);
    }

    @Test
    public void manifestDeclaresAllRequiredPermissions() throws Exception {
        String packageName = appContext.getPackageName();
        PackageManager pm = appContext.getPackageManager();

        // Verify the manifest declares the permissions at build time.
        // This checks that AndroidManifest.xml includes the <uses-permission> entries.
        String[] requestedPerms = pm.getPackageInfo(
                packageName, PackageManager.GET_PERMISSIONS
        ).requestedPermissions;

        assertNotNull("No permissions declared in manifest", requestedPerms);

        boolean hasInternet = false;
        boolean hasWakeLock = false;
        boolean hasForegroundService = false;
        boolean hasForegroundServiceDataSync = false;
        boolean hasForegroundServiceMediaPlayback = false;
        boolean hasPostNotifications = false;
        boolean hasVibrate = false;
        boolean hasReceiveBootCompleted = false;
        boolean hasWriteExternalStorage = false;
        boolean hasUseExactAlarm = false;

        for (String perm : requestedPerms) {
            switch (perm) {
                case "android.permission.INTERNET": hasInternet = true; break;
                case "android.permission.WAKE_LOCK": hasWakeLock = true; break;
                case "android.permission.FOREGROUND_SERVICE": hasForegroundService = true; break;
                case "android.permission.FOREGROUND_SERVICE_DATA_SYNC": hasForegroundServiceDataSync = true; break;
                case "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK": hasForegroundServiceMediaPlayback = true; break;
                case "android.permission.POST_NOTIFICATIONS": hasPostNotifications = true; break;
                case "android.permission.VIBRATE": hasVibrate = true; break;
                case "android.permission.RECEIVE_BOOT_COMPLETED": hasReceiveBootCompleted = true; break;
                case "android.permission.WRITE_EXTERNAL_STORAGE": hasWriteExternalStorage = true; break;
                case "android.permission.USE_EXACT_ALARM": hasUseExactAlarm = true; break;
            }
        }

        assertTrue("Missing INTERNET", hasInternet);
        assertTrue("Missing WAKE_LOCK", hasWakeLock);
        assertTrue("Missing FOREGROUND_SERVICE", hasForegroundService);
        assertTrue("Missing FOREGROUND_SERVICE_DATA_SYNC", hasForegroundServiceDataSync);
        assertTrue("Missing FOREGROUND_SERVICE_MEDIA_PLAYBACK", hasForegroundServiceMediaPlayback);
        assertTrue("Missing POST_NOTIFICATIONS", hasPostNotifications);
        assertTrue("Missing VIBRATE", hasVibrate);
        assertTrue("Missing RECEIVE_BOOT_COMPLETED", hasReceiveBootCompleted);
        assertTrue("Missing WRITE_EXTERNAL_STORAGE", hasWriteExternalStorage);
        assertTrue("Missing USE_EXACT_ALARM", hasUseExactAlarm);
    }

    @Test
    public void settingsPageShowsPermissionsSection() throws Exception {
        // Navigate to settings — the app should load the WebView
        // with the settings page containing permission toggles.

        // Wait for the WebView to load and check the page contains
        // the Permissions heading and permission toggles
        onWebView()
                .withTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                .check(webMatches(
                    findElement(getText(), "#root"),
                    containsString("Permis")
                ));
    }
}
