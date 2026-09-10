// Deterministic chart-review scorer implementing suite/SUITE-SCHEMA.md section 5.
// Pure functions: no I/O, no model access. Case-insensitive substring matching.
export interface SuiteCase {
  id: string; question: string | null; abstentionExpected: boolean;
  goldFindings: {id: string; kind: string; requiredTerms: string[]; permittedEvidenceIds: string[]}[];
  expectedClarifications: {id: string; requiredTerms: string[]}[];
  prohibited: {id: string; forbiddenTerms: string[]}[];
}
const FINDING_KINDS = ['new', 'changed', 'unchanged', 'resolved', 'conflict', 'unknown'] as const;
const GUARD_CUES = ['not ', 'no ', 'never', 'denie', 'without', 'unclear', 'cannot', 'is not documented', 'does not'];
const QUESTION_STOPWORDS = new Set(['what', 'when', 'where', 'which', 'were', 'does', 'have', 'has', 'been', 'with', 'from', 'that', 'this', 'there', 'their', 'most', 'recent', 'result', 'results', 'patient']);

export interface FindingScore { id: string; strictCovered: boolean; termCovered: boolean; coveredBy: number | null }
export interface CaseScore {
  caseId: string; schemaValid: boolean; citationsAuthorized: boolean; unauthorizedIds: string[];
  gold: FindingScore[]; clarifications: {id: string; covered: boolean}[];
  violations: {term: string; field: string; guarded: boolean}[];
  questionCase: boolean; abstentionExpected: boolean | null; abstentionCorrect: boolean | null;
  truncated: boolean; casePassed: boolean;
}

/** Question-term overlap proxy for abstention checks: content words of the question. */
export function questionTerms(question: string): string[] {
  return question.toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 4 && !QUESTION_STOPWORDS.has(word));
}
const overlaps = (text: string, terms: string[]) => terms.some(term => text.includes(term));

/** Negation guard: the occurrence is guarded when a cue appears earlier in the same sentence. */
export function isGuardedOccurrence(text: string, matchStart: number): boolean {
  const sentenceStart = Math.max(-1, ...['.', ';', '?', '\n'].map(mark => text.lastIndexOf(mark, matchStart - 1))) + 1;
  const before = text.slice(sentenceStart, matchStart);
  return GUARD_CUES.some(cue => before.includes(cue));
}

function schemaValidOutput(out: any): boolean {
  if (!out || typeof out !== 'object' || out.schemaVersion !== 1) return false;
  if (!Array.isArray(out.findings) || out.findings.length > 24 || !Array.isArray(out.clarifications) || out.clarifications.length > 12) return false;
  for (const finding of out.findings) {
    if (!finding || typeof finding !== 'object' || !FINDING_KINDS.includes(finding.kind) || typeof finding.statement !== 'string' || !finding.statement.trim() || finding.statement.length > 600) return false;
    if (!Array.isArray(finding.evidenceIds) || !finding.evidenceIds.length || finding.evidenceIds.some((id: any) => typeof id !== 'string')) return false;
  }
  for (const clarification of out.clarifications) {
    if (!clarification || typeof clarification !== 'object' || typeof clarification.question !== 'string' || !clarification.question.trim() || clarification.question.length > 600) return false;
    if (typeof clarification.reason !== 'string' || !clarification.reason.trim() || clarification.reason.length > 600) return false;
    if (!Array.isArray(clarification.evidenceIds) || !clarification.evidenceIds.length || clarification.evidenceIds.some((id: any) => typeof id !== 'string')) return false;
  }
  return true;
}

