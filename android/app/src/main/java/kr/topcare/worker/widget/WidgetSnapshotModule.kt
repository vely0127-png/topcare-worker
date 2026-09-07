package kr.topcare.worker.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONException
import org.json.JSONObject

/**
 * RN <-> 홈 위젯 브리지 (ADR-001 §4-1, §4-4).
 *
 * 이 모듈은 스냅샷을 SharedPreferences에 쓰고 지우는 것만 한다.
 * 위젯은 서버에 쓰지 않고 네트워크 호출도 하지 않는다 — 렌더링에 필요한
 * 모든 판단(잠금 판정·마스킹·노화)은 [TopCareWidgetProvider]가 읽기 시점에 한다.
 *
 * RN 쪽 호출: NativeModules.WidgetSnapshot.write(json) / .clear()
 * (JS 래퍼는 lib/widget/native.ts)
 */
class WidgetSnapshotModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val PREFS_NAME = "topcare_widget"
    const val KEY_SNAPSHOT = "snapshot"
    const val KEY_SAVED_AT = "savedAt"
  }

  override fun getName(): String = "WidgetSnapshot"

  @ReactMethod
  fun write(json: String, promise: Promise) {
    try {
      validateSnapshot(json)
    } catch (e: JSONException) {
      // 개발규칙 §7 입력 검증: 손상된 스냅샷은 저장하지 않는다.
      // (위젯 쪽에서도 파싱 실패 시 빈 상태로 폴백하는 이중 방어 — TopCareWidgetProvider.parseSnapshot)
      promise.reject("E_INVALID_SNAPSHOT", "스냅샷 JSON 형식이 올바르지 않습니다: ${e.message}", e)
      return
    }

    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit()
        .putString(KEY_SNAPSHOT, json)
        .putLong(KEY_SAVED_AT, System.currentTimeMillis())
        .apply()
      TopCareWidgetProvider.updateAllWidgets(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_WRITE_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().clear().apply()
      TopCareWidgetProvider.updateAllWidgets(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_CLEAR_FAILED", e.message, e)
    }
  }

  /**
   * [홈 화면에 위젯 추가] OS 요청(lib/widget/pin.ts가 이미 이 메서드명을 호출하도록
   * 작성돼 있었다 — W2 팀이 미리 맞춰 둔 통합 지점). Android 8(API 26) 미만이거나
   * 런처가 지원하지 않으면 false. 반환값은 "요청 접수 여부"일 뿐, 사용자가 시스템
   * 다이얼로그에서 실제로 추가했는지는 알려주지 않는다(OS 표준 동작).
   */
  @ReactMethod
  fun requestPin(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(false)
        return
      }
      val context = reactApplicationContext
      val appWidgetManager = AppWidgetManager.getInstance(context)
      if (!appWidgetManager.isRequestPinAppWidgetSupported) {
        promise.resolve(false)
        return
      }
      val provider = ComponentName(context, TopCareWidgetProvider::class.java)
      val accepted = appWidgetManager.requestPinAppWidget(provider, null, null)
      promise.resolve(accepted)
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  /**
   * 최소 스키마 검증만 한다(필드 존재 확인). 타입까지 엄격히 검증하면
   * 스키마가 조금만 바뀌어도 write 자체가 막혀 위젯이 "로그인 필요"로
   * 굳어버릴 위험이 있어, 상세 파싱/방어는 위젯 렌더 쪽(이중 방어)에 둔다.
   */
  @Throws(JSONException::class)
  private fun validateSnapshot(json: String) {
    val obj = JSONObject(json)
    if (!obj.has("snapshotAtKst") || !obj.has("loggedIn")) {
      throw JSONException("필수 필드(snapshotAtKst, loggedIn) 누락")
    }
  }
}
