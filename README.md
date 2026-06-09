# topcare-worker

> TopCare OS — 종사자용 모바일 앱 (React Native · Expo)

## 역할
요양보호사·케어워커가 현장에서 사용하는 모바일 앱입니다.  
**Android 먼저 개발 → iOS 후속 빌드** 전략으로 진행합니다.

## 담당 팀
Mobile 팀 (React Native)

## 기술 스택
| 항목 | 내용 |
|------|------|
| 프레임워크 | React Native (Expo SDK) |
| 라우터 | Expo Router (파일 기반) |
| UI | React Native Paper or NativeWind (Tailwind-like) |
| 상태 관리 | Zustand or React Query |
| 인증 | Supabase Auth (JWT) — topcare-shared 공유 |
| 푸시 알림 | Expo Notifications (FCM / APNs) |
| Android 빌드 | Android Studio + EAS Build |
| iOS 빌드 | Xcode + EAS Build (Android 완료 후) |
| 공유 패키지 | topcare-shared (타입, API 클라이언트) |

## 화면 구성 (Bottom Tab 4개)

| 탭 | 경로 | 주요 기능 |
|---|------|---------|
| 내 근무 | app/screens/my-schedule | 오늘 배정 근무, 담당 입주자 목록, 업무 지시 확인 |
| 케어 기록 | app/screens/care-log | 서비스 기록·관찰 일지 빠른 입력, 음성 입력 (P1) |
| 알림 | app/screens/alerts | 실시간 알림, 낙상·바이탈 긴급 알람 전체화면 인터럽트 |
| 건강 기록 | app/screens/health-log | 식사 섭취, 체중, 일일 점검 기록 |

## Android 개발 환경 설정
```bash
# 1. Expo CLI 설치
npm install -g expo-cli eas-cli

# 2. 의존성 설치
npm install

# 3. Android Studio에서 에뮬레이터 실행 후
npx expo run:android

# 4. 릴리즈 빌드 (EAS)
eas build --platform android
```

## iOS 개발 환경 설정 (Android 완료 후)
```bash
# macOS + Xcode 필요
npx expo run:ios

# 릴리즈 빌드 (EAS)
eas build --platform ios
```

## 의존성
- topcare-shared (타입, API 클라이언트)
- topcare-db (Supabase — 동일 DB 사용)
- topcare-web BFF API (/api/* 엔드포인트 공유)
