#!/usr/bin/env node
/**
 * 워커앱 릴리스 산출물 검증 게이트 (2026-09-25, 2.4.6 / Q22-11)
 *
 * 왜 있나
 *   BUILD SUCCESSFUL·tsc 0은 "APK 안에 무엇이 박혔는지"를 보증하지 않는다. 같은 유형의 사고가 3번 있었다.
 *   - 2.4.1: Metro 캐시가 옛 EXPO_PUBLIC_API_URL(vercel.app)을 재사용 → 구 도메인 호출.
 *   - 2.4.4 worktree 빌드: node_modules 정션 때문에 expo-router 라우트 0개 번들(1.16MB) — 빈 앱.
 *   - 2.4.5: gradle 증분 캐시로 assets/app.config가 2.4.4에 머묾 → 홈 하단 "v2.4.4 (build 17)"(QA22 Q22-11).
 *   이 스크립트를 통과하지 못한 산출물은 code/releases/에 복사하지 않는다.
 *
 * 사용
 *   node scripts/verify-release-bundle.js <app-release.apk> [--aab <app-release.aab>] [--expect "문구"]...
 *   npm run release:verify -- <apk> [--aab <aab>]
 *   인자 없이 부르면 android/app/build/outputs 의 기본 산출물 경로를 쓴다.
 *
 * 검사(하나라도 어긋나면 exit 1)
 *   ① APK 매니페스트 versionName·versionCode(aapt dump badging) = android/app/build.gradle = package.json version
 *   ② assets/app.config(expo-constants가 읽는 설정) version = package.json version, 이전 패치 버전 문자열 0
 *   ③ assets/index.android.bundle 크기 ≥ 3MB, API 도메인 os.topcare.co.kr ≥ 1, 옛 vercel.app 0
 *   ④ 라우트 표지(workboard·consent-gate) ≥ 1 — 라우트 0개 빈 번들 차단
 *   ⑤ --expect로 준 문구가 번들에 있는지(UTF-8 또는 Hermes UTF-16LE) — 이번 소스가 실제로 들어갔는지
 *   ⑥ --aab를 주면 base/assets 의 번들·app.config에 ②~⑤를 같게 적용하고, 매니페스트에 versionName 문자열 확인
 *
 * 외부 의존 없음 — zip은 Node 내장 zlib로 직접 읽는다(unzip 유무와 무관). aapt는 Android SDK build-tools.
 * 출력에는 경로·버전·개수만 찍는다(.env 값·서명 정보 출력 0).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MIN_BUNDLE_BYTES = 3_000_000;
const API_DOMAIN = 'os.topcare.co.kr';
const FORBIDDEN_DOMAINS = ['vercel.app'];
const ROUTE_MARKERS = ['workboard', 'consent-gate'];

// ── 인자 ──
const argv = process.argv.slice(2);
let apkPath = null;
let aabPath = null;
const expects = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--aab') aabPath = argv[++i];
  else if (a === '--expect') expects.push(argv[++i]);
  else if (!apkPath) apkPath = a;
}
apkPath = path.resolve(apkPath || path.join(ROOT, 'android/app/build/outputs/apk/release/app-release.apk'));
if (aabPath) aabPath = path.resolve(aabPath);

// ── 결과 기록 ──
const results = [];
const check = (ok, label, detail) => { results.push({ ok: !!ok, label, detail }); };

// ── 기대값(소스 정본) ──
const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const gradleCode = (gradle.match(/^\s*versionCode\s+(\d+)/m) || [])[1] || null;
const gradleName = (gradle.match(/^\s*versionName\s+"([^"]+)"/m) || [])[1] || null;
const [maj, min, pat] = pkgVersion.split('.').map((n) => parseInt(n, 10));
const prevVersion = Number.isFinite(pat) && pat > 0 ? `${maj}.${min}.${pat - 1}` : null;

check(gradleName === pkgVersion, 'build.gradle versionName = package.json version', `${gradleName} / ${pkgVersion}`);

// ── zip(APK·AAB) 최소 판독기 ──
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`zip 끝 레코드 없음: ${file}`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip 중앙 디렉터리 손상');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: () => [...entries.keys()],
    get(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lnl = buf.readUInt16LE(e.localOff + 26);
      const lel = buf.readUInt16LE(e.localOff + 28);
      const start = e.localOff + 30 + lnl + lel;
      const raw = buf.subarray(start, start + e.compSize);
      if (e.method === 0) return Buffer.from(raw);
      if (e.method === 8) return zlib.inflateRawSync(raw);
      throw new Error(`지원하지 않는 압축 방식 ${e.method}: ${name}`);
    },
  };
}

const countOf = (buf, needle) => {
  const n = Buffer.isBuffer(needle) ? needle : Buffer.from(needle, 'utf8');
  let c = 0;
  for (let i = buf.indexOf(n); i >= 0; i = buf.indexOf(n, i + n.length)) c++;
  return c;
};
// Hermes 바이트코드는 비ASCII 문자열을 UTF-16LE로 저장한다 — 두 인코딩을 모두 센다.
const countText = (buf, text) => countOf(buf, Buffer.from(text, 'utf8')) + countOf(buf, Buffer.from(text, 'utf16le'));

function checkAssets(zip, prefix, tag) {
  // app.config — expo-constants의 expoConfig 원천(앱 버전 표기 폴백이 읽던 값)
  const cfgBuf = zip.get(`${prefix}assets/app.config`);
  check(!!cfgBuf, `[${tag}] ${prefix}assets/app.config 존재`, cfgBuf ? `${cfgBuf.length} bytes` : '없음');
  if (cfgBuf) {
    let cfgVersion = null;
    try { cfgVersion = JSON.parse(cfgBuf.toString('utf8')).version ?? null; } catch { /* 아래에서 실패로 기록 */ }
    check(cfgVersion === pkgVersion, `[${tag}] app.config version = package.json version`, `${cfgVersion} / ${pkgVersion}`);
    if (prevVersion) {
      const prevHits = countOf(cfgBuf, `"${prevVersion}"`);
      check(prevHits === 0, `[${tag}] app.config에 이전 버전 "${prevVersion}" 0건`, `${prevHits}건`);
    }
  }
  const bundle = zip.get(`${prefix}assets/index.android.bundle`);
  check(!!bundle, `[${tag}] ${prefix}assets/index.android.bundle 존재`, bundle ? '' : '없음');
  if (!bundle) return;
  check(bundle.length >= MIN_BUNDLE_BYTES, `[${tag}] 번들 크기 ≥ ${MIN_BUNDLE_BYTES.toLocaleString()} bytes(라우트 0개 빈 번들 차단)`, `${bundle.length.toLocaleString()} bytes`);
  const apiHits = countOf(bundle, API_DOMAIN);
  check(apiHits >= 1, `[${tag}] 번들에 API 도메인 ${API_DOMAIN} ≥ 1`, `${apiHits}건`);
  for (const d of FORBIDDEN_DOMAINS) {
    const hits = countOf(bundle, d);
    check(hits === 0, `[${tag}] 번들에 옛 도메인 ${d} 0건`, `${hits}건`);
  }
  for (const m of ROUTE_MARKERS) {
    const hits = countOf(bundle, m);
    check(hits >= 1, `[${tag}] 번들에 라우트 표지 '${m}' ≥ 1`, `${hits}건`);
  }
  if (prevVersion) {
    const hits = countOf(bundle, `v${prevVersion}`);
    check(hits === 0, `[${tag}] 번들에 이전 버전 문자열 "v${prevVersion}" 0건`, `${hits}건`);
  }
  for (const t of expects) {
    const hits = countText(bundle, t);
    check(hits >= 1, `[${tag}] 번들에 이번 소스 문구 포함: "${t}"`, `${hits}건`);
  }
}

