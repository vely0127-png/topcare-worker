// 관찰3단 §3: 상태·반응 카드 문장 조립 — 웹 ObservationTab.buildStateSentence와 동일 규칙
// (N-24: 미리보기에 보이는 문장 = 저장되는 문장). 시트(ObservationOutcomeSheet)와 관찰 화면
// (app/(tabs)/observation/index.tsx) 양쪽에서 이 함수 하나만 쓴다 — 문장 조립 로직 이원화 금지.
import type { ObservationOutcome, ObservationOutcomeTemplates } from '../data/observation-buttons';

export function buildObservationSentence(
  outcomes: ObservationOutcomeTemplates | undefined,
  outcome: ObservationOutcome,
  reasons: string[],
  reasonText: string,
): string {
  const template = outcomes?.[outcome];
  if (!template) return '';
  if (outcome !== 'negative') return template;
  const reasonLabel = reasonText.trim() || (reasons.length > 0 ? reasons.join('·') : '이유 불명');
  return template.replace('{reason}', reasonLabel);
}
