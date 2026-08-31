// 선택적 의존 스텁 — @supabase/supabase-js 가 런타임에 optional 로 부르는 모듈.
// supabase 는 import(...).catch(() => null) 로 감싸 실패해도 무해하지만,
// Metro 는 정적으로 해석하려다 "Unable to resolve module" 로 번들을 실패시킨다.
// (웹 export 시 발견 — 2026-08-06)
module.exports = {};
