"use strict";

// Dedicated sub-scope keeps the existing root PWA worker at /sw.js untouched.
// This worker contains no fetch/cache handler and never caches financial data.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

