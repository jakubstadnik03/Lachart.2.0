import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Static lock UI shown when a free user hits a premium-only feature.
 *
 * IMPORTANT — Apple Guideline 3.1.3 compliance:
 *   • No "Subscribe" / "Upgrade" button
 *   • No external link or URL component
 *   • No price information
 *   • Just plain text instructing the user that the feature is premium.
 *
 * Users discover lachart.app on their own (email, marketing, account-creation flow).
 * Same model as TrainingPeaks, Strava, Spotify, Netflix on iOS.
 */

type Props = {
  featureName: string;
  description?: string;
  compact?: boolean;
};

export function PremiumLocked({ featureName, description, compact }: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>🔒</Text>
      </View>
      <Text style={styles.title}>{featureName}</Text>
      <Text style={styles.subtitle}>This is a LaChart Premium feature.</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      <Text style={styles.hint}>
        Premium subscriptions are managed on the LaChart website.
      </Text>
    </View>
  );
}

/**
 * Inline badge variant — for list rows / buttons that should appear locked.
 * Doesn't include the long text; just shows the lock icon + label.
 */
export function PremiumBadge({ label = 'Premium' }: { label?: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>🔒 {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    gap: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wrapCompact: {
    padding: 16,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  icon: { fontSize: 26 },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    fontWeight: '600',
  },
  desc: {
    fontSize: 13,
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
});
