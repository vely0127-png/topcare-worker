/**
 * 관찰 기록 버튼 정본 사본 — 2026-09-01
 *
 * ⚠ 정본은 `topcare-web/lib/data/observation-buttons.ts` 다. 앱은 웹 리포를
 * import 할 수 없어(별도 배포물) 내용을 그대로 복사해 둔 사본이다.
 * **버튼을 추가/수정하면 반드시 양쪽 파일을 함께 고칠 것** — 어긋나면 같은
 * 관찰 항목이 웹과 앱에서 다르게 보이는 신뢰 훼손이 생긴다.
 *
 * ObservationDomain 4종은 웹 `lib/types/index.ts` 와 동일해야 한다.
 */

export type ObservationDomain =
  | '신체활동지원'
  | '인지관리 및 의사소통'
  | '건강 및 간호관리'
  | '기능회복훈련';

export interface ObservationButton {
  id: number;
  domain: ObservationDomain;
  mainCategory: string;
  buttonName: string;
  autoText: string;
  icon: string;
}

/** 화면 도메인 탭 순서 — 웹과 동일 */
export const OBSERVATION_DOMAINS: ObservationDomain[] = [
  '신체활동지원',
  '인지관리 및 의사소통',
  '건강 및 간호관리',
  '기능회복훈련',
];

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
  { id: 12, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '피부 관찰', autoText: '피부 상태를 관찰하고 이상 여부를 확인하였습니다.', icon: '👀' },
  { id: 13, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '욕창 치료', autoText: '욕창 부위에 약물을 도포하고 상태를 관찰하였습니다.', icon: '💊' },

  // Category: 일상
  { id: 14, domain: '신체활동지원', mainCategory: '일상', buttonName: '의류 관리', autoText: '의류를 정리하고 세탁이 필요한 것을 확인하였습니다.', icon: '👕' },
  { id: 15, domain: '신체활동지원', mainCategory: '일상', buttonName: '신발 벗기기', autoText: '신발을 안전하게 벗겨드리고 발을 확인하였습니다.', icon: '👞' },
  { id: 16, domain: '신체활동지원', mainCategory: '일상', buttonName: '옷 입기', autoText: '옷을 입으시는데 도움을 드려 입기 편하게 해드렸습니다.', icon: '👔' },

  // Domain: 인지관리 및 의사소통
  { id: 17, domain: '인지관리 및 의사소통', mainCategory: '인지관리', buttonName: '인지 자극', autoText: '인지 능력 개발을 위해 단순한 게임이나 활동을 진행하였습니다.', icon: '🧩' },
  { id: 18, domain: '인지관리 및 의사소통', mainCategory: '인지관리', buttonName: '오리엔테이션', autoText: '시간, 장소, 사람을 인식할 수 있도록 반복 설명하였습니다.', icon: '🗺️' },
  { id: 19, domain: '인지관리 및 의사소통', mainCategory: '의사소통', buttonName: '음성 및 말하기', autoText: '말하기 어려움에 대해 경청하고 이해하려고 노력하였습니다.', icon: '🗣️' },
  { id: 20, domain: '인지관리 및 의사소통', mainCategory: '의사소통', buttonName: '음악 치료', autoText: '즐겨 들으시는 음악을 틀어드려 정서적 안정을 도와드렸습니다.', icon: '🎵' },

  // Domain: 건강 및 간호관리
  { id: 21, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '투약 관리', autoText: '정해진 시간에 약물을 드리고 복용 여부를 확인하였습니다.', icon: '💊' },
  { id: 22, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '식사 제공', autoText: '영양가 있는 식사를 제때 제공하고 식사량을 확인하였습니다.', icon: '🍽️' },
  { id: 23, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '물 섭취', autoText: '탈수 예방을 위해 물과 음료를 정기적으로 제공하였습니다.', icon: '💧' },
  { id: 24, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '체온 측정', autoText: '체온을 측정하여 건강 상태를 확인하였습니다.', icon: '🌡️' },
  { id: 25, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '혈압 측정', autoText: '혈압을 측정하여 기록하고 건강 상태를 확인하였습니다.', icon: '📊' },

  // Category: 응급처치
  { id: 26, domain: '건강 및 간호관리', mainCategory: '응급처치', buttonName: '상처 처리', autoText: '상처를 소독하고 드레싱을 교체하여 감염을 예방하였습니다.', icon: '🩹' },
  { id: 27, domain: '건강 및 간호관리', mainCategory: '응급처치', buttonName: '통증 관리', autoText: '통증 호소 시 의료진에 보고하고 적절한 조치를 취하였습니다.', icon: '🤕' },

  // Domain: 기능회복훈련
  { id: 28, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '보행 연습', autoText: '안전하게 보행할 수 있도록 연습과 지원을 제공하였습니다.', icon: '🚶' },
  { id: 29, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '상지 운동', autoText: '팔 운동을 통해 관절의 유연성을 유지하도록 도와드렸습니다.', icon: '💪' },
  { id: 30, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '하지 운동', autoText: '다리 운동을 통해 근력을 유지하도록 도와드렸습니다.', icon: '🦵' },
  { id: 31, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '균형 운동', autoText: '균형감각 개발을 위한 운동을 함께 진행하였습니다.', icon: '⚖️' },
  { id: 32, domain: '기능회복훈련', mainCategory: '운동/재활', buttonName: '스트레칭', autoText: '근육 경직을 완화하기 위해 스트레칭을 도와드렸습니다.', icon: '🧘' },

  // Additional 8 buttons (35-42)
  { id: 35, domain: '신체활동지원', mainCategory: '일상', buttonName: '일상 양호/특이 없음', autoText: '어르신 오늘 하루 특이사항 없이 편안하게 지내셨으며, 건강 상태 양호하심.', icon: '✅' },
  { id: 36, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '목욕/세면 도움', autoText: '목욕(세면) 보조를 제공하여 청결을 유지해 드렸으며, 목욕 후 피부 상태를 점검함.', icon: '🛁' },
  { id: 37, domain: '신체활동지원', mainCategory: '체위/피부', buttonName: '휠체어/이동 보조', autoText: '휠체어를 이용하여 휴게실(식당)로 안전하게 이동을 도와드림.', icon: '♿' },
  { id: 38, domain: '인지관리 및 의사소통', mainCategory: '프로그램', buttonName: '프로그램 참여 일반', autoText: '오늘 진행된 활동 프로그램에 참여하시어 다른 어르신들과 함께 즐거운 시간을 보내심.', icon: '🎉' },
  { id: 39, domain: '인지관리 및 의사소통', mainCategory: '여가', buttonName: '여가활동', autoText: 'TV 시청, 노래 감상 등 여가 활동을 즐기시며 정서적으로 안정된 모습을 보이심.', icon: '📺' },
  { id: 40, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '화장실/배뇨 보조', autoText: '화장실 이용 시 보행 및 좌석 보조를 제공하여 안전하게 용변을 보실 수 있도록 도와드림.', icon: '🚻' },
  { id: 41, domain: '신체활동지원', mainCategory: '위생/배설', buttonName: '환복/의류 관리', autoText: '기온 및 어르신의 요청에 따라 적절한 의류로 환복을 도와드림.', icon: '👗' },
  { id: 42, domain: '건강 및 간호관리', mainCategory: '투약/루틴', buttonName: '수분 섭취 도움', autoText: '탈수 예방을 위해 수분 섭취를 돕고, 정해진 시간에 음료를 제공하여 적정량을 섭취하도록 관찰함.', icon: '🥤' }
];

// Utility functions
export function getButtonsByDomain(domain: ObservationDomain): ObservationButton[] {
  return OBSERVATION_BUTTONS.filter(btn => btn.domain === domain);
}

export function getButtonById(id: number): ObservationButton | undefined {
  return OBSERVATION_BUTTONS.find(btn => btn.id === id);
}
