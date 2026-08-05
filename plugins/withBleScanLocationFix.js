/**
 * BLUETOOTH_SCAN의 neverForLocation 플래그 제거 (2026-08-05)
 *
 * react-native-ble-plx 라이브러리 매니페스트가 usesPermissionFlags="neverForLocation"을
 * 병합시키는데, 이 플래그가 있으면 Android가 iBeacon/Eddystone 광고를 앱에 전달하지 않는다
 * (위치 파생 방지 정책). TopCare 비콘은 위치 파악이 목적이므로 반드시 제거해야 한다.
 * — 실증: nRF에는 HolyIOT가 -24dBm으로 보이는데 앱은 iBeacon 패킷만 전부 미수신했던 원인.
 *
 * prebuild 때마다 AndroidManifest에 tools:remove를 다시 주입해 수동 수정 유실을 방지한다.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBleScanLocationFix(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const perms = manifest['uses-permission'] ?? [];
    for (const p of perms) {
      if (p.$?.['android:name'] === 'android.permission.BLUETOOTH_SCAN') {
        delete p.$['android:usesPermissionFlags'];
        p.$['tools:remove'] = 'android:usesPermissionFlags';
      }
    }
    return cfg;
  });
};
