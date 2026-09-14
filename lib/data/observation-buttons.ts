/**
 * 관찰 기록 버튼 정본 사본 — 2026-09-01 (관찰3단 §2/§6: v2로 갱신 2026-09-15)
 *
 * ⚠ 정본은 `topcare-web/lib/data/observation-buttons.ts` 다. 앱은 웹 리포를
 * import 할 수 없어(별도 배포물) 내용을 그대로 복사해 둔 사본이다.
 * **버튼을 추가/수정하면 반드시 양쪽 파일을 함께 고칠 것** — 어긋나면 같은
 * 관찰 항목이 웹과 앱에서 다르게 보이는 신뢰 훼손이 생긴다.
 *
 * ObservationDomain 4종은 웹 `lib/types/index.ts` 와 동일해야 한다.
 *
 * 관찰3단 §2 (2026-09-14 대표 확정): 상태·반응 카드(kind:'state')는 3단(양호/평소와 같음/주의)
 * 선택 + '주의'면 사유(2~8개, 마지막은 항상 '이유 불명') — 문장은 결과별 템플릿(outcomes)에
 * 사유를 끼워 조립한다. 행위 카드(kind 미지정 = 'action')는 기존 동작(탭 1회 → autoText) 그대로
 * 유지 — 대표 지시. 이 사본은 웹 정본과 필드까지 동일하게 갱신했다(id 43~47 신설 포함).
 */

export type ObservationDomain =
  | '신체활동지원'
  | '인지관리 및 의사소통'
  | '건강 및 간호관리'
  | '기능회복훈련';

// 관찰3단 §2: 상태·반응 카드 3단(양호/평소와 같음/주의) 결과 판별 유니언
export type ObservationOutcome = 'positive' | 'neutral' | 'negative';

// 관찰3단 §2: 카드 성격 — 'action'(행위, 기존 동작 유지) | 'state'(상태·반응, 3단 선택)
export type ObservationCardKind = 'action' | 'state';

export interface ObservationOutcomeTemplates {
  positive: string;
  /** singleOutcome:'positive' 카드(예: 일상 양호/특이없음)는 neutral/negative가 없다 */
  neutral?: string;
  /** {reason} 자리표시자를 실제 사유로 치환해서 사용한다 */
  negative?: string;
}

export interface ObservationButton {
  id: number;
  domain: ObservationDomain;
  mainCategory: string;
  buttonName: string;
  autoText: string;
  icon: string;
  /** 관찰3단 §2: 미지정 시 'action'(기존 카드 전부 하위호환) */
  kind?: ObservationCardKind;
  /** kind:'state'일 때만 사용 — 3단 문장 템플릿 */
  outcomes?: ObservationOutcomeTemplates;
  /** kind:'state'일 때만 사용 — 사유 정본 2~8개(마지막은 항상 "이유 불명") */
  reasons?: string[];
  /** true면 사유 칩 외에 "직접 입력"(자유 텍스트)도 허용 */
  allowFreeReason?: boolean;
  /** 35(일상 양호/특이 없음)처럼 3단이 아니라 양호 전용 단일 결과인 카드 */
  singleOutcome?: 'positive';
}

/** 화면 도메인 탭 순서 — 웹과 동일 */
export const OBSERVATION_DOMAINS: ObservationDomain[] = [
  '신체활동지원',
  '인지관리 및 의사소통',
  '건강 및 간호관리',
  '기능회복훈련',
];

// 관찰3단 §2/§6: 카드 정본 버전 — 서버 GET /api/care/observation-cards 응답의 `version`과
// 비교해 앱이 폴백 중인지 참고용으로만 쓴다(강제 동기화 로직 없음 — useObservationCards 참고).
export const OBSERVATION_CARDS_VERSION = '2026-09-14a';

