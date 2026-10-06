// 워커앱 런처 아이콘 교체 — 2026-10-07 대표 "앱 아이콘으로 이거 업데이트"(디자인정리 설계 G-70).
// 사용(topcare-worker 루트): node scripts/set-launcher-icon.js <원본 PNG 경로>
//  - android/app/src/main/res/mipmap-*/ic_launcher.png(정사각)·ic_launcher_round.png(원형 마스크)을 밀도별로 다시 만든다.
//  - 라이브러리는 expo가 이미 끌어오는 jimp-compact만 쓴다(새 의존성 0). iOS 프로젝트는 없다(ios/ 폴더에 xcassets 없음).
//  - 원본은 정사각 PNG여야 하며 1024 권장(501도 동작 — xxxhdpi 192까지만 쓰므로 축소만 일어난다).
const path = require('path');
const fs = require('fs');
const Jimp = require('jimp-compact');

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('사용: node scripts/set-launcher-icon.js <원본 PNG>'); process.exit(1); }

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const resRoot = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

(async () => {
  const base = await Jimp.read(src);
  if (base.bitmap.width !== base.bitmap.height) { console.error(`정사각이 아님: ${base.bitmap.width}x${base.bitmap.height}`); process.exit(1); }
  console.log(`원본 ${base.bitmap.width}x${base.bitmap.height}`);
  for (const [density, size] of Object.entries(DENSITIES)) {
    const dir = path.join(resRoot, `mipmap-${density}`);
    if (!fs.existsSync(dir)) { console.warn(`건너뜀(폴더 없음): ${dir}`); continue; }
    const square = base.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
    await square.writeAsync(path.join(dir, 'ic_launcher.png'));
    const round = base.clone().resize(size, size, Jimp.RESIZE_BICUBIC).circle();
    await round.writeAsync(path.join(dir, 'ic_launcher_round.png'));
    console.log(`mipmap-${density}: ic_launcher ${size}x${size} · ic_launcher_round ${size}x${size}(원형)`);
  }
})().catch((e) => { console.error('실패:', e.message); process.exit(1); });
