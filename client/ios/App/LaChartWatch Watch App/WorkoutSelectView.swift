// WorkoutSelectView.swift
// LaChartWatch
//
// Screen 2: Scrollable list of workout type cards.

import SwiftUI

struct WorkoutSelectView: View {

    @EnvironmentObject var appState: AppState

    var body: some View {
        ScrollView {
            VStack(spacing: LC.s8) {
                Text("Choose workout")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.lcText2)
                    .padding(.top, LC.s4)

                ForEach(WorkoutType.all) { workout in
                    WorkoutCard(workout: workout) {
                        appState.selectedWorkout = workout
                        appState.go(.sensors)
                    }
                }
            }
            .padding(.horizontal, LC.s8)
            .padding(.bottom, LC.s12)
        }
        .background(Color.lcBg.ignoresSafeArea())
        .navigationBarHidden(true)
    }
}

// MARK: - WorkoutCard

struct WorkoutCard: View {
    let workout: WorkoutType
    let onTap:   () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: LC.s10) {
                // Icon
                ZStack {
                    Circle()
                        .fill(Color.lcPrimary.opacity(0.2))
                        .frame(width: 36, height: 36)
                    Image(systemName: workout.icon)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.lcPrimary)
                }

                // Labels
                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.lcText)
                    Text(workout.sub)
                        .font(.system(size: 11))
                        .foregroundColor(.lcText3)
                }

                Spacer()

                // GPS / structured badge
                if workout.hasGPS {
                    Image(systemName: "location.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.lcSecondary)
                }
                if workout.isStructured {
                    Image(systemName: "list.bullet.clipboard")
                        .font(.system(size: 10))
                        .foregroundColor(.lcWarning)
                }
            }
            .padding(.horizontal, LC.s12)
            .padding(.vertical, LC.s10)
            .background(Color.lcCard)
            .cornerRadius(LC.r10)
        }
        .buttonStyle(.plain)
    }
}
