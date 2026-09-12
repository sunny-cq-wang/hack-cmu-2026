/**
 * Bottom sheet for a voice turn: transcript, the pet's reply, and any action
 * card the agent produced. Includes a "type instead" path so the flow survives
 * a broken microphone or STT outage.
 */
import { useState } from 'react';
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
import type { TurnPhase } from './useVoiceTurn';

interface VoiceSheetProps {
  recording: boolean;
  phase: TurnPhase;
  response: VoiceTurnResponse | null;
  error: string | null;
  onClose: () => void;
  onSendText: (text: string) => void;
}

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
  recording,
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

        {recording && (
          <View style={styles.statusRow}>
            <View style={styles.pulse} />
            <Text style={styles.status}>Listening… release to send</Text>
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

        {error && <Text style={styles.error}>{error}</Text>}

        {!showText ? (
          <Pressable onPress={() => setShowText(true)}>
            <Text style={styles.link}>type instead</Text>
          </Pressable>
        ) : (
          <View style={styles.textRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask your pet…"
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D7DBE2' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#B3261E' },
  status: { color: '#555', fontSize: 14 },
  transcript: { fontStyle: 'italic', color: '#8A94A6', fontSize: 14 },
  replyBlock: { gap: 4 },
  speaker: { fontWeight: '700', fontSize: 13, color: '#2B2D42' },
  reply: { fontSize: 17, lineHeight: 24, color: '#12141D' },
  speaking: { fontSize: 12, color: '#5AA9E6' },
  card: { backgroundColor: '#F4F6FA', borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontWeight: '700', fontSize: 15, color: '#12141D' },
  cardMeta: { color: '#666', fontSize: 13 },
  primary: { backgroundColor: '#2B2D42', paddingVertical: 11, borderRadius: 12, alignItems: 'center' },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: '#fff', fontWeight: '700' },
  error: { color: '#B3261E', fontSize: 13 },
  link: { color: '#5AA9E6', fontWeight: '600', fontSize: 14 },
  textRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#F4F6FA', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  sendButton: { backgroundColor: '#2B2D42', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  closeButton: { alignSelf: 'center', paddingVertical: 6 },
  closeText: { color: '#8A94A6', fontWeight: '600' },
});
