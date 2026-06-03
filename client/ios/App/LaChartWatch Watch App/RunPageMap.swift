// RunPageMap.swift
// LaChartWatch
//
// Run page 6: Stylised dark map with route overlay,
// GPS pulse dot, distance + pace overlay bar.
//
// On watchOS there is no MapKit SwiftUI map with full style control
// so we simulate with a Canvas drawing of accumulated GPS track points.
// In production, CLLocationManager provides coordinates collected during run.

import SwiftUI
import CoreLocation
import Combine

struct RunPageMap: View {

    @EnvironmentObject var appState: AppState
    @StateObject private var locationProvider = MapLocationProvider()

    private var live: LiveMetrics { appState.live }

    var body: some View {
        ZStack {
            // Dark map tile background
            Color(hex: "#0D1017").ignoresSafeArea()

            // Route canvas
            if locationProvider.track.count > 1 {
                RouteCanvas(track: locationProvider.track)
            } else {
                // No GPS track yet — show grid placeholder
                MapPlaceholderGrid()
            }

            // GPS pulse dot (current position)
            if locationProvider.track.count > 0 {
                GPSPulseDot()
            }

            // Bottom overlay — distance + pace
            VStack {
                Spacer()
                HStack {
                    Label(String(format: "%.2f km", live.distance / 1000),
                          systemImage: "location.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.lcText)

                    Spacer()

                    Text(live.pace.paceString + " /km")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(.lcSecondary)
                        .monospacedDigit()
                }
                .padding(.horizontal, LC.s12)
                .padding(.vertical, LC.s8)
                .background(.ultraThinMaterial)
                .cornerRadius(LC.r10)
                .padding(.horizontal, LC.s8)
                .padding(.bottom, LC.s20)
            }
        }
        .onAppear { locationProvider.start() }
        .onDisappear { locationProvider.stop() }
    }
}

// MARK: - RouteCanvas

struct RouteCanvas: View {
    let track: [CLLocationCoordinate2D]

    var body: some View {
        Canvas { ctx, size in
            guard track.count > 1 else { return }

            // Normalise track to canvas bounds
            let lats = track.map(\.latitude)
            let lons = track.map(\.longitude)
            guard let minLat = lats.min(), let maxLat = lats.max(),
                  let minLon = lons.min(), let maxLon = lons.max() else { return }

            let latSpan = max(maxLat - minLat, 0.0001)
            let lonSpan = max(maxLon - minLon, 0.0001)
            let padding: Double = 20

            func point(_ coord: CLLocationCoordinate2D) -> CGPoint {
                let x = (coord.longitude - minLon) / lonSpan * (Double(size.width)  - padding * 2) + padding
                let y = (1 - (coord.latitude  - minLat) / latSpan) * (Double(size.height) - padding * 2) + padding
                return CGPoint(x: x, y: y)
            }

            // Zone-coloured path segments
            var path = Path()
            path.move(to: point(track[0]))
            for coord in track.dropFirst() {
                path.addLine(to: point(coord))
            }
            ctx.stroke(path,
                       with: .linearGradient(
                            Gradient(colors: [.lcPrimary, .lcSecondary, .lcTertiary]),
                            startPoint: .zero,
                            endPoint: CGPoint(x: size.width, y: size.height)
                       ),
                       lineWidth: 3)

            // Start dot
            let startPt = point(track[0])
            ctx.fill(Path(ellipseIn: CGRect(x: startPt.x - 4, y: startPt.y - 4, width: 8, height: 8)),
                     with: .color(.lcSuccess))
        }
    }
}

// MARK: - GPSPulseDot

struct GPSPulseDot: View {
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.lcSecondary.opacity(0.25))
                .frame(width: 20, height: 20)
                .scaleEffect(pulse ? 2.0 : 1.0)
                .opacity(pulse ? 0 : 0.6)
                .animation(.easeOut(duration: 1.2).repeatForever(autoreverses: false), value: pulse)

            Circle()
                .fill(Color.lcSecondary)
                .frame(width: 8, height: 8)
                .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
        }
        .onAppear { pulse = true }
    }
}

// MARK: - MapPlaceholderGrid

struct MapPlaceholderGrid: View {
    var body: some View {
        Canvas { ctx, size in
            let spacing: Double = 20
            var y = 0.0
            while y < size.height {
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                ctx.stroke(path, with: .color(.lcLine.opacity(0.4)), lineWidth: 0.5)
                y += spacing
            }
            var x = 0.0
            while x < size.width {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: size.height))
                ctx.stroke(path, with: .color(.lcLine.opacity(0.4)), lineWidth: 0.5)
                x += spacing
            }
        }

        // Center "Waiting GPS" label
        VStack {
            Image(systemName: "location.slash")
                .font(.system(size: 20))
                .foregroundColor(.lcText3)
            Text("Čekám na GPS")
                .font(.system(size: 11))
                .foregroundColor(.lcText3)
        }
    }
}

// MARK: - MapLocationProvider

/// Lightweight CLLocationManager wrapper for map track.
@MainActor
final class MapLocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var track: [CLLocationCoordinate2D] = []

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5  // metres between updates
    }

    func start() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func stop() {
        manager.stopUpdatingLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateLocations locations: [CLLocation]) {
        let coords = locations.map(\.coordinate)
        Task { @MainActor in
            self.track.append(contentsOf: coords)
            // Keep last 500 points to avoid memory growth on ultra-long runs
            if self.track.count > 500 {
                self.track.removeFirst(self.track.count - 500)
            }
        }
    }
}
