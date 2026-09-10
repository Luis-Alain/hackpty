import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Action, Notice, color, ui } from './capture-ui';
import type { HistoryAnswer, HistoryRecord, HistorySnapshot, ModelState } from './history-view-types';

type HistoryScreenProps = {
  snapshot: HistorySnapshot | null;
  busy: boolean;
  error: string | null;
  onSync: () => void;
  onClear: () => void;
  onClose: () => void;
  modelState: ModelState;
  onPrepareModel?: () => void;
  onAskHistory?: (question: string) => void;
  historyAnswer?: HistoryAnswer | null;
};

type SearchMatch = {
  record: HistoryRecord;
  snippets: Snippet[];
};

type Snippet = {
  kind: 'approved' | 'source';
  text: string;
  index: number;
  phraseLength: number;
  hasLeadingEllipsis: boolean;
  hasTrailingEllipsis: boolean;
};

type NarrowMode = 'list' | 'detail';
type SourceMode = 'approved' | 'source';

const keyFor = (record: HistoryRecord) => `${record.id}:${record.sourceRevision}`;
const MAX_QUERY_LENGTH = 200;

function toReadableDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function toReadableTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

function toExactTimestamp(iso: string): string {
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

function recordHeading(record: HistoryRecord): string {
  const first = record.text.split(/\r?\n/)[0]?.trim() || '';
  if (first.length > 0) return first.length > 80 ? `${first.slice(0, 80)}…` : first;
  return `Record ${record.id}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeMatchRegExp(phrase: string): RegExp {
  return new RegExp(escapeRegExp(phrase), 'iu');
}

function extractSnippet(
  text: string,
  index: number,
  phraseLength: number,
  radius = 56,
): Pick<Snippet, 'text' | 'hasLeadingEllipsis' | 'hasTrailingEllipsis'> {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + phraseLength + radius);
  return {
    text: text.slice(start, end),
    hasLeadingEllipsis: start > 0,
    hasTrailingEllipsis: end < text.length,
  };
}

function searchRecords(records: HistoryRecord[], query: string): SearchMatch[] {
  const phrase = query.trim();
  if (!phrase) {
    return records.map((record) => ({ record, snippets: [] }));
  }
  if (phrase.length > MAX_QUERY_LENGTH) {
    return [];
  }

  const re = makeMatchRegExp(phrase);
  const matches: SearchMatch[] = [];
  for (const record of records) {
    const snippets: Snippet[] = [];
    const approvedMatch = re.exec(record.text);
    const sourceMatch = re.exec(record.sourceText);

    if (approvedMatch) {
      snippets.push({
        kind: 'approved',
        index: approvedMatch.index,
        phraseLength: phrase.length,
        ...extractSnippet(record.text, approvedMatch.index, phrase.length),
      });
    }
    if (sourceMatch) {
      snippets.push({
        kind: 'source',
        index: sourceMatch.index,
        phraseLength: phrase.length,
        ...extractSnippet(record.sourceText, sourceMatch.index, phrase.length),
      });
    }

    if (snippets.length > 0) {
      matches.push({ record, snippets });
    }
  }
  return matches;
}

function PatientCard({ snapshot }: { snapshot: HistorySnapshot | null }) {
  const patient = snapshot?.patient;
  return (
    <View style={styles.patientCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {patient ? patient.alias.slice(0, 2).toUpperCase() : '—'}
        </Text>
      </View>
      <View style={styles.patientText}>
        <Text style={styles.eyebrow}>{patient ? 'SELECTED PATIENT' : 'NO PATIENT LOADED'}</Text>
        <Text style={styles.patientName}>
          {patient ? patient.alias : 'History not synced'}
        </Text>
        {patient && (
          <Text style={styles.patientId} selectable>
            ID {patient.id}
          </Text>
        )}
      </View>
    </View>
  );
}

function SyncStatus({ snapshot, busy }: { snapshot: HistorySnapshot | null; busy: boolean }) {
  if (!snapshot) {
    return (
      <View style={styles.panel}>
        <Text style={ui.heading}>Approved history</Text>
        <Text style={styles.body}>
          {busy
            ? 'Working…'
            : 'No local history is loaded. Sync from a paired, unlocked PsyRec PC to bring the current approved records for the selected patient onto this phone.'}
        </Text>
      </View>
    );
  }

  const { coverage, syncedAt } = snapshot;

  return (
    <View style={styles.panel}>
      <View style={styles.rowSpread}>
        <Text style={[ui.heading, styles.shrinkWrap]}>Approved history</Text>
        <Text style={styles.metaBadge}>
          {coverage.includedRecords}/{coverage.totalRecords} records
        </Text>
      </View>
      <Text style={styles.body}>
        {coverage.includedRecords} approved record{coverage.includedRecords === 1 ? '' : 's'} on this
        phone. {coverage.partial ? 'This is a partial snapshot.' : 'Full snapshot.'}
      </Text>
      <Text style={styles.micro}>
        Synced {toReadableDate(syncedAt)} · {toReadableTime(syncedAt)}
      </Text>
      <Text style={styles.micro} selectable>
        Exact: {toExactTimestamp(syncedAt)}
      </Text>
      <View style={[styles.notice, styles.warningNotice]}>
        <Text style={[ui.noticeTitle, styles.warningTitle]}>Snapshot is a point-in-time copy</Text>
        <Text style={styles.body}>
          This snapshot reflects approvals at sync time. Later revisions, revocations or new records
          cannot be verified offline. Reconnect and sync before relying on currency.
        </Text>
      </View>
    </View>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <View>
      <Text style={styles.label}>Search records</Text>
      <TextInput
        accessibilityLabel="Search records"
        accessibilityHint="Case-insensitive literal phrase search across text stored on this phone. No medical inference or synonyms."
        value={value}
        onChangeText={onChange}
        placeholder="Search records"
        placeholderTextColor={color.muted}
        style={styles.searchInput}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={MAX_QUERY_LENGTH}
      />
      <Text style={styles.hint}>
        Case-insensitive literal phrase search across approved text and source text on this phone. No
        synonyms or generated inference.
      </Text>
    </View>
  );
}

function SnippetView({
  snippet,
  onOpen,
}: {
  snippet: Snippet;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${snippet.kind} text for this record`}
      onPress={onOpen}
      style={({ pressed }) => [styles.snippetButton, pressed && styles.pressed]}
    >
      <Text style={styles.snippetButtonLabel}>
        Open {snippet.kind === 'approved' ? 'approved text' : 'source text'}
      </Text>
      <Text style={styles.snippetText}>
        {snippet.hasLeadingEllipsis && <Text style={styles.ellipsis}>…</Text>}
        “{snippet.text}”
        {snippet.hasTrailingEllipsis && <Text style={styles.ellipsis}>…</Text>}
      </Text>
    </Pressable>
  );
}

