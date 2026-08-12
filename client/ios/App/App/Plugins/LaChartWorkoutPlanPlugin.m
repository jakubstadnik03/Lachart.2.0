//
//  LaChartWorkoutPlanPlugin.m
//  App
//
//  Capacitor plugin registration glue — exposes the Swift class to
//  Capacitor's runtime via CAP_PLUGIN(). The Swift class also conforms to
//  CAPBridgedPlugin (Capacitor 6 discovery), but this macro keeps parity
//  with the other LaChart plugins.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// ⚠️ This list must stay in sync with `pluginMethods` in the Swift class.
// A method missing here is unreachable from JS on the ObjC registration path,
// which fails silently — the promise never resolves and the auto-sync no-ops.
CAP_PLUGIN(LaChartWorkoutPlanPlugin, "LaChartWorkoutPlan",
    CAP_PLUGIN_METHOD(isAvailable,           CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAuthorization,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAuthorizationState, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(scheduleWorkout,       CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getScheduledWorkouts,  CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(removeWorkout,         CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getLimits,             CAPPluginReturnPromise);
)
