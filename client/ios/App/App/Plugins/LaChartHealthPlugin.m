//
//  LaChartHealthPlugin.m
//  App
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LaChartHealthPlugin, "LaChartHealth",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getPluginVersion, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestAuthorization, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getAuthorizationStatus, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(queryAggregated, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(readSamples, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(queryWorkouts, CAPPluginReturnPromise);
)
