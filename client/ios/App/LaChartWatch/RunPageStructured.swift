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
        StructuredStep(kind: .warmup,  label: "Rozehřátí",   target: "Z1–Z2",  duration: 600,  zone: 2),
        StructuredStep(kind: .work,    label: "4' Práh",     target: "4:15 /km", duration: 240, zone: 4),
        StructuredStep(kind: .rest,    label: "2' Klid",     target: "Z1",      duration: 120, zone: 1),
        StructuredStep(kind: .work,    label: "4' Práh",     target: "4:15 /km", duration: 240, zone: 4),
        StructuredStep(kind: .rest,    label: "2' Klid",     target: "Z1",      duration: 120, zone: 1),
        StructuredStep(kind: .cooldown, label: "Vyklusání",  target: "Z1",      duration: 600, zone: 1),
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
        ZStack {
            Color.lcBg.ignoresSafeArea()

            VStack(spacing: LC.s8) {
                // Ring timer
                ZStack {
                    RingTimerView(
                        progress: stepProgress,
                        remaining: stepRemaining,
                        color: Color.lcZone(currentStep.zone)
                    )
                    .frame(width: 90, height: 90)

                    VStack(spacing: 2) {
                        Text(stepRemaining.mmss)
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundColor(.lcText)
                            .monospacedDigit()
                        Text(currentStep.label)
                            .font(.system(size: 10))
                            .foregroundColor(.lcText2)
                            .lineLimit(1)
                    }
                }
                .padding(.top, LC.s8)

                // Target + zone badge
                HStack(spacing: LC.s8) {
                    Text(currentStep.target)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(Color.lcZone(currentStep.zone))

                    Text("Z\(currentStep.zone)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color.lcZone(currentStep.zone))
                        .padding(.horizontal, LC.s6)
                        .padding(.vertical, LC.s2)
                        .background(Color.lcZone(currentStep.zone).opacity(0.2))
                        .cornerRadius(LC.r6)
                }

                // Current metric (pace)
                MetricView(label: "Tempo", value: live.pace.paceString, unit: "/km",
                           valueColor: .lcSecondary, size: 28)

                // Next step
                if let next = nextStep {
                    HStack(spacing: LC.s6) {
                        Text("Dále:")
                            .font(.system(size: 10))
                            .foregroundColor(.lcText3)
                        Text(next.label)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color.lcZone(next.zone))
                        Text(next.target)
                            .font(.system(size: 10))
                            .foregroundColor(.lcText3)
                    }
                    .padding(.horizontal, LC.s8)
                    .padding(.vertical, LC.s4)
                    .background(Color.lcCard.opacity(0.7))
                    .cornerRadius(LC.r8)
                }

                Spacer()
            }
            .padding(.horizontal, LC.s8)
        }
    }
}
