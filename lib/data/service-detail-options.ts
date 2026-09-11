/**
 * 서비스 상세(2단 선택) 옵션 — 내장 기본값 사본 (#23, 2026-09-11 자동화 동등성 빌드)
 *
 * ⚠ 정본은 `topcare-web/lib/care/service-detail-options.ts`(팀A) 다. 앱은 웹 리포를
 * import 할 수 없어(별도 배포물) 내용을 그대로 복사해 둔 사본이다 — `lib/data/observation-buttons.ts`
 * 와 같은 관례. **그룹·옵션을 추가/수정하면 반드시 양쪽 파일을 함께 고칠 것.**
 *
 * 공유 계약(팀A 정본과 이름·shape 동일):
 *   GET /api/care/service-detail-options → { ok:true, data:{ version, source:'builtin'|'facility', specs: ServiceDetailSpec[] } }
 *   저장: POST /api/care/service-provisions 에 body.selection: Record<groupKey, string[]>(선택 라벨 배열)
 *         + note 를 추가로 보내면 서버가 detail 을 조립한다. 기존 detail 키
 *         (type·amount·condition·skin·note·bathType·assistance)도 그대로 허용.
 *
 * 배변·목욕은 기존 `app/(tabs)/workboard.tsx` DETAIL_CONFIG 의 옵션·문구를 그대로 옮겼다
 * (회귀 금지). 나머지 8종은 `lib/care/service-rules.ts`·`lib/data/observation-buttons.ts` 에
 * 이미 있는 단어만으로 최소 그룹을 구성했다 — 새 용어를 발명하지 않았다.
 */

export interface ServiceDetailOption {
  key: string;
  label: string;
  /** 선택 시 "간호 확인 신호"로 취급 — 시트에 경고 배지, 작업판에 예외 표시 */
  exception?: boolean;
}

export interface ServiceDetailGroup {
  key: string;
  label: string;
  /** true면 복수 선택(칩 다중), false면 단일 선택 */
  multi: boolean;
  /** true면 저장 전 이 그룹에서 최소 1개 선택 필수 */
  required?: boolean;
  options: ServiceDetailOption[];
}

export interface ServiceDetailSpec {
  serviceType: string;
  groups: ServiceDetailGroup[];
  /** 비고(자유 텍스트) 입력창 placeholder */
  noteHint?: string;
}

// ── 내장 전용 확장 타입 — 정본 계약(ServiceDetailOption/Group/Spec)에는 없는 필드다.
//    canned note·detail 은 서버 specs가 아직 없을 때(오프라인 폴백)만 쓰는 로컬 보강값 —
//    선택 즉시 저장되던 기존 배변·목욕 시트의 문구·CareRecord 매핑을 회귀 없이 재현하기 위함.
interface BuiltinServiceDetailOption extends ServiceDetailOption {
  /** 선택 시 note 로 합성될 정확한 문구(레거시 문구 보존). 없으면 label 로 합성한다. */
  note?: string;
  /** 레거시 detail 키(서버가 selection 조립을 아직 못 미덥거나 안 할 때의 안전망) */
  detail?: Record<string, string>;
}

interface BuiltinServiceDetailGroup extends Omit<ServiceDetailGroup, 'options'> {
  options: BuiltinServiceDetailOption[];
}

interface BuiltinServiceDetailSpec extends Omit<ServiceDetailSpec, 'groups'> {
  groups: BuiltinServiceDetailGroup[];
}

const EX = ' — 간호 확인 필요';