export const OBSERVATION_BUTTONS: ObservationButton[] = [
  // Domain: 신체활동지원
  // Category: 기본 위생 관리
  { id: 1, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '면도 보조', autoText: '면도를 보조하여 청결을 유지하는 데 도움을 드렸습니다.', icon: '🧔' },
  { id: 2, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '손/발 씻김', autoText: '손과 발을 깨끗이 씻겨 위생을 유지하도록 하였습니다.', icon: '🚿' },
  { id: 3, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '입 양치', autoText: '구강 위생을 위해 입을 헹굼과 양치를 도와드렸습니다.', icon: '🪥' },
  { id: 4, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '코 청소', autoText: '비강 분비물을 닦아 호흡 기도를 유지하도록 도와드렸습니다.', icon: '👃' },
  { id: 5, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '귀 청소', autoText: '귀 주변을 깨끗이 닦아 청결을 유지하도록 하였습니다.', icon: '👂' },

  // Category: 위생/배설
  { id: 6, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '배변 보조', autoText: '배변 시 안전하게 휴대용 변기를 사용하도록 도와드렸습니다.', icon: '🚽' },
  { id: 7, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '배뇨 보조', autoText: '배뇨 시 요강 사용을 도와드리고 위생 처리를 하였습니다.', icon: '💧' },
  { id: 8, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '오줌 흡수 제품 교체', autoText: '오줌 흡수 패드를 교체하여 피부 건강을 유지하도록 하였습니다.', icon: '🧴' },
  { id: 9, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '기저귀 관리', autoText: '기저귀를 교체하고 피부 상태를 확인하였습니다.', icon: '👶' },

  // Category: 체위/피부
  { id: 10, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '침대 정리', autoText: '침구를 정리하고 침대를 깨끗이 유지하였습니다.', icon: '🛏️' },
  { id: 11, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '체위 변경', autoText: '욕창 예방을 위해 정기적으로 체위를 변경해 드렸습니다.', icon: '🔄' },
  // 관찰3단 §2: state(3단) — 대표 확정 목록(기존 11) #1
  { id: 12, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '피부 관찰', autoText: '피부 상태를 관찰하고 이상 여부를 확인하였습니다.', icon: '👀',
    kind: 'state',
    outcomes: {
      positive: '피부 상태를 관찰한 결과 깨끗하고 양호하였습니다.',
      neutral: '피부 상태는 평소와 같았습니다.',
      negative: '피부에서 이상 소견이 관찰되었습니다 — {reason}.',
    },
    reasons: ['발적', '건조', '상처', '부종', '가려움 호소', '이유 불명'],
    allowFreeReason: true },
  { id: 13, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '욕창 치료', autoText: '욕창 부위에 약물을 도포하고 상태를 관찰하였습니다.', icon: '💊' },

  // Category: 일상
  { id: 14, domain: '신체활동지원', mainCategory: '일상', buttonName: '의류 관리', autoText: '의류를 정리하고 세탁이 필요한 것을 확인하였습니다.', icon: '👕' },
  { id: 15, domain: '신체활동지원', mainCategory: '일상', buttonName: '신발 벗기기', autoText: '신발을 안전하게 벗겨드리고 발을 확인하였습니다.', icon: '👞' },
  { id: 16, domain: '신체활동지원', mainCategory: '일상', buttonName: '옷 입기', autoText: '옷을 입으시는데 도움을 드려 입기 편하게 해드렸습니다.', icon: '👔' },

  // Domain: 인지관리 및 의사소통
  // 관찰3단 §2: state(3단) #2 — 사유는 설계 §2 예시에 없어 자체 초안(간호 검토 권장, 보고서 참고)
  { id: 17, domain: '인지관리 및 의사소통', mainCategory: '인지관리', buttonName: '인지 자극', autoText: '인지 능력 개발을 위해 단순한 게임이나 활동을 진행하였습니다.', icon: '🧩',
    kind: 'state',
    outcomes: {
      positive: '인지 자극 활동에 적극적으로 참여하셨습니다.',
      neutral: '인지 자극 활동 참여는 평소와 같았습니다.',
      negative: '인지 자극 활동 참여를 거부하심 — {reason}.',
    },
    reasons: ['졸림', '흥미 없음 표현', '집중 어려움 호소', '불편감 호소', '이유 불명'],
    allowFreeReason: true },
  // 관찰3단 §2: state(3단) #3 — 사유는 설계 §2 인지 항목(시간·장소·사람 혼동, 반복 질문)을 그대로 적용
  { id: 18, domain: '인지관리 및 의사소통', mainCategory: '인지관리', buttonName: '오리엔테이션', autoText: '시간, 장소, 사람을 인식할 수 있도록 반복 설명하였습니다.', icon: '🗺️',
    kind: 'state',
    outcomes: {
      positive: '시간·장소·사람을 정확히 인식하셨습니다.',
      neutral: '지남력 상태는 평소와 같았습니다.',
      negative: '시간·장소·사람 인식에 혼동을 보이심 — {reason}.',
    },
    reasons: ['반복 질문', '장소 혼동', '사람 혼동', '시간 혼동', '이유 불명'],
    allowFreeReason: true },
  // 관찰3단 §2: state(3단) #4 — 사유는 설계 §2 예시에 없어 자체 초안(간호 검토 권장, 보고서 참고)
  { id: 19, domain: '인지관리 및 의사소통', mainCategory: '의사소통', buttonName: '음성 및 말하기', autoText: '말하기 어려움에 대해 경청하고 이해하려고 노력하였습니다.', icon: '🗣️',
    kind: 'state',
    outcomes: {
      positive: '말씀을 명료하게 하셨습니다.',
      neutral: '말하기 상태는 평소와 같았습니다.',
      negative: '말하기 어려움을 호소하심 — {reason}.',
    },
    reasons: ['발음 불편', '단어 찾기 어려움', '피로감 호소', '기분 저하', '이유 불명'],
    allowFreeReason: true },
  { id: 20, domain: '인지관리 및 의사소통', mainCategory: '의사소통', buttonName: '음악 치료', autoText: '즐겨 들으시는 음악을 틀어드려 정서적 안정을 도와드렸습니다.', icon: '🎵' },

  // Domain: 건강 및 간호관리
  { id: 21, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '투약 관리', autoText: '정해진 시간에 약물을 드리고 복용 여부를 확인하였습니다.', icon: '💊' },
  // 관찰3단 §2: state(3단) #5 — 대표 원문 예시("식사 → 거부하심 → 왜 → 소화가 안 되어서") 그대로 반영
  { id: 22, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '식사 제공', autoText: '영양가 있는 식사를 제때 제공하고 식사량을 확인하였습니다.', icon: '🍽️',
    kind: 'state',
    outcomes: {
      positive: '식사를 잘 하셨습니다.',
      neutral: '식사량은 평소와 같았습니다.',
      negative: '식사를 거부하심 — {reason}.',
    },
    reasons: ['소화 불량', '식욕 저하', '치아/구강 불편', '기분 저하', '졸림', '식단 거부', '구토/오심', '이유 불명'],
    allowFreeReason: true },
  // 관찰3단 §2: state(3단) #6 — 설계 §2 예시 그대로
  { id: 23, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '물 섭취', autoText: '탈수 예방을 위해 물과 음료를 정기적으로 제공하였습니다.', icon: '💧',
    kind: 'state',
    outcomes: {
      positive: '물과 음료를 충분히 섭취하셨습니다.',
      neutral: '수분 섭취량은 평소와 같았습니다.',
      negative: '수분 섭취를 거부하심 — {reason}.',
    },
    reasons: ['목 넘김 불편', '졸림', '거부감 호소', '구강 불편', '이유 불명'],
    allowFreeReason: true },
  { id: 24, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '체온 측정', autoText: '체온을 측정하여 건강 상태를 확인하였습니다.', icon: '🌡️' },
  { id: 25, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '혈압 측정', autoText: '혈압을 측정하여 기록하고 건강 상태를 확인하였습니다.', icon: '📊' },

  // Category: 응급처치
  { id: 26, domain: '건강 및 간호관리', mainCategory: '응급처치', buttonName: '상처 처리', autoText: '상처를 소독하고 드레싱을 교체하여 감염을 예방하였습니다.', icon: '🩹' },
  // 관찰3단 §2: state(3단) #7 — 사유는 설계 §2 "부위 선택" 예시 그대로(무릎·허리·어깨·복부·두통)
  { id: 27, domain: '건강 및 간호관리', mainCategory: '응급처치', buttonName: '통증 관리', autoText: '통증 호소 시 의료진에 보고하고 적절한 조치를 취하였습니다.', icon: '🤕',
    kind: 'state',
    outcomes: {
      positive: '통증 호소 없이 편안하게 지내셨습니다.',
      neutral: '통증 정도는 평소와 같았습니다.',
      negative: '통증을 호소하심 — {reason}.',
    },
    reasons: ['무릎', '허리', '어깨', '복부', '두통', '이유 불명'],
    allowFreeReason: true },

  // Domain: 기능회복훈련
  // 관찰3단 §2: state(3단) #8 — 보행 연습은 기존 action에서 state로 전환(대표 확정)
  { id: 28, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '보행 연습', autoText: '안전하게 보행할 수 있도록 연습과 지원을 제공하였습니다.', icon: '🚶',
    kind: 'state',
    outcomes: {
      positive: '안전하게 보행 연습을 하셨습니다.',
      neutral: '보행 상태는 평소와 같았습니다.',
      negative: '보행 시 불편감을 호소하심 — {reason}.',
    },
    reasons: ['어지럼 호소', '다리 통증 호소', '휘청거림 관찰', '보행 거부', '이유 불명'],
    allowFreeReason: true },
  { id: 29, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '상지 운동', autoText: '팔 운동을 통해 관절의 유연성을 유지하도록 도와드렸습니다.', icon: '💪' },
  { id: 30, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '하지 운동', autoText: '다리 운동을 통해 근력을 유지하도록 도와드렸습니다.', icon: '🦵' },
  { id: 31, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '균형 운동', autoText: '균형감각 개발을 위한 운동을 함께 진행하였습니다.', icon: '⚖️' },
  { id: 32, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '스트레칭', autoText: '근육 경직을 완화하기 위해 스트레칭을 도와드렸습니다.', icon: '🧘' },

  // Additional 8 buttons (35-42)
  // 관찰3단 §2: singleOutcome:'positive' — 3단 없음(양호 전용), 다른 state 카드가 '주의'면 동시 선택 불가(§1-4)
  { id: 35, domain: '신체활동지원', mainCategory: '일상', buttonName: '일상 양호/특이 없음', autoText: '어르신 오늘 하루 특이사항 없이 편안하게 지내셨으며, 건강 상태 양호하심.', icon: '✅',
    kind: 'state',
    singleOutcome: 'positive',
    outcomes: { positive: '어르신 오늘 하루 특이사항 없이 편안하게 지내셨으며, 건강 상태 양호하심.' } },
  { id: 36, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '목욕/세면 도움', autoText: '목욕(세면) 보조를 제공하여 청결을 유지해 드렸으며, 목욕 후 피부 상태를 점검함.', icon: '🛁' },
  { id: 37, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '휠체어/이동 보조', autoText: '휠체어를 이용하여 휴게실(식당)로 안전하게 이동을 도와드림.', icon: '♿' },
  // 관찰3단 §2: state(3단) #9 — 사유는 설계 §2 예시에 없어 자체 초안(간호 검토 권장, 보고서 참고)
  { id: 38, domain: '인지관리 및 의사소통', mainCategory: '프로그램', buttonName: '프로그램 참여 일반', autoText: '오늘 진행된 활동 프로그램에 참여하시어 다른 어르신들과 함께 즐거운 시간을 보내심.', icon: '🎉',
    kind: 'state',
    outcomes: {
      positive: '프로그램에 즐겁게 참여하셨습니다.',
      neutral: '프로그램 참여는 평소와 같았습니다.',
      negative: '프로그램 참여를 거부하심 — {reason}.',
    },
    reasons: ['피로감 호소', '흥미 없음 표현', '컨디션 저하 호소', '다른 어르신과의 갈등', '이유 불명'],
    allowFreeReason: true },
  // 관찰3단 §2: state(3단) #10 — 사유는 설계 §2 예시에 없어 자체 초안(간호 검토 권장, 보고서 참고)
  { id: 39, domain: '인지관리 및 의사소통', mainCategory: '여가', buttonName: '여가활동', autoText: 'TV 시청, 노래 감상 등 여가 활동을 즐기시며 정서적으로 안정된 모습을 보이심.', icon: '📺',
    kind: 'state',
    outcomes: {
      positive: '여가활동을 즐기시며 정서적으로 안정된 모습을 보이셨습니다.',
      neutral: '여가활동 참여는 평소와 같았습니다.',
      negative: '여가활동 참여를 거부하심 — {reason}.',
    },
    reasons: ['피로감 호소', '흥미 없음 표현', '컨디션 저하 호소', '이유 불명'],
    allowFreeReason: true },
  { id: 40, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '화장실/배뇨 보조', autoText: '화장실 이용 시 보행 및 좌석 보조를 제공하여 안전하게 용변을 보실 수 있도록 도와드림.', icon: '🚻' },
  { id: 41, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '환복/의류 관리', autoText: '기온 및 어르신의 요청에 따라 적절한 의류로 환복을 도와드림.', icon: '👗' },
  { id: 42, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '수분 섭취 도움', autoText: '탈수 예방을 위해 수분 섭취를 돕고, 정해진 시간에 음료를 제공하여 적정량을 섭취하도록 관찰함.', icon: '🥤' },

  // ── 관찰3단 §2: 신설 5종(id 43~47, 대표 확정 2026-09-14 밤) ──
  // 사유 정본은 설계 §2에 명시 없는 신규 카드라 전부 자체 초안(간호 검토 권장 — 보고서에 목록 표기)
  { id: 43, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '수면 상태', autoText: '수면 상태를 관찰하였습니다.', icon: '😴',
    kind: 'state',
    outcomes: {
      positive: '편안하게 주무셨습니다.',
      neutral: '수면 상태는 평소와 같았습니다.',
      negative: '수면에 어려움을 겪으심 — {reason}.',
    },
    reasons: ['통증 호소', '소음', '야간 배뇨', '불안 호소', '낮잠 과다', '이유 불명'],
    allowFreeReason: true },
  { id: 44, domain: '인지관리 및 의사소통', mainCategory: '인지관리', buttonName: '기분/정서', autoText: '기분·정서 상태를 관찰하였습니다.', icon: '🙂',
    kind: 'state',
    outcomes: {
      positive: '기분이 좋고 정서적으로 안정되어 보이셨습니다.',
      neutral: '기분 상태는 평소와 같았습니다.',
      negative: '기분 저하나 불안정한 모습을 보이심 — {reason}.',
    },
    reasons: ['가족 면회 후', '통증 호소', '소음', '낯선 환경', '이유 불명'],
    allowFreeReason: true },
  { id: 45, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '배설 상태', autoText: '배설 상태를 관찰하였습니다.', icon: '🚽',
    kind: 'state',
    outcomes: {
      positive: '배설 상태가 원활하고 양호하였습니다.',
      neutral: '배설 상태는 평소와 같았습니다.',
      negative: '배설에 어려움을 보이심 — {reason}.',
    },
    reasons: ['변비 호소', '설사', '잔뇨감 호소', '실금', '통증 호소', '이유 불명'],
    allowFreeReason: true },
  { id: 46, domain: '건강 및 간호관리', mainCategory: '응급처치', buttonName: '낙상/어지럼 호소', autoText: '낙상 위험·어지럼 여부를 관찰하였습니다.', icon: '😵',
    kind: 'state',
    outcomes: {
      positive: '어지럼이나 낙상 위험 없이 안정적으로 이동하셨습니다.',
      neutral: '보행·이동 상태는 평소와 같았습니다.',
      negative: '어지럼이나 휘청거림을 호소하심 — {reason}.',
    },
    reasons: ['일어설 때 어지럼 호소', '수면 부족 호소', '공복 호소', '휘청거림 관찰', '이유 불명'],
    allowFreeReason: true },
  { id: 47, domain: '건강 및 간호관리', mainCategory: '응급처치', buttonName: '호흡 상태', autoText: '호흡 상태를 관찰하였습니다.', icon: '🌬️',
    kind: 'state',
    outcomes: {
      positive: '호흡이 편안하고 안정적이었습니다.',
      neutral: '호흡 상태는 평소와 같았습니다.',
      negative: '호흡 불편을 호소하심 — {reason}.',
    },
    reasons: ['숨참 호소', '기침 동반', '가래 호소', '불안 호소', '이유 불명'],
    allowFreeReason: true },
];

// Utility functions
export function getButtonsByDomain(domain: ObservationDomain): ObservationButton[] {
  return OBSERVATION_BUTTONS.filter(btn => btn.domain === domain);
}

export function getButtonById(id: number): ObservationButton | undefined {
  return OBSERVATION_BUTTONS.find(btn => btn.id === id);
}