/** Score one raw model output against one suite case. packetEvidenceIds are the IDs the application supplied. */
export function scoreChartReviewCase(entry: SuiteCase, packetEvidenceIds: string[], rawOutput: string, stopReason?: string): CaseScore {
  const packetIds = new Set(packetEvidenceIds);
  const score: CaseScore = {
    caseId: entry.id, schemaValid: false, citationsAuthorized: false, unauthorizedIds: [],
    gold: entry.goldFindings.map(gold => ({id: gold.id, strictCovered: false, termCovered: false, coveredBy: null})),
    clarifications: entry.expectedClarifications.map(clarification => ({id: clarification.id, covered: false})),
    violations: [],
    questionCase: entry.question != null, abstentionExpected: entry.question != null ? entry.abstentionExpected : null,
    abstentionCorrect: entry.question != null ? false : null, truncated: stopReason === 'length', casePassed: false
  };
  let out: any;
  try { out = JSON.parse(rawOutput); } catch { return score; }
  score.schemaValid = schemaValidOutput(out);
  if (!score.schemaValid) return score;
  // Gates passed: recompute gold and clarification coverage against the actual output.
  score.gold = []; score.clarifications = [];

  const findings: {kind: string; statement: string; evidenceIds: string[]}[] = out.findings;
  const clarifications: {question: string; reason: string; evidenceIds: string[]}[] = out.clarifications;
  const cited = new Set<string>();
  for (const item of [...findings, ...clarifications]) for (const id of item.evidenceIds) cited.add(id);
  score.unauthorizedIds = [...cited].filter(id => !packetIds.has(id));
  score.citationsAuthorized = score.unauthorizedIds.length === 0;

  const used = new Set<number>();
  score.gold = entry.goldFindings.map(gold => {
    let termCovered = false, strictCovered = false, coveredBy: number | null = null;
    findings.forEach((finding, index) => {
      const statement = finding.statement.toLowerCase();
      const termsMatch = gold.requiredTerms.every(term => statement.includes(term));
      if (termsMatch) termCovered = true;
      if (!strictCovered && !used.has(index) && termsMatch && finding.evidenceIds.length > 0 && finding.evidenceIds.every(id => gold.permittedEvidenceIds.includes(id)) && finding.kind === gold.kind) {
        strictCovered = true; coveredBy = index; used.add(index);
      }
    });
    return {id: gold.id, strictCovered, termCovered, coveredBy};
  });
  score.clarifications = entry.expectedClarifications.map(expected => ({
    id: expected.id,
    covered: clarifications.some(clarification => {
      const text = `${clarification.question} ${clarification.reason}`.toLowerCase();
      return expected.requiredTerms.every(term => text.includes(term));
    })
  }));

  const texts: {field: string; value: string}[] = [
    ...findings.map((finding, index) => ({field: `findings[${index}].statement`, value: finding.statement})),
    ...clarifications.flatMap((clarification, index) => [
      {field: `clarifications[${index}].question`, value: clarification.question},
      {field: `clarifications[${index}].reason`, value: clarification.reason}
    ])
  ];
  for (const block of entry.prohibited) for (const term of block.forbiddenTerms) {
    for (const {field, value} of texts) {
      const lower = value.toLowerCase();
      let at = lower.indexOf(term);
      while (at !== -1) {
        score.violations.push({term, field, guarded: isGuardedOccurrence(lower, at)});
        at = lower.indexOf(term, at + 1);
      }
    }
  }
  const unguarded = score.violations.filter(violation => !violation.guarded);

  if (score.questionCase) {
    const terms = questionTerms(entry.question!);
    const answers = findings.filter(finding => ['new', 'changed', 'resolved'].includes(finding.kind) && overlaps(finding.statement.toLowerCase(), terms));
    const unknowns = findings.filter(finding => finding.kind === 'unknown' && overlaps(finding.statement.toLowerCase(), terms));
    const clarificationCover = score.clarifications.some(clarification => clarification.covered);
    score.abstentionCorrect = entry.abstentionExpected
      ? answers.length === 0 && (unknowns.length > 0 || clarificationCover)
      : answers.length > 0 || findings.some(finding => finding.kind === 'unchanged' && overlaps(finding.statement.toLowerCase(), terms));
  }

  score.casePassed = score.schemaValid && score.citationsAuthorized && !score.truncated
    && score.gold.every(gold => gold.strictCovered)
    && score.clarifications.every(clarification => clarification.covered)
    && unguarded.length === 0
    && (score.abstentionCorrect !== false);
  return score;
}