export const BUILTIN_SERVICE_DETAIL_SPECS: BuiltinServiceDetailSpec[] = [
  {
    serviceType: 'meal',
    noteHint: '식사 관련 특이사항이 있으면 적어주세요',
    groups: [
      {
        key: 'amount', label: '식사량', multi: false, required: true,
        options: [
          { key: 'full', label: '전량', exception: false },
          { key: 'half', label: '절반', exception: false },
          { key: 'little', label: '소량', exception: true, note: `소량만 섭취${EX}` },
          { key: 'refused', label: '거부', exception: true, note: `식사를 거부하심${EX}` },
        ],
      },
      {
        key: 'method', label: '방법', multi: false, required: false,
        options: [
          { key: 'self', label: '자가', exception: false },
          { key: 'partial_assist', label: '부분보조', exception: false },
          { key: 'full_assist', label: '완전보조', exception: false },
        ],
      },
    ],
  },
  {
    serviceType: 'medication',
    noteHint: '투약 관련 특이사항',
    groups: [
      {
        key: 'result', label: '복용 여부', multi: false, required: true,
        options: [
          { key: 'taken', label: '복용', exception: false },
          { key: 'refused', label: '거부', exception: true, note: `투약을 거부하심${EX}` },
          { key: 'held', label: '보류', exception: true, note: `투약 보류${EX}` },
        ],
      },
    ],
  },
  {
    serviceType: 'vital',
    noteHint: '측정값 관련 특이사항',
    groups: [
      {
        key: 'result', label: '결과', multi: false, required: true,
        options: [
          { key: 'done', label: '측정완료', exception: false },
          { key: 'recheck', label: '재측정필요', exception: true, note: `재측정 필요${EX}` },
        ],
      },
    ],
  },
  {
    // 목욕은 요일 배정자에게만(PERSONAL_TYPES) — 문구·옵션은 기존 workboard DETAIL_CONFIG.bathing 그대로
    serviceType: 'bathing',
    noteHint: '목욕 관련 특이사항',
    groups: [
      {
        key: 'detail', label: '목욕은 어땠나요?', multi: false, required: true,
        options: [
          { key: 'partial_bath', label: '부분목욕만', exception: false, note: '부분목욕으로 제공', detail: { bathType: '부분목욕', assistance: '부분보조', skin: '정상' } },
          { key: 'bed_bath', label: '침상목욕', exception: false, note: '침상목욕으로 제공', detail: { bathType: '침상목욕', assistance: '완전보조', skin: '정상' } },
          { key: 'skin', label: '피부 발적 · 상처 발견', exception: true, note: `피부 발적·상처 발견${EX}`, detail: { bathType: '전신목욕', skin: '발적' } },
          { key: 'refused', label: '거부하심', exception: true, note: '어르신이 거부하셔서 제공하지 못함' },
          { key: 'partial', label: '절반만·일부만', exception: true, note: '일부만 제공함' },
          { key: 'issue', label: '이상 발견', exception: true, note: `제공 중 이상 소견${EX}` },
        ],
      },
    ],
  },
  {
    serviceType: 'position',
    noteHint: '체위 관련 특이사항',
    groups: [
      {
        key: 'position', label: '체위', multi: false, required: true,
        options: [
          { key: 'left', label: '좌측', exception: false },
          { key: 'right', label: '우측', exception: false },
          { key: 'supine', label: '앙와위', exception: false },
        ],
      },
    ],
  },
  {
    // 문구·옵션은 기존 workboard DETAIL_CONFIG.defecation 그대로(배변 유무 시트는 별도 유지, 손대지 않음)
    serviceType: 'defecation',
    noteHint: '배변 관련 특이사항',
    groups: [
      {
        key: 'detail', label: '무엇을 확인했나요?', multi: false, required: true,
        options: [
          { key: 'stool', label: '대변 있었음', exception: false, note: '대변 확인', detail: { type: '대변', amount: '보통', condition: '정상', skin: '정상' } },
          { key: 'diarrhea', label: '설사', exception: true, note: `설사${EX}`, detail: { type: '대변', condition: '설사', skin: '정상' } },
          { key: 'constipation', label: '변비 · 안 나옴', exception: true, note: '배변 없음 — 변비 경향', detail: { type: '배설없음', condition: '변비' } },
          { key: 'blood', label: '혈변', exception: true, note: '혈변 — 간호 즉시 확인 필요', detail: { type: '대변', condition: '혈변' } },
          { key: 'skin', label: '피부 발적 · 짓무름', exception: true, note: `피부 발적·짓무름${EX}`, detail: { skin: '발적' } },
          { key: 'refused', label: '거부하심', exception: true, note: '어르신이 거부하셔서 제공하지 못함' },
          { key: 'partial', label: '절반만·일부만', exception: true, note: '일부만 제공함' },
        ],
      },
    ],
  },
  {
    serviceType: 'program',
    noteHint: '프로그램 참여 관련 특이사항',
    groups: [
      {
        key: 'participation', label: '참여도', multi: false, required: true,
        options: [
          { key: 'active', label: '적극', exception: false },
          { key: 'normal', label: '보통', exception: false },
          { key: 'passive', label: '소극', exception: false },
          { key: 'refused', label: '거부', exception: true, note: `프로그램 참여를 거부하심${EX}` },
        ],
      },
    ],
  },
  {
    serviceType: 'therapy',
    noteHint: '재활 반응 관련 특이사항',
    groups: [
      {
        key: 'response', label: '반응', multi: false, required: true,
        options: [
          { key: 'active', label: '적극', exception: false },
          { key: 'normal', label: '보통', exception: false },
          { key: 'passive', label: '소극', exception: false },
          { key: 'refused', label: '거부', exception: true, note: `재활을 거부하심${EX}` },
        ],
      },
    ],
  },
  {
    serviceType: 'nursing',
    noteHint: '처치 관련 특이사항',
    groups: [
      {
        key: 'action', label: '처치 내용', multi: true, required: false,
        options: [
          { key: 'wound', label: '상처 처리', exception: false },
          { key: 'pain', label: '통증 관리', exception: true, note: `통증 관리${EX}` },
        ],
      },
    ],
  },
  {
    serviceType: 'routine',
    noteHint: '일과 관련 특이사항',
    groups: [
      {
        key: 'result', label: '결과', multi: false, required: false,
        options: [
          { key: 'refused', label: '거부하심', exception: true, note: '어르신이 거부하셔서 제공하지 못함' },
          { key: 'partial', label: '절반만·일부만', exception: true, note: '일부만 제공함' },
          { key: 'issue', label: '이상 발견', exception: true, note: `제공 중 이상 소견${EX}` },
        ],
      },
    ],
  },
];

