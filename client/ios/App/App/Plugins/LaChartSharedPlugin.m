//
//  LaChartSharedPlugin.m
//  App
//
//  Objective-C glue that exposes the Swift plugin to Capacitor's runtime.
//  Capacitor's auto-registration discovers plugins through CAP_PLUGIN()
//  macros at link time — without this file the JS side gets
//  "LaChartShared plugin not implemented" at runtime.
//

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LaChartSharedPlugin, "LaChartShared",
    CAP_PLUGIN_METHOD(setFormFitness, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(reloadWidgets,  CAPPluginReturnPromise);
)
