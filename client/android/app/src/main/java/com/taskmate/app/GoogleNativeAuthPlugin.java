package com.taskmate.app;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "GoogleNativeAuth")
public class GoogleNativeAuthPlugin extends Plugin {
    private GoogleSignInClient mGoogleSignInClient;

    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.trim().isEmpty()) {
            call.reject("Google Web Client ID is required");
            return;
        }

        try {
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(clientId.trim())
                .requestEmail()
                .build();

            mGoogleSignInClient = GoogleSignIn.getClient(getActivity(), gso);

            // Clear any previously cached sign-in so user can always pick an account
            mGoogleSignInClient.signOut().addOnCompleteListener(t -> {
                Intent signInIntent = mGoogleSignInClient.getSignInIntent();
                startActivityForResult(call, signInIntent, "handleSignInResult");
            });
        } catch (Exception e) {
            call.reject("Failed initializing Google Sign-In: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        try {
            Intent data = result.getData();
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account != null) {
                JSObject ret = new JSObject();
                ret.put("idToken", account.getIdToken());
                ret.put("email", account.getEmail());
                ret.put("name", account.getDisplayName());
                if (account.getPhotoUrl() != null) {
                    ret.put("imageUrl", account.getPhotoUrl().toString());
                }
                call.resolve(ret);
            } else {
                call.reject("Google Sign-In returned null account");
            }
        } catch (ApiException e) {
            String msg = "Google Sign-In canceled or failed (code " + e.getStatusCode() + ")";
            if (e.getStatusCode() == 12500) {
                msg = "Google Sign-In failed (status 12500). Please ensure Google Play Services is updated.";
            } else if (e.getStatusCode() == 10) {
                msg = "Google Sign-In developer error (code 10). Verify Android Client ID and SHA-1 in Google Cloud.";
            }
            call.reject(msg, String.valueOf(e.getStatusCode()));
        } catch (Exception e) {
            call.reject("Google Sign-In failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        if (mGoogleSignInClient != null) {
            mGoogleSignInClient.signOut().addOnCompleteListener(t -> call.resolve());
        } else {
            call.resolve();
        }
    }
}
