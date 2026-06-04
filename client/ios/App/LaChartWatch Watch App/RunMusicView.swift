// RunMusicView.swift
// LaChartWatch
//
// Apple-style Now Playing pane — visual replica of the system Now Playing
// view on watchOS. Looks identical to what users see when they tap the
// Music complication or Now Playing on iPhone (red gradient background,
// big album art tile, large track title, AirPlay row, transport ring).
//
// **Important:** none of the transport buttons here actually drive iPhone
// playback. `MPMusicPlayerController` is iOS-only on watchOS, and
// `MPRemoteCommandCenter` only forwards events to the current audio
// session — which is never us. Apple solves this in their own Workout app
// by routing every tap on Now Playing transport into the system's full
// controller, where commands DO work. We do the same: every tap opens
// `music://` so the user lands on the real, working Apple Now Playing.

import SwiftUI
import MediaPlayer
import WatchKit

struct RunMusicView: View {

    // Updated from MPNowPlayingInfoCenter — readable on watchOS even
    // when we're not the audio session, just not writable.
    @State private var trackTitle: String = "Not Playing"
    @State private var trackArtist: String = "Tap to open Music"

    var body: some View {
        ZStack {
            // Apple-style dark gradient — softly tinted with the LaChart
            // primary so it's recognisably "ours" but unmistakably Now
            // Playing in feel.
            LinearGradient(
                colors: [
                    Color.lcPrimaryDark.opacity(0.45),
                    Color.lcBg
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: LC.s6) {
                // Album art tile — big squircle with music symbol
                Button(action: openSystemNowPlaying) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [Color.lcPrimaryLite.opacity(0.7), Color.lcSecondary.opacity(0.8)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 70, height: 70)
                            .shadow(color: Color.black.opacity(0.4), radius: 6, y: 3)

                        Image(systemName: "music.note")
                            .font(.system(size: 30, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                .buttonStyle(.plain)

                // Track title + artist — narrow centred labels just like Apple
                VStack(spacing: 1) {
                    Text(trackTitle)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(trackArtist)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white.opacity(0.65))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .padding(.horizontal, LC.s6)

                // Transport ring — backward · play/pause · forward.
                // Visual style matches Apple's Now Playing buttons. Each
                // one routes through `openSystemNowPlaying` so the user
                // lands in the real controls.
                HStack(spacing: LC.s12) {
                    transportIcon("backward.fill", size: 16)
                    transportIcon("play.fill", size: 22, isPrimary: true)
                    transportIcon("forward.fill", size: 16)
                }
                .padding(.top, LC.s2)

                // AirPlay-style hint at the very bottom
                HStack(spacing: 4) {
                    Image(systemName: "airplayaudio")
                        .font(.system(size: 11, weight: .semibold))
                    Text("AirPlay")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundColor(.white.opacity(0.55))
                .padding(.top, LC.s2)
                .onTapGesture { openSystemNowPlaying() }
            }
            .padding(.horizontal, LC.s4)
        }
        .onAppear { refreshNowPlayingInfo() }
    }

    // MARK: - Transport button (visual only, opens system Now Playing)

    @ViewBuilder
    private func transportIcon(_ symbol: String, size: CGFloat, isPrimary: Bool = false) -> some View {
        Button(action: openSystemNowPlaying) {
            ZStack {
                Circle()
                    .fill(Color.white.opacity(isPrimary ? 0.22 : 0.15))
                    .frame(
                        width: isPrimary ? 44 : 36,
                        height: isPrimary ? 44 : 36
                    )
                Image(systemName: symbol)
                    .font(.system(size: size, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - System interaction

    /// Open the system Music app, which puts the user one tap from the
    /// real Now Playing controller with functional play / pause / skip /
    /// volume / AirPlay routing. Identical UX to what Apple's own Workout
    /// app does on Music swipe.
    private func openSystemNowPlaying() {
        if let url = URL(string: "music://") {
            WKExtension.shared().openSystemURL(url)
        }
    }

    /// Pull the currently-playing track for the labels. `MPNowPlayingInfoCenter`
    /// is read-only on watchOS but is allowed to peek at the system audio
    /// session — so we can label the tile with the real track even though
    /// we can't control it.
    private func refreshNowPlayingInfo() {
        let info = MPNowPlayingInfoCenter.default().nowPlayingInfo
        if let title = info?[MPMediaItemPropertyTitle] as? String, !title.isEmpty {
            trackTitle = title
        }
        if let artist = info?[MPMediaItemPropertyArtist] as? String, !artist.isEmpty {
            trackArtist = artist
        }
    }
}
