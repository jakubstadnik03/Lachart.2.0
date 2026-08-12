/**
 * DailyCoachCard — the day's coaching, first thing on the dashboard.
 *
 * The card model is built server-side (server/utils/dailyCoachCard.js) so this
 * screen and the web app can never tell the athlete two different things about
 * the same day. This file is presentational plus the voice picker.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { http } from '../api/http';
import { Card } from '../ui/components';
import { DailyCard, fetchDailyCard, lessonFor } from './dailyCard';

const STYLE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'supportive', label: 'Supportive' },
  { id: 'straight', label: 'Straight' },
  { id: 'direct', label: 'Direct' },
  { id: 'dark', label: 'Dark Night' },
  { id: 'nerd', label: 'Nerd' },
];

const SPORT_EMOJI: Record<string, string> = {
  run: '🏃', bike: '🚴', mtbike: '🚵', swim: '🏊', strength: '🏋️', gym: '🏋️',
  walk: '🚶', brick: '🔁', crosstrain: '🤸', rowing: '🚣', lactate: '🩸',
};

function Gauge({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeTrack}>
        {['#FCA5A5', '#FCD34D', '#CBD5E1', '#6EE7B7', '#7DD3FC'].map((c) => (
          <View key={c} style={[styles.gaugeSegment, { backgroundColor: c }]} />
        ))}
      </View>
      <View style={[styles.gaugeMarker, { left: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function SessionRow({ session, muted }: { session: DailyCard['todayPlanned'][0]; muted?: boolean }) {
  return (
    <View style={styles.sessionRow}>
      <Text style={styles.sessionEmoji}>{SPORT_EMOJI[session.sport] ?? '•'}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.sessionTitleRow}>
          <Text style={[styles.sessionTitle, muted && styles.muted]} numberOfLines={1}>
            {session.title}
          </Text>
          {session.hard ? (
            <View style={styles.hardBadge}>
              <Text style={styles.hardBadgeText}>HARD</Text>
            </View>
          ) : null}
        </View>
        {session.detail ? <Text style={styles.sessionDetail}>{session.detail}</Text> : null}
      </View>
    </View>
  );
}

export function DailyCoachCard({ athleteId }: { athleteId?: string }) {
  const [card, setCard] = useState<DailyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setCard(await fetchDailyCard(athleteId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [athleteId]);

  useEffect(() => { load(); }, [load]);

  const setStyle = useCallback(async (styleId: string) => {
    // Optimistic: the voice changes wording only, so a failed save is cosmetic
    // and correcting itself on next load is better than blocking the tap.
    setCard((prev) => (prev ? { ...prev, styleId } : prev));
    try {
      await http.put('/user/edit-profile', { notifications: { dailyCardStyle: styleId } });
      setCard(await fetchDailyCard(athleteId));
    } catch {
      /* keep the optimistic value; next load reconciles */
    }
  }, [athleteId]);

  if (loading && !card) {
    return (
      <Card>
        <ActivityIndicator />
      </Card>
    );
  }

  if (failed || !card) return null;

  const lesson = lessonFor(card);

  if (collapsed) {
    return (
      <Pressable onPress={() => setCollapsed(false)}>
        <View style={[styles.chip, { borderLeftColor: card.readiness.color }]}>
          <Text style={styles.chipTitle} numberOfLines={1}>{card.headline}</Text>
          <Text style={styles.chipBody} numberOfLines={1}>{card.pushBody}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.wrap, { borderTopColor: card.readiness.color }]}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {card.greeting ? <Text style={styles.greeting}>{card.greeting}</Text> : null}
          <Text style={styles.headline}>{card.headline}</Text>
        </View>
        <Pressable onPress={() => setShowSettings((v) => !v)} hitSlop={8} style={styles.iconBtn}>
          <Text style={styles.iconText}>⚙︎</Text>
        </Pressable>
        <Pressable onPress={() => setCollapsed(true)} hitSlop={8} style={styles.iconBtn}>
          <Text style={styles.iconText}>—</Text>
        </Pressable>
      </View>

      <Text style={styles.directive}>
        {card.styleId === 'nerd' ? card.readiness.readout : card.directive}
      </Text>
      {card.styleId === 'nerd' ? (
        <Text style={styles.directiveSub}>{card.directive}</Text>
      ) : null}

      {/* Readiness */}
      <View style={styles.metricsRow}>
        {[
          { label: 'Fitness', value: String(card.readiness.fitness) },
          { label: 'Fatigue', value: String(card.readiness.fatigue) },
          {
            label: 'Form',
            value: `${card.readiness.form > 0 ? '+' : ''}${card.readiness.form}`,
            color: card.readiness.color,
          },
        ].map((m) => (
          <View key={m.label} style={{ flex: 1 }}>
            <Text style={styles.metricLabel}>{m.label.toUpperCase()}</Text>
            <Text style={[styles.metricValue, m.color ? { color: m.color } : null]}>{m.value}</Text>
          </View>
        ))}
        <View style={[styles.statePill, { borderColor: card.readiness.color }]}>
          <Text style={[styles.statePillText, { color: card.readiness.color }]}>
            {card.readiness.label}
          </Text>
        </View>
      </View>

      <Gauge value={card.readiness.gauge} color={card.readiness.color} />

      {showSettings ? (
        <View style={styles.settings}>
          <Text style={styles.settingsLabel}>Coaching voice</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {STYLE_OPTIONS.map((opt) => {
              const active = opt.id === card.styleId;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setStyle(opt.id)}
                  style={[styles.styleChip, active && styles.styleChipActive]}
                >
                  <Text style={[styles.styleChipText, active && styles.styleChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* Today */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TODAY</Text>
        {card.todayPlanned.length ? (
          card.todayPlanned.map((s) => <SessionRow key={s.id} session={s} />)
        ) : card.todayCompleted.length ? (
          card.todayCompleted.map((s) => <SessionRow key={s.id} session={s} />)
        ) : (
          <Text style={styles.empty}>Nothing planned</Text>
        )}
      </View>

      {card.yesterday ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YESTERDAY</Text>
          <SessionRow session={card.yesterday} muted />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LAST 7 DAYS</Text>
        <Text style={styles.loadText}>
          <Text style={styles.loadStrong}>{card.load.last7} TSS</Text>
          {` across ${card.load.sessions7} session${card.load.sessions7 === 1 ? '' : 's'}`}
          {card.load.changePct !== null
            ? ` (${card.load.changePct >= 0 ? '+' : ''}${card.load.changePct}% vs previous 7)`
            : ''}
        </Text>
      </View>

      {lesson ? (
        <View style={styles.lesson}>
          <Text style={styles.lessonTitle}>
            💡 {lesson.title} <Text style={styles.lessonTag}>{lesson.tag.toUpperCase()}</Text>
          </Text>
          <Text style={styles.lessonBody}>{lesson.body}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderTopWidth: 3,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 12 },
  greeting: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  headline: { fontSize: 17, fontWeight: '800', color: '#111827' },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  iconText: { fontSize: 15, color: '#9CA3AF' },
  directive: { paddingHorizontal: 14, paddingTop: 6, fontSize: 13, lineHeight: 19, color: '#374151' },
  directiveSub: { paddingHorizontal: 14, paddingTop: 3, fontSize: 12, lineHeight: 17, color: '#6B7280' },

  metricsRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingTop: 12, gap: 8 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },
  metricValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statePillText: { fontSize: 10, fontWeight: '800' },

  gaugeWrap: { marginHorizontal: 14, marginTop: 10, marginBottom: 4 },
  gaugeTrack: { flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden' },
  gaugeSegment: { flex: 1 },
  gaugeMarker: {
    position: 'absolute',
    top: -3,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  settings: { marginHorizontal: 14, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  settingsLabel: { fontSize: 11, fontWeight: '700', color: '#374151', marginBottom: 6 },
  styleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F3F4F6' },
  styleChipActive: { backgroundColor: '#111827' },
  styleChipText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  styleChipTextActive: { color: '#FFFFFF' },

  section: { marginHorizontal: 14, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  sectionTitle: { fontSize: 9, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 2 },
  empty: { fontSize: 13, color: '#6B7280', paddingVertical: 4 },

  sessionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  sessionEmoji: { fontSize: 15 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionTitle: { fontSize: 13, fontWeight: '700', color: '#111827', flexShrink: 1 },
  sessionDetail: { fontSize: 11, color: '#6B7280' },
  muted: { color: '#4B5563' },
  hardBadge: { backgroundColor: '#FFEDD5', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  hardBadgeText: { fontSize: 8, fontWeight: '800', color: '#9A3412' },

  loadText: { fontSize: 13, color: '#4B5563', paddingVertical: 3 },
  loadStrong: { fontWeight: '800', color: '#111827' },

  lesson: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  lessonTitle: { fontSize: 12, fontWeight: '800', color: '#111827' },
  lessonTag: { fontSize: 9, fontWeight: '800', color: '#9CA3AF' },
  lessonBody: { fontSize: 11, lineHeight: 16, color: '#4B5563', marginTop: 3 },

  chip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  chipTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  chipBody: { fontSize: 11, color: '#6B7280', marginTop: 1 },
});
