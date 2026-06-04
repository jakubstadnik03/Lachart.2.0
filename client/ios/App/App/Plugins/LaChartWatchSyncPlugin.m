//
//  LaChartWatchSyncPlugin.m
//  App
//
//  Capacitor plugin registration glue — exposes the Swift class above
//  to Capacitor's runtime via CAP_PLUGIN(). Without this file the JS
//  call resolves with "LaChartWatchSync plugin not implemented".
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LaChartWatchSyncPlugin, "LaChartWatchSync",
    CAP_PLUGIN_METHOD(isWatchPaired, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(flushPending,  CAPPluginReturnPromise);
)