function RecordList({
  matches,
  query,
  selectedKey,
  onSelect,
}: {
  matches: SearchMatch[];
  query: string;
  selectedKey: string | null;
  onSelect: (record: HistoryRecord, mode: SourceMode) => void;
}) {
  if (matches.length === 0) {
    if (query.trim().length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={ui.heading}>No records in this snapshot</Text>
          <Text style={styles.body}>
            This snapshot contains no approved records for the selected patient. Sync from the paired
            PC to refresh.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Text style={ui.heading}>No text matches</Text>
        <Text style={styles.body}>
          No stored approved text or source text contains this exact phrase. This does not mean no
          clinical fact exists; try a different phrase or sync a newer snapshot.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {matches.map(({ record, snippets }) => {
        const key = keyFor(record);
        const selected = selectedKey === key;
        return (
          <View key={key} style={[styles.recordCard, selected && styles.recordCardSelected]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${recordHeading(record)}, revision ${record.sourceRevision}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(record, 'approved')}
              style={({ pressed }) => [styles.recordRowHeader, pressed && styles.pressed]}
            >
              <View style={styles.recordHeaderCopy}>
                <Text style={[styles.recordTitle, styles.shrinkWrap]} numberOfLines={2}>
                  {recordHeading(record)}
                </Text>
                <Text style={styles.recordMeta} selectable>
                  Approved · revision {record.sourceRevision} · {record.id}
                </Text>
                <Text style={styles.recordMeta}>
                  {toReadableDate(record.approvedAt)} · {record.encounterId}
                </Text>
              </View>
            </Pressable>
            {snippets.length > 0 && (
              <View style={styles.snippets}>
                {snippets.map((snippet, i) => (
                  <SnippetView
                    key={`${snippet.kind}-${i}`}
                    snippet={snippet}
                    onOpen={() => onSelect(record, snippet.kind)}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function RecordDetail({
  record,
  sourceMode,
  onSetSourceMode,
}: {
  record: HistoryRecord;
  sourceMode: SourceMode;
  onSetSourceMode: (mode: SourceMode) => void;
}) {
  const bodyText = sourceMode === 'approved' ? record.text : record.sourceText;

  return (
    <View style={styles.detailPanel}>
      <View style={styles.rowSpread}>
        <Text style={[ui.heading, styles.shrinkWrap]} numberOfLines={3}>
          {recordHeading(record)}
        </Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>APPROVED</Text>
        </View>
      </View>

      <View style={styles.detailMeta}>
        <Text style={styles.metaLine} selectable>
          Record ID: {record.id}
        </Text>
        <Text style={styles.metaLine}>Revision: {record.sourceRevision}</Text>
        <Text style={styles.metaLine}>Encounter: {record.encounterId}</Text>
        <Text style={styles.metaLine}>Approved: {toReadableDate(record.approvedAt)}</Text>
        <Text style={styles.metaLine} selectable>
          Exact: {toExactTimestamp(record.approvedAt)}
        </Text>
      </View>

      <View style={styles.sourceSwitch}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show approved text"
          accessibilityState={{ selected: sourceMode === 'approved' }}
          onPress={() => onSetSourceMode('approved')}
          style={({ pressed }) => [
            styles.sourceButton,
            sourceMode === 'approved' && styles.sourceButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.sourceButtonText,
              sourceMode === 'approved' && styles.sourceButtonTextActive,
            ]}
          >
            Approved text
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show source text"
          accessibilityState={{ selected: sourceMode === 'source' }}
          onPress={() => onSetSourceMode('source')}
          style={({ pressed }) => [
            styles.sourceButton,
            sourceMode === 'source' && styles.sourceButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.sourceButtonText,
              sourceMode === 'source' && styles.sourceButtonTextActive,
            ]}
          >
            Source text
          </Text>
        </Pressable>
      </View>

      <Text selectable style={styles.bodyText}>
        {bodyText}
      </Text>
    </View>
  );
}

type ResolvedPassage = { record: HistoryRecord; field: 'text' | 'sourceText'; text: string; start: number; end: number };
type ResolvedAnswer = { status: 'valid'; passages: ResolvedPassage[] } | { status: 'stale' | 'invalid' };

function resolveHistoryAnswer(snapshot: HistorySnapshot | null, answer: HistoryAnswer): ResolvedAnswer {
  if (!snapshot || answer.snapshotId !== snapshot.snapshotId) return { status: 'stale' };
  if (!Array.isArray(answer.passages) || answer.passages.length > 50) return { status: 'invalid' };
  const passages: ResolvedPassage[] = [];
  for (const citation of answer.passages) {
    if (!citation || (citation.field !== 'text' && citation.field !== 'sourceText')) return { status: 'invalid' };
    const record = snapshot.records.find(item => item.id === citation.recordId
      && item.sourceRevision === citation.sourceRevision && item.patientId === snapshot.patient.id);
    if (!record || !Number.isSafeInteger(citation.start) || !Number.isSafeInteger(citation.end)
      || citation.start < 0 || citation.end <= citation.start || citation.end > record[citation.field].length) {
      return { status: 'invalid' };
    }
    passages.push({record, field: citation.field, start: citation.start, end: citation.end,
      text: record[citation.field].slice(citation.start, citation.end)});
  }
  return {status: 'valid', passages};
}

function HistoryQuestions({snapshot, busy, modelState, question, onQuestionChange,
  onPrepareModel, onAskHistory, historyAnswer, onOpenSource}: {
  snapshot: HistorySnapshot | null; busy: boolean; modelState: ModelState;
  question: string; onQuestionChange: (question: string) => void;
  onPrepareModel?: () => void; onAskHistory?: (question: string) => void;
  historyAnswer?: HistoryAnswer | null;
  onOpenSource: (record: HistoryRecord, mode: SourceMode) => void;
}) {
  const loading = modelState.status === 'loading';
  const canAsk = modelState.status === 'ready' && !!onAskHistory
    && !!snapshot?.records.length && question.trim().length > 0 && !busy;
  const resolved = historyAnswer ? resolveHistoryAnswer(snapshot, historyAnswer) : null;
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={ui.heading}>Ask history</Text>
      <Text accessibilityLiveRegion="polite" style={styles.modelLabel}>{modelState.label}</Text>
      {modelState.reason && <Text style={styles.hint}>{modelState.reason}</Text>}
      {onPrepareModel && modelState.status !== 'ready' && (
        <Action label={loading ? modelState.label : 'Prepare phone model'}
          onPress={onPrepareModel} disabled={loading || busy} secondary />
      )}
      <Text style={styles.label}>Question about this patient’s approved history</Text>
      <TextInput accessibilityLabel="Question about approved history"
        accessibilityHint="Only records in the displayed patient snapshot can supply source passages."
        value={question} onChangeText={onQuestionChange} placeholder="What was documented?"
        placeholderTextColor={color.muted} style={styles.searchInput} multiline maxLength={500}
        editable={!loading && !busy} autoCorrect={false} />
      <Pressable accessibilityRole="button" accessibilityLabel="Ask history"
        accessibilityState={{disabled: !canAsk}} disabled={!canAsk}
        onPress={() => onAskHistory?.(question.trim())}
        style={({pressed}) => [ui.action, !canAsk && styles.disabledAction, pressed && canAsk && styles.pressed]}>
        <Text style={[ui.actionText, !canAsk && styles.disabledActionText]}>Ask history</Text>
        <Text accessible={false} style={[ui.actionArrow, !canAsk && styles.disabledActionText]}>→</Text>
      </Pressable>
      {(!onAskHistory || modelState.status !== 'ready') && (
        <Text style={styles.hint}>History questions become available when the phone model is ready. Records and text search remain available.</Text>
      )}
      {resolved?.status === 'stale' && <Text style={styles.hint}>These results belong to an older snapshot. Ask again using the displayed history.</Text>}
      {resolved?.status === 'invalid' && <Notice value={{tone:'error',title:'Source could not be verified',body:'A selected passage did not match this snapshot. No passages are displayed. Ask again.'}} />}
      {historyAnswer && resolved?.status === 'valid' && (
        <View style={styles.answerContent}>
          <Text accessibilityRole="header" style={ui.heading}>Selected passages</Text>
          <Text style={styles.body}>Question: {historyAnswer.question}</Text>
          {historyAnswer.notice && <Text style={styles.hint}>{historyAnswer.notice}</Text>}
          <Text style={styles.hint}>Exact excerpts from this snapshot. Check the source records; selection may omit relevant information.</Text>
          {resolved.passages.length === 0 && <Text style={styles.body}>No passages were selected. This does not establish that the history contains no relevant information.</Text>}
          {resolved.passages.map((passage, index) => (
            <View key={`${passage.record.id}:${passage.record.sourceRevision}:${passage.field}:${passage.start}:${index}`} style={styles.sourcePassage}>
              <Text style={styles.recordMeta}>Source {index + 1} · {passage.field === 'text' ? 'Approved text' : 'Source text'}</Text>
              <Text selectable style={styles.bodyText}>“{passage.text}”</Text>
              <Text selectable style={styles.recordMeta}>Record {passage.record.id} · revision {passage.record.sourceRevision}</Text>
              <Text style={styles.recordMeta}>Approved {toExactTimestamp(passage.record.approvedAt)}</Text>
              <Action secondary label={passage.field === 'text' ? 'Open approved text' : 'Open source text'}
                onPress={() => onOpenSource(passage.record, passage.field === 'text' ? 'approved' : 'source')} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
function ScreenActions({
  busy,
  onSync,
  onClear,
  onClose,
}: {
  busy: boolean;
  onSync: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.actions}>
      <Action
        label={busy ? 'Please wait…' : 'Sync from PC'}
        onPress={onSync}
        disabled={busy}
      />
      <Action
        secondary
        label="Remove history from phone"
        onPress={onClear}
        disabled={busy}
      />
      <Text style={styles.hint}>
        Remove history deletes only the phone copy. Captures and approved records on the paired PC
        are untouched.
      </Text>
      <Action secondary label="Back to capture" onPress={onClose} arrow="←" />
    </View>
  );
}

export function HistoryScreen({
  snapshot,
  busy,
  error,
  onSync,
  onClear,
  onClose,
  modelState,
  onPrepareModel,
  onAskHistory,
  historyAnswer,
}: HistoryScreenProps) {
  const { width } = useWindowDimensions();
  const wide = width >= 600;

  const [query, setQuery] = useState('');
  const [question, setQuestion] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>('approved');
  const [narrowMode, setNarrowMode] = useState<NarrowMode>('list');
  const wideDetailRef = useRef<ScrollView | null>(null);
  const narrowBodyRef = useRef<ScrollView | null>(null);
  const pendingSelectionScroll = useRef(false);
  const [narrowDetailOffset, setNarrowDetailOffset] = useState<number | null>(null);
  const [selectionTick, setSelectionTick] = useState(0);

  useEffect(() => {
    pendingSelectionScroll.current = false;
    setNarrowDetailOffset(null);
    setQuery('');
    setQuestion('');
    setSelectedKey(null);
    setSourceMode('approved');
    setNarrowMode('list');
  }, [snapshot?.snapshotId, snapshot?.patient.id, snapshot?.binding.deviceId, snapshot?.binding.encounterId]);

  const matches = useMemo(
    () => searchRecords(snapshot?.records ?? [], query),
    [snapshot?.records, query]
  );

  const selectedRecord = useMemo(
    () => snapshot?.records.find((r) => keyFor(r) === selectedKey) ?? null,
    [snapshot, selectedKey]
  );

  const handleSelect = (record: HistoryRecord, mode: SourceMode) => {
    pendingSelectionScroll.current = true;
    setSelectedKey(keyFor(record));
    setSourceMode(mode);
    if (!wide) {
      if (narrowMode !== 'detail') setNarrowDetailOffset(null);
      setNarrowMode('detail');
    }
    setSelectionTick((value) => value + 1);
  };

  const handleBackToList = () => {
    pendingSelectionScroll.current = false;
    setNarrowMode('list');
  };

  useEffect(() => {
    if (!pendingSelectionScroll.current || !selectedRecord) return;
    if (!wide && (narrowMode !== 'detail' || narrowDetailOffset === null)) return;
    const frame = requestAnimationFrame(() => {
      if (!pendingSelectionScroll.current) return;
      const target = wide ? wideDetailRef.current : narrowBodyRef.current;
      target?.scrollTo({ y: wide ? 0 : Math.max(0, narrowDetailOffset ?? 0), animated: false });
      pendingSelectionScroll.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectionTick, wide, narrowMode, narrowDetailOffset, selectedRecord]);

  const notice = error
    ? { tone: 'error' as const, title: 'History error', body: error }
    : null;

  const listContent = snapshot ? (
    <>
      <SearchInput value={query} onChange={setQuery} />
      <RecordList
        matches={matches}
        query={query}
        selectedKey={selectedKey}
        onSelect={handleSelect}
      />
    </>
  ) : (
    <View style={styles.emptyState}><Text style={styles.body}>Sync history from the paired PC to browse records.</Text></View>
  );

  const detailContent = selectedRecord ? (
    <RecordDetail
      record={selectedRecord}
      sourceMode={sourceMode}
      onSetSourceMode={setSourceMode}
    />
  ) : (
    <View style={styles.emptyDetail}>
      <Text style={ui.heading}>Select a record</Text>
      <Text style={styles.body}>
        Tap a record or an Open text button to view its approved text, source text, revision and
        approval details.
      </Text>
    </View>
  );

  const questionPanel = <HistoryQuestions snapshot={snapshot} busy={busy} modelState={modelState}
    question={question} onQuestionChange={setQuestion} onPrepareModel={onPrepareModel}
    onAskHistory={onAskHistory} historyAnswer={historyAnswer} onOpenSource={handleSelect} />;

  const sharedRightContent = (
    <>
      {notice && <Notice value={notice} />}
      <SyncStatus snapshot={snapshot} busy={busy} />
      {snapshot && detailContent}
      {questionPanel}
      <ScreenActions busy={busy} onSync={onSync} onClear={onClear} onClose={onClose} />
    </>
  );

  return (
    <View style={styles.page}>
      <View style={styles.patientBar}>
        <PatientCard snapshot={snapshot} />
      </View>
      {wide ? (
        <View style={styles.bodyWide}>
          <ScrollView
            style={styles.listPane}
            contentContainerStyle={styles.listPaneContent}
            accessibilityLabel="Record list"
            nestedScrollEnabled
          >
            {listContent}
          </ScrollView>
          <ScrollView
            ref={wideDetailRef}
            style={styles.detailPane}
            contentContainerStyle={styles.detailPaneContent}
            accessibilityLabel="Record detail"
            nestedScrollEnabled
          >
            {sharedRightContent}
          </ScrollView>
        </View>
      ) : (
        <ScrollView ref={narrowBodyRef} style={styles.bodyNarrow} contentContainerStyle={styles.bodyNarrowContent}>
          {narrowMode === 'list' ? (
            <>
              {notice && <Notice value={notice} />}
              <SyncStatus snapshot={snapshot} busy={busy} />
              {listContent}
              {selectedRecord && (
                <Action
                  label="Open selected record"
                  onPress={() => handleSelect(selectedRecord, sourceMode)}
                  arrow="→"
                />
              )}
              {questionPanel}
              <ScreenActions busy={busy} onSync={onSync} onClear={onClear} onClose={onClose} />
            </>
          ) : (
            <>
              <Action label="Back to records" onPress={handleBackToList} secondary arrow="←" />
              {notice && <Notice value={notice} />}
              <SyncStatus snapshot={snapshot} busy={busy} />
              <View onLayout={(event) => setNarrowDetailOffset(event.nativeEvent.layout.y)}>{detailContent}</View>
              {questionPanel}
              <ScreenActions busy={busy} onSync={onSync} onClear={onClear} onClose={onClose} />
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

export default HistoryScreen;

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  bodyWide: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  bodyNarrow: {
    flex: 1,
  },
  bodyNarrowContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  patientBar: {
    backgroundColor: color.white,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  eyebrow: {
    color: color.brand,
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  patientText: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 9,
    backgroundColor: '#d8e4df',
    borderWidth: 1,
    borderColor: '#c9d5d5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: color.brand,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  patientName: {
    color: color.ink,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
  patientId: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 11,
    padding: 16,
    gap: 10,
  },
  detailPanel: {
    backgroundColor: color.white,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 11,
    padding: 16,
    gap: 12,
  },
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  shrinkWrap: {
    flexShrink: 1,
  },
  metaBadge: {
    color: color.brand,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.line,
  },
  micro: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  notice: {
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  warningNotice: {
    backgroundColor: color.surface,
  },
  warningTitle: {
    color: color.brand,
  },
  label: {
    color: color.ink,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    marginBottom: 6,
  },
  searchInput: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#cedbda',
    borderRadius: 8,
    backgroundColor: color.white,
    color: color.ink,
    fontSize: 16,
    lineHeight: 24,
  },
  hint: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  body: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 25,
    flexShrink: 1,
  },
  listPane: {
    flex: 2,
    minWidth: 220,
    maxWidth: 280,
    borderRightWidth: 1,
    borderRightColor: color.line,
  },
  listPaneContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  detailPane: {
    flex: 3,
    minWidth: 0,
  },
  detailPaneContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  list: {
    gap: 0,
  },
  recordCard: {
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingVertical: 12,
    gap: 8,
  },
  recordCardSelected: {
    backgroundColor: color.surface,
  },
  recordRowHeader: {
    minHeight: 48,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  recordHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  recordTitle: {
    color: color.ink,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  recordMeta: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  snippets: {
    gap: 8,
  },
  snippetButton: {
    minHeight: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#cedbda',
    borderRadius: 8,
    backgroundColor: color.white,
    gap: 4,
  },
  snippetButtonLabel: {
    color: color.action,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  snippetText: {
    color: color.ink,
    fontSize: 16,
    lineHeight: 23,
  },
  ellipsis: {
    color: color.muted,
  },
  emptyState: {
    paddingVertical: 24,
    gap: 8,
  },
  emptyDetail: {
    paddingVertical: 40,
    gap: 10,
  },
  detailMeta: {
    gap: 4,
  },
  metaLine: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d8e4df',
    backgroundColor: color.goodBackground,
  },
  tagText: {
    color: color.good,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  sourceSwitch: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  sourceButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  sourceButtonActive: {
    borderBottomColor: color.action,
  },
  sourceButtonText: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  sourceButtonTextActive: {
    color: color.action,
  },
  bodyText: {
    color: color.ink,
    fontSize: 16,
    lineHeight: 26,
  },
  disabledAction: {
    opacity: 0.45,
  },
  disabledActionText: {
    opacity: 0.7,
  },
  modelLabel: {
    color: color.muted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
  },
  answerContent: { gap: 12 },
  sourcePassage: { gap: 10, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 16 },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.72,
  },
});