/**
 * serviceType → spec 조회(내장 사본 기준). 반환 타입은 정본 계약(ServiceDetailSpec)보다
 * 넓은 내장 전용 타입이다 — canned note·detail 을 composeSelectionNote 가 읽는다.
 */
function builtinSpecFor(serviceType: string): BuiltinServiceDetailSpec | null {
  return BUILTIN_SERVICE_DETAIL_SPECS.find((s) => s.serviceType === serviceType) ?? null;
}

/**
 * 예외로 취급되는 note 문구 전체 집합(내장 사본 기준) — 레거시 배변·목욕 문구 그대로 포함
 * (예: '배변 없음 — 변비 경향'은 "간호 확인 필요" 접미사가 없어도 예외였다 — 회귀 금지).
 */
const BUILTIN_EXCEPTION_NOTES: Set<string> = new Set(
  BUILTIN_SERVICE_DETAIL_SPECS.flatMap((s) => s.groups).flatMap((g) => g.options)
    .filter((o) => o.exception && o.note)
    .map((o) => o.note as string),
);

/**
 * 기록(note)이 예외인지 판정 — 작업판 배지·완료 카운트에 쓴다.
 * ① 내장 사본의 정확한 canned note 문구(레거시 배변·목욕 포함)와 일치하거나
 * ② composeSelectionNote 가 새로 조합한 문구에 붙는 고정 접미사를 포함하면 예외.
 */
export function isExceptionNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return BUILTIN_EXCEPTION_NOTES.has(note) || note.includes('간호 확인 필요');
}

export interface ComposedSelectionResult {
  note: string | null;
  detail?: Record<string, string>;
  hasException: boolean;
}

/**
 * 시트에서 고른 선택(selection: 그룹키→선택 라벨 배열) + 자유 비고를
 * 저장용 note/detail 로 합성한다. 내장 사본에 canned note·detail 이 있으면
 * (배변·목욕 등) 그 문구를 그대로 쓰고, 없으면 선택한 라벨을 이어붙인다.
 * 서버가 아직 selection 을 조립하지 못하는 경우에도 note/detail 만으로
 * 온전한 기록이 남도록 하는 안전망이다.
 */
export function composeSelectionNote(
  serviceType: string,
  selection: Record<string, string[]>,
  freeNote?: string | null,
): ComposedSelectionResult {
  const spec = builtinSpecFor(serviceType);
  let hasException = false;
  const detail: Record<string, string> = {};
  const parts: string[] = [];

  if (spec) {
    for (const group of spec.groups) {
      const picked = selection[group.key] ?? [];
      for (const label of picked) {
        const opt = group.options.find((o) => o.label === label);
        if (!opt) { parts.push(label); continue; }
        if (opt.exception) hasException = true;
        parts.push(opt.note ?? opt.label);
        if (opt.detail) Object.assign(detail, opt.detail);
      }
    }
  } else {
    // 알 수 없는 serviceType(신규 유형 등) — 선택 라벨을 그대로 이어붙인다(추측하지 않음)
    for (const labels of Object.values(selection)) parts.push(...labels);
  }

  const trimmedFreeNote = freeNote?.trim();
  const combined = parts.length > 0 ? parts.join(' · ') : null;
  const note = trimmedFreeNote
    ? (combined ? `${combined} (${trimmedFreeNote})` : trimmedFreeNote)
    : combined;

  return {
    note,
    detail: Object.keys(detail).length > 0 ? detail : undefined,
    hasException,
  };
}