// ── aapt 위치: ANDROID_HOME/ANDROID_SDK_ROOT → android/local.properties sdk.dir ──
function findAapt() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  const lp = path.join(ROOT, 'android/local.properties');
  if (fs.existsSync(lp)) {
    const m = fs.readFileSync(lp, 'utf8').match(/^sdk\.dir=(.+)$/m);
    if (m) candidates.push(m[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':'));
  }
  for (const sdk of candidates.filter(Boolean)) {
    const bt = path.join(sdk, 'build-tools');
    if (!fs.existsSync(bt)) continue;
    const versions = fs.readdirSync(bt).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      for (const exe of ['aapt.exe', 'aapt', 'aapt2.exe', 'aapt2']) {
        const f = path.join(bt, v, exe);
        if (fs.existsSync(f)) return f;
      }
    }
  }
  return null;
}

// ── 실행 ──
console.log('워커앱 릴리스 산출물 검증');
console.log(`  기대: package.json ${pkgVersion} · build.gradle versionName ${gradleName} versionCode ${gradleCode}${prevVersion ? ` · 이전 패치 ${prevVersion} 금지` : ''}`);
console.log(`  APK : ${apkPath}`);
if (aabPath) console.log(`  AAB : ${aabPath}`);

if (!fs.existsSync(apkPath)) {
  check(false, 'APK 파일 존재', apkPath);
} else {
  const aapt = findAapt();
  if (!aapt) {
    check(false, 'aapt(Android SDK build-tools) 찾기', 'ANDROID_HOME 또는 android/local.properties sdk.dir 확인');
  } else {
    let badging = '';
    try {
      badging = execFileSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { badging = e.stdout ? String(e.stdout) : ''; }
    const apkCode = (badging.match(/versionCode='(\d+)'/) || [])[1] || null;
    const apkName = (badging.match(/versionName='([^']+)'/) || [])[1] || null;
    check(apkCode === gradleCode, 'APK versionCode = build.gradle versionCode', `${apkCode} / ${gradleCode}`);
    check(apkName === gradleName, 'APK versionName = build.gradle versionName', `${apkName} / ${gradleName}`);
  }
  checkAssets(readZip(apkPath), '', 'APK');
}

if (aabPath) {
  if (!fs.existsSync(aabPath)) {
    check(false, 'AAB 파일 존재', aabPath);
  } else {
    const aab = readZip(aabPath);
    checkAssets(aab, 'base/', 'AAB');
    // AAB 매니페스트는 protobuf — versionName 문자열이 그대로 들어 있는지만 본다(versionCode는 정수라 생략).
    const man = aab.get('base/manifest/AndroidManifest.xml');
    const nameHits = man ? countOf(man, gradleName || '') : 0;
    check(!!man && nameHits >= 1, `[AAB] 매니페스트에 versionName "${gradleName}" 문자열`, man ? `${nameHits}건` : '매니페스트 없음');
  }
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(failed === 0
  ? `\n결과: 통과 (${results.length}항목) — releases 복사 가능`
  : `\n결과: 실패 ${failed}/${results.length}항목 — releases에 복사하지 말 것`);
process.exit(failed === 0 ? 0 : 1);
