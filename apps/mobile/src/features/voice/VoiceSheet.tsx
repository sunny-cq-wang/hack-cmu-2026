/**
 * Bottom sheet for a voice turn: transcript, the pet's reply, and any action
 * card the agent produced. Includes a "type instead" path so the flow survives
 * a broken microphone or STT outage.
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { VoiceTurnResponse } from '../../lib/shared';
import { useCreateMeal, useToday } from '../../lib/queries';
import { colors, radius } from '../../components/ui';
import type { TurnPhase } from './useVoiceTurn';
import type { RecorderPhase } from './useRecorderSession';

interface VoiceSheetProps {
  micPhase: RecorderPhase;
  phase: TurnPhase;
  response: VoiceTurnResponse | null;
  error: string | null;
  onClose: () => void;
  onSendText: (text: string) => void;
}

const MIC_STATUS: Record<RecorderPhase, string | null> = {
  idle: null,
  preparing: 'Getting the mic ready…',
  recording: 'Listening… release to send',
  stopping: 'One sec…',
};

interface SuggestPayload {
  title: string;
  kcal: number;
  ingredientLines?: { name: string; grams: number }[];
}

/** Narrow the untyped `payload` record from VoiceActionSchema. */
function asSuggestion(payload: Record<string, unknown>): SuggestPayload | null {
  const title = payload['title'];
  const kcal = payload['kcal'];
  if (typeof title !== 'string' || typeof kcal !== 'number') return null;
  const lines = payload['ingredientLines'];
  const ingredientLines = Array.isArray(lines)
    ? lines.flatMap((line) => {
        const item = line as { name?: unknown; grams?: unknown };
        return typeof item.name === 'string' && typeof item.grams === 'number'
          ? [{ name: item.name, grams: item.grams }]
          : [];
      })
    : undefined;
  return { title, kcal, ingredientLines };
}

export function VoiceSheet({
  micPhase,
  phase,
  response,
  error,
  onClose,
  onSendText,
}: VoiceSheetProps): React.JSX.Element {
  const { data: today } = useToday();
  const createMeal = useCreateMeal();
  const [showText, setShowText] = useState(false);
  const [draft, setDraft] = useState('');
  const [logged, setLogged] = useState(false);

  const micStatus = MIC_STATUS[micPhase];

  // Anything that goes wrong drops the user straight onto the text path, and it
  // stays open once opened so the input cannot vanish mid-sentence.
  useEffect(() => {
    if (error !== null) setShowText(true);
  }, [error]);

  const petName = today?.pet?.name ?? 'Your buddy';
  const suggestion = response?.actions.map((a) => (a.type === 'suggest_meal' ? asSuggestion(a.payload) : null)).find(Boolean) ?? null;
  const fedAction = response?.actions.find((a) => a.type === 'log_feeding') ?? null;

  const logSuggestion = (): void => {
    if (!suggestion) return;
    const items =
      suggestion.ingredientLines && suggestion.ingredientLines.length > 0
        ? suggestion.ingredientLines.map((line) => ({ name: line.name, grams: line.grams, fdcId: null }))
        : [{ name: suggestion.title, grams: 350, fdcId: null }];
    createMeal.mutate({ photoId: null, source: 'voice', items }, { onSuccess: () => setLogged(true) });
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {micStatus !== null && (
          <View style={styles.statusRow}>
            <View style={styles.pulse} />
            <Text style={styles.status}>{micStatus}</Text>
          </View>
        )}

        {phase === 'sending' && (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.status}>Sending…</Text>
          </View>
        )}

        {response && response.transcript.length > 0 && (
          <Text style={styles.transcript}>“{response.transcript}”</Text>
        )}

        {response && (
          <View style={styles.replyBlock}>
            <Text style={styles.speaker}>{petName}</Text>
            <Text style={styles.reply}>{response.reply}</Text>
            {phase === 'speaking' && <Text style={styles.speaking}>speaking…</Text>}
          </View>
        )}

        {fedAction && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Feeding logged</Text>
            <Text style={styles.cardMeta}>
              {String(fedAction.payload['grams'] ?? '')} g · {petName}
            </Text>
          </View>
        )}

        {suggestion && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{suggestion.title}</Text>
            <Text style={styles.cardMeta}>{Math.round(suggestion.kcal)} kcal</Text>
            <Pressable
              style={[styles.primary, (logged || createMeal.isPending) && styles.primaryDisabled]}
              disabled={logged || createMeal.isPending}
              onPress={logSuggestion}
            >
              <Text style={styles.primaryText}>{logged ? 'Logged' : createMeal.isPending ? 'Logging…' : 'Log it'}</Text>
            </Pressable>
          </View>
        )}

        {error && (
          <View style={styles.errorBlock}>
            <Text style={styles.error}>{error}</Text>
            <Text style={styles.errorHint}>Type your message below and the turn continues as normal.</Text>
          </View>
        )}

        {!showText ? (
          <Pressable onPress={() => setShowText(true)}>
            <Text style={styles.link}>type instead</Text>
          </Pressable>
        ) : (
          <View style={styles.textRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask your pet…"
              placeholderTextColor={colors.textFaint}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => {
                if (draft.trim()) onSendText(draft);
                setDraft('');
              }}
              returnKeyType="send"
            />
            <Pressable
              style={styles.sendButton}
              onPress={() => {
                if (draft.trim()) onSendText(draft);
                setDraft('');
              }}
            >
              <Text style={styles.primaryText}>Send</Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.drooping },
  status: { color: colors.textMuted, fontSize: 14 },
  transcript: { fontStyle: 'italic', color: colors.textFaint, fontSize: 14 },
  replyBlock: { gap: 4 },
  speaker: { fontWeight: '700', fontSize: 13, color: colors.thriving },
  reply: { fontSize: 17, lineHeight: 24, color: colors.text },
  speaking: { fontSize: 12, color: colors.textMuted },
  card: { backgroundColor: colors.cardRaised, borderRadius: radius.md, padding: 14, gap: 8 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: colors.text },
  cardMeta: { color: colors.textMuted, fontSize: 13 },
  primary: { backgroundColor: colors.thriving, paddingVertical: 11, borderRadius: radius.md, alignItems: 'center' },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: colors.bg, fontWeight: '700' },
  errorBlock: { gap: 2 },
  error: { color: colors.drooping, fontSize: 13 },
  errorHint: { color: colors.textMuted, fontSize: 12 },
  link: { color: colors.thriving, fontWeight: '600', fontSize: 14 },
  textRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.cardRaised,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: colors.thriving,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  closeButton: { alignSelf: 'center', paddingVertical: 6 },
  closeText: { color: colors.textMuted, fontWeight: '600' },
});
