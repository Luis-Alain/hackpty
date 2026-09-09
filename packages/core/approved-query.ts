import { createHash } from 'node:crypto';
import type { ApprovedRecord, ApprovedQueryExcerpt, QueryCitation, QueryCoverage } from './types.js';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const stopWords = new Set('a an the about and are as at be been by can did do does for from has have how i in is it of on or patient please show tell that their this to was were what when which who with would'.split(' '));
const MAX_EXCERPTS = 6;
const EXCERPT_CHARACTERS = 800;

export function selectApprovedQueryExcerpts(records: ApprovedRecord[], question: string, snapshotAt: string): { sources: ApprovedQueryExcerpt[]; coverage: QueryCoverage } {
  const terms = [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 1 && !stopWords.has(word)))];
  const candidates: (Omit<ApprovedQueryExcerpt, 'sourceId'> & { score: number; order: number })[] = [];
  let omittedLongPassages = 0;
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  records.forEach((record, order) => {
    let start = -1, end = -1;
    const flush = () => {
      if (start < 0) return;
      const text = record.text.slice(start, end), lowered = text.toLowerCase();
      candidates.push({ recordId: record.id, patientId: record.patientId, encounterId: record.encounterId, sourceRevision: record.sourceRevision, approvedAt: record.approvedAt, recordSha256: hash(record.text), start, end, text, score: terms.filter(term => lowered.includes(term)).length, order });
      start = end = -1;
    };
    for (const sentence of segmenter.segment(record.text)) {
      if (sentence.segment.length > EXCERPT_CHARACTERS) { flush(); omittedLongPassages++; continue; }
      if (!sentence.segment.trim()) continue;
      const sentenceEnd = sentence.index + sentence.segment.length;
      if (start >= 0 && sentenceEnd - start > EXCERPT_CHARACTERS) flush();
      if (start < 0) start = sentence.index;
      end = sentenceEnd;
    }
    flush();
  });
  const selected = candidates.sort((a, b) => b.score - a.score || a.order - b.order || a.start - b.start).slice(0, MAX_EXCERPTS);
  const sources = selected.map(({ score, order, ...source }, index) => ({ ...source, sourceId: 'N' + (index + 1) }));
  return {
    sources,
    coverage: { method: 'local-lexical-ranking-v1', snapshotAt, approvedRecordsScanned: records.length, excerptsAvailable: candidates.length, excerptsSearched: sources.length, recordsRepresented: new Set(sources.map(s => s.recordId)).size, charactersSearched: sources.reduce((total, source) => total + source.text.length, 0), omittedLongPassages, segmentation: 'Intl.Segmenter en sentences; no clipped sentences', partial: sources.length < candidates.length || omittedLongPassages > 0 },
  };
}

/** Every supplied record is reauthorized after inference; source IDs carry no authority. */
export function revalidateApprovedQuerySources(records: ApprovedRecord[], patientId: string, sources: ApprovedQueryExcerpt[]) {
  for (const source of sources) {
    const record = records.find(r => r.id === source.recordId && r.patientId === patientId && !r.supersededAt);
    if (!record || record.sourceRevision !== source.sourceRevision || hash(record.text) !== source.recordSha256 || record.text.slice(source.start, source.end) !== source.text) throw new Error('An approved source changed while the query ran. Ask again against the current notes.');
  }
}

/** The model only selects authorized IDs. Canonical complete passages supply all display text. */
export function validateApprovedQueryOutput(raw: string, sources: ApprovedQueryExcerpt[]): { status: 'answered' | 'not-found'; citations: QueryCitation[]; answer: string } {
  let response: any;
  try { response = JSON.parse(raw); } catch { throw new Error('The local model did not return valid query JSON. No answer was accepted.'); }
  if (!response || typeof response !== 'object' || Array.isArray(response) || Object.keys(response).length !== 1 || !Object.hasOwn(response, 'sourceIds') || !Array.isArray(response.sourceIds) || response.sourceIds.length > 6 || response.sourceIds.some(id => typeof id !== 'string') || new Set(response.sourceIds).size !== response.sourceIds.length) throw new Error('The local model returned an invalid passage selection. No answer was accepted.');
  const citations: QueryCitation[] = response.sourceIds.map((sourceId: string) => {
    const source = sources.find(s => s.sourceId === sourceId);
    if (!source) throw new Error('A selected passage did not match the authorized approved text. No answer was accepted.');
    // Complete sentence-bounded passages preserve surrounding denials and qualifiers.
    return { sourceId: source.sourceId, recordId: source.recordId, patientId: source.patientId, encounterId: source.encounterId, sourceRevision: source.sourceRevision, approvedAt: source.approvedAt, start: source.start, end: source.end, quote: source.text };
  });
  return citations.length ? { status: 'answered', citations, answer: citations.map(citation => citation.quote).join('\n\n') } : { status: 'not-found', citations: [], answer: 'No answer found in the searched notes.' };
}