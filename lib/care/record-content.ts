// 관찰3단 §5: CareRecord.content 표시용 파싱 헬퍼 — 웹 `lib/care/record-content.ts`의
// parseRecordContent/observationWarningSummary를 그대로 가져온 사본(표시 전용, 검증은 서버가 함).
// 워커앱은 저장 시 검증을 다시 하지 않는다 — 서버가 400으로 정직하게 거부한다.

/** content 컬럼(문자열 1개) 파싱 — 신형(JSON v1/v2)·구형(평문) 모두 흡수. GET 응답이
 *  이미 contentObj(파싱 결과)를 병행 제공하면 이 함수를 다시 부르지 않고 그대로 쓴다. */
export function parseRecordContent(raw: string | null | undefined): Record<string, any> | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') {
    return raw && typeof raw === 'object' ? (raw as Record<string, any>) : null;
  }
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return { note: raw };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
    return { note: raw };
  } catch {
    return { note: raw };
  }
}

/** 관찰 목록·이력 행 표시용 — '주의' 배지 여부 + 사유 요약 문자열(내부 화면 전용, 사유 포함) */
export function observationWarningSummary(
  contentObj: Record<string, any> | null | undefined,
): { warning: boolean; reasonSummary: string } {
  if (!contentObj || contentObj.v !== 2 || !Array.isArray(contentObj.items)) return { warning: false, reasonSummary: '' };
  const negatives = contentObj.items.filter((i: any) => i && i.kind === 'state' && i.outcome === 'negative');
  if (negatives.length === 0) return { warning: false, reasonSummary: '' };
  const parts = negatives.map((i: any) => {
    const reason = i.reasonText || (Array.isArray(i.reasons) && i.reasons.length > 0 ? i.reasons.join('·') : '') || '이유 불명';
    return `${i.name}(${reason})`;
  });
  return { warning: true, reasonSummary: parts.join(', ') };
}
