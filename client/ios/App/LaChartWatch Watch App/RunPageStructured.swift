// RunPageStructured.swift
// LaChartWatch
//
// Run page 0 (structured workouts): Ring timer showing current step progress,
// step label, target, zone colour, and next step preview.

import SwiftUI

struct RunPageStructured: View {

    @EnvironmentObject var appState: AppState
    private var live: LiveMetrics { appState.live }

    // Hardcoded sample steps — in production loaded from App Group / WCSession
    private let steps: [StructuredStep] = [
        StructuredStep(kind: .warmup,  label: "Warm-up",   target: "Z1–Z2",  duration: 600,  zone: 2),
        StructuredStep(kind: .work,    label: "4' Threshold",     target: "4:15 /km", duration: 240, zone: 4),
        StructuredStep(kind: .rest,    label: "2' Easy",     target: "Z1",      duration: 120, zone: 1),
        StructuredStep(kind: .work,    label: "4' Threshold",     target: "4:15 /km", duration: 240, zone: 4),
        StructuredStep(kind: .rest,    label: "2' Easy",     target: "Z1",      duration: 120, zone: 1),
        StructuredStep(kind: .cooldown, label: "Cool-down",  target: "Z1",      duration: 600, zone: 1),
    ]

    private var currentStep: StructuredStep {
        let idx = live.stepIndex.clamped(to: 0...(steps.count - 1))
        return steps[idx]
    }
    private var nextStep: StructuredStep? {
        let next = live.stepIndex + 1
        return next < steps.count ? steps[next] : nil
    }

    // Progress within current step
    private var stepProgress: Double {
        let stepElapsed = live.elapsed.truncatingRemainder(dividingBy: currentStep.duration)
        return stepElapsed / currentStep.duration
    }

    private var stepRemaining: TimeInterval {
        let stepElapsed = live.elapsed.truncatingRemainder(dividingBy: currentStep.duration)
        return max(0, currentStep.duration - stepElapsed)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: LC.s2) {
                // Ring timer
                ZStack {
                    RingTimerView(
                        progress: stepProgress,
                        remaining: stepRemaining,
                        color: Color.lcZone(currentStep.zone)
                    )
                    .frame(width: 78, height: 78)

                    VStack(spacing: 1) {
                        Text(stepRemaining.mmss)
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(.lcText)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                        Text(currentStep.label)
                            .font(.system(size: 9))
                            .foregroundColor(.lcText2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .padding(.horizontal, 8)
                }

                // Target + zone badge
                HStack(spacing: LC.s6) {
                    Text(currentStep.target)
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(Color.lcZone(currentStep.zone))

                    Text("Z\(currentStep.zone)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color.lcZone(currentStep.zone))
                        .padding(.horizontal, LC.s4)
                        .padding(.vertical, 1)
                        .background(Color.lcZone(currentStep.zone).opacity(0.2))
                        .cornerRadius(LC.r6)
                }

                // Current metric (pace)
                MetricView(label: "Pace", value: live.pace.paceString, unit: "/km",
                           valueColor: .lcSecondary, size: 22)

                // Next step
                if let next = nextStep {
                    HStack(spacing: LC.s4) {
                        Text("Next:")
                            .font(.system(size: 9))
                            .foregroundColor(.lcText3)
                        Text(next.label)
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(Color.lcZone(next.zone))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text(next.target)
                            .font(.system(size: 9))
                            .foregroundColor(.lcText3)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, LC.s6)
                    .padding(.vertical, LC.s2)
                    .background(Color.lcCard.opacity(0.7))
                    .cornerRadius(LC.r6)
                }
            }
            .padding(.horizontal, 2)
            .padding(.top, -4)
            .padding(.bottom, LC.s2)
        }
        .background(Color.lcBg)
    }
}
