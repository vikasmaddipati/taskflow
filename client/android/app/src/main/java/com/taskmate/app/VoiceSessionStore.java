package com.taskmate.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.TimeZone;

public final class VoiceSessionStore {
    private static final String PREFS_NAME = "TaskMateVoicePrefs";
    private static final String KEY_BASE_URL = "base_url";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";
    private static final String KEY_ORG_ID = "org_id";
    private static final String KEY_WORKSPACE_ID = "workspace_id";
    private static final String KEY_TIMEZONE = "timezone";
    private static final String DEFAULT_BASE_URL = "https://taskflow.zerosyntax.in/api";

    private VoiceSessionStore() {}

    public static void save(
        Context context,
        String baseUrl,
        String token,
        String refreshToken,
        String orgId,
        String workspaceId,
        String timezone
    ) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (baseUrl != null && !baseUrl.trim().isEmpty()) {
            editor.putString(KEY_BASE_URL, baseUrl.trim().replaceAll("/+$", ""));
        }
        if (token != null) editor.putString(KEY_TOKEN, token);
        if (refreshToken != null) editor.putString(KEY_REFRESH_TOKEN, refreshToken);
        if (orgId != null) editor.putString(KEY_ORG_ID, orgId);
        if (workspaceId != null) editor.putString(KEY_WORKSPACE_ID, workspaceId);
        if (timezone != null && !timezone.trim().isEmpty()) {
            editor.putString(KEY_TIMEZONE, timezone.trim());
        }
        editor.apply();
    }

    public static void updateTokens(Context context, String token, String refreshToken) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        if (token != null && !token.isEmpty()) editor.putString(KEY_TOKEN, token);
        if (refreshToken != null && !refreshToken.isEmpty()) editor.putString(KEY_REFRESH_TOKEN, refreshToken);
        editor.apply();
    }

    public static void clear(Context context) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
    }

    public static String getBaseUrl(Context context) {
        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String url = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL);
        if (url == null || url.trim().isEmpty() || url.startsWith("/")) {
            return DEFAULT_BASE_URL;
        }
        return url.replaceAll("/+$", "");
    }

    public static String getToken(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TOKEN, "");
    }

    public static String getRefreshToken(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_REFRESH_TOKEN, "");
    }

    public static String getOrgId(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_ORG_ID, "");
    }

    public static String getWorkspaceId(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_WORKSPACE_ID, "");
    }

    public static String getTimezone(Context context) {
        String tz = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TIMEZONE, "");
        return (tz == null || tz.isEmpty()) ? TimeZone.getDefault().getID() : tz;
    }
}
