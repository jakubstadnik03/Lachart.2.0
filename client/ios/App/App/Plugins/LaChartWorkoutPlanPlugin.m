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

CAP_PLUGIN(LaChartWorkoutPlanPlugin, "LaChartWorkoutPlan",
    CAP_PLUGIN_METHOD(isAvailable,          CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(scheduleWorkout,      CAPPluginReturnPromise);
)