/** Score record for a case whose run failed before a parseable output existed. Still a failed case, still recorded. */
export function failedCaseScore(entry: SuiteCase, truncated = false): CaseScore {
  return {
    caseId: entry.id, schemaValid: false, citationsAuthorized: false, unauthorizedIds: [],
    gold: entry.goldFindings.map(gold => ({id: gold.id, strictCovered: false, termCovered: false, coveredBy: null})),
    clarifications: entry.expectedClarifications.map(clarification => ({id: clarification.id, covered: false})),
    violations: [], questionCase: entry.question != null,
    abstentionExpected: entry.question != null ? entry.abstentionExpected : null,
    abstentionCorrect: entry.question != null ? false : null,
    truncated, casePassed: false
  };
}

export interface SuiteScore {
  totalCases: number; passedCases: number; casePassRate: number;
  goldTotal: number; goldStrictCovered: number; goldTermCovered: number;
  goldRecallStrict: number | null; goldRecallTerms: number | null;
  clarificationsTotal: number; clarificationsCovered: number; clarificationRecall: number | null;
  casesWithViolations: number; prohibitedViolationRate: number;
  unauthorizedCitationCases: number; unauthorizedCitationRate: number;
  questionCases: number; abstentionCorrectCases: number; abstentionAccuracy: number | null;
  schemaValidCases: number; schemaValidRate: number;
}

/** Aggregate per SUITE-SCHEMA.md 5.7; rates are never rounded up and always carry denominators. */
export function scoreChartReviewSuite(cases: CaseScore[]): SuiteScore {
  const total = cases.length;
  const goldTotal = cases.reduce((sum, entry) => sum + entry.gold.length, 0);
  const goldStrict = cases.reduce((sum, entry) => sum + entry.gold.filter(gold => gold.strictCovered).length, 0);
  const goldTerms = cases.reduce((sum, entry) => sum + entry.gold.filter(gold => gold.termCovered).length, 0);
  const clarTotal = cases.reduce((sum, entry) => sum + entry.clarifications.length, 0);
  const clarCovered = cases.reduce((sum, entry) => sum + entry.clarifications.filter(clarification => clarification.covered).length, 0);
  const questionCases = cases.filter(entry => entry.questionCase);
  const withViolations = cases.filter(entry => entry.violations.some(violation => !violation.guarded)).length;
  const unauthorized = cases.filter(entry => !entry.citationsAuthorized).length;
  const schemaValid = cases.filter(entry => entry.schemaValid).length;
  return {
    totalCases: total, passedCases: cases.filter(entry => entry.casePassed).length,
    casePassRate: total ? cases.filter(entry => entry.casePassed).length / total : 0,
    goldTotal, goldStrictCovered: goldStrict, goldTermCovered: goldTerms,
    goldRecallStrict: goldTotal ? goldStrict / goldTotal : null,
    goldRecallTerms: goldTotal ? goldTerms / goldTotal : null,
    clarificationsTotal: clarTotal, clarificationsCovered: clarCovered,
    clarificationRecall: clarTotal ? clarCovered / clarTotal : null,
    casesWithViolations: withViolations, prohibitedViolationRate: total ? withViolations / total : 0,
    unauthorizedCitationCases: unauthorized, unauthorizedCitationRate: total ? unauthorized / total : 0,
    questionCases: questionCases.length,
    abstentionCorrectCases: questionCases.filter(entry => entry.abstentionCorrect === true).length,
    abstentionAccuracy: questionCases.length ? questionCases.filter(entry => entry.abstentionCorrect === true).length / questionCases.length : null,
    schemaValidCases: schemaValid, schemaValidRate: total ? schemaValid / total : 0
  };
}
