package kr.topcare.worker.widget

import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews
import kr.topcare.worker.R
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone

/**
 * 홈 위젯 v1(표시형) — ADR-001, 명세 Part A.
 *
 * 위젯은 읽기 전용이다: 서버 호출 없음, 쓰기 없음. [WidgetSnapshotModule]이
 * SharedPreferences(topcare_widget)에 저장한 스냅샷만 읽어 그린다.
 *
 * 렌더 시점마다 하는 일 (A2~A5):
 *  1. 스냅샷 파싱(손상 시 빈 상태)
 *  2. 잠금 판정(KeyguardManager) → 실패 시 마스킹 폴백
 *  3. 노화 계산(now - snapshotAtKst) → 15분 회색 / 60분 숨김
 *  4. 위젯 크기(2x2/4x2)에 따라 레이아웃 선택
 *  5. 각 행 PendingIntent = 딥링크(ID만, FLAG_IMMUTABLE)
 */
class TopCareWidgetProvider : AppWidgetProvider() {

  companion object {
    private const val SCHEME = "topcare-worker"
    private const val AGE_STALE_MS = 15 * 60 * 1000L
    private const val AGE_HIDDEN_MS = 60 * 60 * 1000L

    /** 이보다 minWidth(dp)가 작으면 2x2(건수만) 레이아웃을 쓴다. */
    private const val SMALL_WIDTH_THRESHOLD_DP = 180

    const val ACTION_REFRESH = "kr.topcare.worker.widget.ACTION_REFRESH"

    /** [WidgetSnapshotModule].write/clear 후 즉시 호출 — 주 갱신 경로(ADR §4-2 ①). */
    fun updateAllWidgets(context: Context) {
      val mgr = AppWidgetManager.getInstance(context)
      val ids = mgr.getAppWidgetIds(ComponentName(context, TopCareWidgetProvider::class.java))
      renderAll(context, mgr, ids)
    }

    private fun renderAll(context: Context, mgr: AppWidgetManager, ids: IntArray) {
      for (id in ids) {
        mgr.updateAppWidget(id, renderWidget(context, mgr, id))
      }
    }

    private fun renderWidget(context: Context, mgr: AppWidgetManager, appWidgetId: Int): RemoteViews {
      val options = mgr.getAppWidgetOptions(appWidgetId)
      val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, Int.MAX_VALUE)
      val prefs = context.getSharedPreferences(WidgetSnapshotModule.PREFS_NAME, Context.MODE_PRIVATE)
      val raw = prefs.getString(WidgetSnapshotModule.KEY_SNAPSHOT, null)
      val snap = parseSnapshot(raw)

      return if (minWidthDp < SMALL_WIDTH_THRESHOLD_DP) {
        buildSmallView(context, appWidgetId, snap)
      } else {
        buildLargeView(context, appWidgetId, snap)
      }
    }

    // ── 스냅샷 파싱 ──────────────────────────────────────────────

    private data class ParsedSnapshot(
      val loggedIn: Boolean,
      val displayLevel: String,
      val alerts: JSONArray,
      val services: JSONArray,
      val serviceBlockLabel: String,
      val serviceDone: Int,
      val serviceTotal: Int,
      val directivesPending: Int,
      val queuePending: Int,
      val ageMillis: Long?,
      val hhmm: String
    )

    /** 손상되었거나 없는 스냅샷은 null(=위젯이 "로그인 필요"/빈 상태로 그림). */
    private fun parseSnapshot(raw: String?): ParsedSnapshot? {
      if (raw.isNullOrBlank()) return null
      return try {
        val obj = JSONObject(raw)
        val snapshotAtKst = obj.getString("snapshotAtKst")
        val serviceCounts = obj.optJSONObject("serviceCounts")
        ParsedSnapshot(
          loggedIn = obj.optBoolean("loggedIn", false),
          displayLevel = obj.optString("displayLevel", "roomInitial"),
          alerts = obj.optJSONArray("alerts") ?: JSONArray(),
          services = obj.optJSONArray("services") ?: JSONArray(),
          serviceBlockLabel = serviceCounts?.optString("block", "") ?: "",
          serviceDone = serviceCounts?.optInt("done", 0) ?: 0,
          serviceTotal = serviceCounts?.optInt("total", 0) ?: 0,
          directivesPending = obj.optInt("directivesPending", 0),
          queuePending = obj.optInt("queuePending", 0),
          ageMillis = snapshotAgeMillis(snapshotAtKst),
          hhmm = formatHHMM(snapshotAtKst)
        )
      } catch (e: JSONException) {
        null
      }
    }

    /**
     * snapshotAtKst("YYYY-MM-DDTHH:MM:SS+09:00", lib/utils/date.ts getKSTNowWallClockIso와 동일
     * 규약)를 실제 경과 시각(ms)으로 환산한다.
     *
     * java.time(OffsetDateTime 등)은 minSdk 23 + desugaring 미설정 상태라 쓰지 않는다
     * (API 26 미만 기기에서 NoClassDefFoundError 위험). 대신 문자열을 직접 잘라
     * UTC 기준 Calendar로 만들고 KST 오프셋(+9h)만큼 빼서 진짜 UTC 계기(epoch)를 구한다 —
     * 기기 타임존 설정에 의존하지 않는다(=기기가 KST가 아니어도 정확).
     */
    private fun snapshotAgeMillis(snapshotAtKst: String): Long? {
      return try {
        val y = snapshotAtKst.substring(0, 4).toInt()
        val mo = snapshotAtKst.substring(5, 7).toInt()
        val d = snapshotAtKst.substring(8, 10).toInt()
        val h = snapshotAtKst.substring(11, 13).toInt()
        val mi = snapshotAtKst.substring(14, 16).toInt()
        val s = snapshotAtKst.substring(17, 19).toInt()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.clear()
        cal.set(y, mo - 1, d, h, mi, s)
        val kstWallClockAsUtcMillis = cal.timeInMillis
        val trueUtcInstantMillis = kstWallClockAsUtcMillis - 9L * 60 * 60 * 1000
        System.currentTimeMillis() - trueUtcInstantMillis
      } catch (e: Exception) {
        null
      }
    }

    /**
     * "HH:MM 기준" 표기는 기기 타임존으로 재변환하지 않고 스냅샷 문자열의
     * HH:MM을 그대로 잘라 쓴다(명세 A5) — 기기 시계가 KST가 아닐 수 있어서다.
     */
    private fun formatHHMM(iso: String?): String {
      if (iso == null || iso.length < 16) return "--:--"
      return try {
        iso.substring(11, 16)
      } catch (e: Exception) {
        "--:--"
      }
    }

    private fun JSONObject.optStringOrNull(name: String): String? =
      if (has(name) && !isNull(name)) optString(name) else null

    /**
     * 잠금 판정(A3). 판정 불가(서비스 없음/예외) → 마스킹 쪽으로 폴백(=locked 취급).
     */
    private fun isDeviceLocked(context: Context): Boolean {
      return try {
        val km = context.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
          ?: return true
        km.isKeyguardLocked || km.isDeviceLocked
      } catch (e: Exception) {
        true
      }
    }

    /**
     * 행 표시 라벨(A3 2단 규칙 + lib/widget/snapshot-builder.ts 실제 스키마).
     * displayLevel == 'count'일 때 앱(snapshot-builder.ts buildAlertRow/buildServiceRow)이
     * roomNo·initial 필드 자체를 만들지 않는다(빈 문자열이 아니라 부재) — 위젯이 마스킹을
     * "잊어도" 새어나갈 필드가 없다. 그래서 이 함수는 null(=식별 정보 없음, kind/유형만
     * 표시)도 반환할 수 있다.
     * - 잠금 또는 displayLevel != 'name' 또는 name 없음 → "호실+이니셜"(있으면)
     * - 해제 + displayLevel == 'name' + name 존재 → 성명
     * - roomNo·initial 둘 다 없음(count 모드 등) → null
     */
    private fun displayLabel(locked: Boolean, displayLevel: String, roomNo: String?, initial: String?, name: String?): String? {
      if (!locked && displayLevel == "name" && !name.isNullOrBlank()) return name
      if (roomNo.isNullOrBlank() && initial.isNullOrBlank()) return null
      return if (initial.isNullOrBlank()) "${roomNo}호" else "${roomNo}호 $initial"
    }

    private fun deepLinkPendingIntent(context: Context, requestCode: Int, uri: String): PendingIntent {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        setPackage(context.packageName)
      }
      return PendingIntent.getActivity(
        context, requestCode, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    // ── 4x2 기본 레이아웃 ────────────────────────────────────────

    private fun buildLargeView(context: Context, appWidgetId: Int, snap: ParsedSnapshot?): RemoteViews {
      val rv = RemoteViews(context.packageName, R.layout.widget_topcare)
      val base = appWidgetId * 100

      rv.setOnClickPendingIntent(
        R.id.btn_open_app,
        deepLinkPendingIntent(context, base + 1, "$SCHEME://workboard?block=now&entry=widget")
      )

      if (snap == null || !snap.loggedIn) {
        rv.setViewVisibility(R.id.widget_login_required, View.VISIBLE)
        rv.setViewVisibility(R.id.widget_content, View.GONE)
        rv.setTextViewText(R.id.widget_login_required, context.getString(R.string.widget_login_required))
        rv.setTextViewText(R.id.widget_freshness, "")
        rv.setViewVisibility(R.id.queue_badge, View.GONE)
        return rv
      }

      val hidden = snap.ageMillis != null && snap.ageMillis!! > AGE_HIDDEN_MS
      val stale = snap.ageMillis != null && snap.ageMillis!! > AGE_STALE_MS

      rv.setViewVisibility(R.id.widget_login_required, View.GONE)
      rv.setViewVisibility(R.id.widget_content, if (hidden) View.GONE else View.VISIBLE)
      rv.setTextViewText(
        R.id.widget_freshness,
        when {
          hidden -> context.getString(R.string.widget_refresh_in_app)
          stale -> context.getString(R.string.widget_stale_prefix) + " · ${snap.hhmm} 기준"
          else -> "${snap.hhmm} 기준"
        }
      )
      rv.setInt(
        R.id.widget_root, "setBackgroundResource",
        if (stale) R.drawable.widget_bg_stale else R.drawable.widget_bg_normal
      )

      if (hidden) {
        rv.setViewVisibility(R.id.queue_badge, View.GONE)
        return rv
      }

      val locked = isDeviceLocked(context)

      // 경고
      rv.setOnClickPendingIntent(
        R.id.header_alerts,
        deepLinkPendingIntent(context, base + 2, "$SCHEME://alerts?entry=widget")
      )
      val alertRowIds = intArrayOf(R.id.alert_row_1, R.id.alert_row_2, R.id.alert_row_3)
      for (i in alertRowIds.indices) {
        val rowId = alertRowIds[i]
        if (i < snap.alerts.length()) {
          val a = snap.alerts.optJSONObject(i)
          if (a == null) {
            rv.setViewVisibility(rowId, View.GONE)
            continue
          }
          val id = a.optString("id")
          val roomNo = a.optStringOrNull("roomNo")
          val initial = a.optStringOrNull("initial")
          val kind = a.optString("kind")
          val name = a.optStringOrNull("name")
          val label = displayLabel(locked, snap.displayLevel, roomNo, initial, name)
          rv.setTextViewText(rowId, if (label != null) "$label — $kind" else kind)
          rv.setViewVisibility(rowId, View.VISIBLE)
          rv.setOnClickPendingIntent(
            rowId,
            deepLinkPendingIntent(context, base + 10 + i, "$SCHEME://alerts/$id?entry=widget")
          )
        } else {
          rv.setViewVisibility(rowId, View.GONE)
        }
      }

      // 지금 할 서비스
      rv.setOnClickPendingIntent(
        R.id.header_services,
        deepLinkPendingIntent(context, base + 3, "$SCHEME://workboard?block=now&entry=widget")
      )
      rv.setTextViewText(
        R.id.service_progress,
        (if (snap.serviceBlockLabel.isNotBlank()) "${snap.serviceBlockLabel} " else "") +
          "완료 ${snap.serviceDone}/${snap.serviceTotal}"
      )
      val serviceRowIds = intArrayOf(R.id.service_row_1, R.id.service_row_2, R.id.service_row_3)
      for (i in serviceRowIds.indices) {
        val rowId = serviceRowIds[i]
        if (i < snap.services.length()) {
          val s = snap.services.optJSONObject(i)
          if (s == null) {
            rv.setViewVisibility(rowId, View.GONE)
            continue
          }
          val scheduleId = s.optString("scheduleId")
          val residentId = s.optString("residentId")
          val roomNo = s.optStringOrNull("roomNo")
          val initial = s.optStringOrNull("initial")
          val serviceType = s.optString("serviceType")
          val plannedAtKst = s.optStringOrNull("plannedAtKst")
          val name = s.optStringOrNull("name")
          // delayed = 이전 블록에서 넘어온 미완료(A2 "지연 배지") — snapshot-builder.ts가 채운다.
          val delayed = s.optBoolean("delayed", false)
          val label = displayLabel(locked, snap.displayLevel, roomNo, initial, name)
          val baseText = if (label != null) "$label — $serviceType" else serviceType
          val prefix = if (delayed) "[지연] " else ""
          rv.setTextViewText(rowId, "$prefix$baseText (${formatHHMM(plannedAtKst)})")
          rv.setViewVisibility(rowId, View.VISIBLE)
          rv.setOnClickPendingIntent(
            rowId,
            deepLinkPendingIntent(
              context, base + 20 + i,
              "$SCHEME://records/$residentId?scheduleId=$scheduleId&entry=widget"
            )
          )
        } else {
          rv.setViewVisibility(rowId, View.GONE)
        }
      }

      // 업무 지시(건수만)
      rv.setTextViewText(R.id.row_directives, "업무 지시 미완료 ${snap.directivesPending}건")
      rv.setOnClickPendingIntent(
        R.id.row_directives,
        deepLinkPendingIntent(context, base + 4, "$SCHEME://todos?entry=widget")
      )

      // 미전송 큐 배지(A5)
      if (snap.queuePending > 0) {
        rv.setViewVisibility(R.id.queue_badge, View.VISIBLE)
        rv.setTextViewText(R.id.queue_badge, "미전송 ${snap.queuePending}건")
      } else {
        rv.setViewVisibility(R.id.queue_badge, View.GONE)
      }

      return rv
    }

    // ── 2x2 소형 레이아웃(건수만) ─────────────────────────────────

    private fun buildSmallView(context: Context, appWidgetId: Int, snap: ParsedSnapshot?): RemoteViews {
      val rv = RemoteViews(context.packageName, R.layout.widget_topcare_small)
      val base = appWidgetId * 100

      rv.setOnClickPendingIntent(
        R.id.widget_root_small,
        deepLinkPendingIntent(context, base + 1, "$SCHEME://workboard?block=now&entry=widget")
      )

      if (snap == null || !snap.loggedIn) {
        rv.setViewVisibility(R.id.widget_login_required_small, View.VISIBLE)
        rv.setViewVisibility(R.id.widget_content_small, View.GONE)
        rv.setTextViewText(R.id.widget_login_required_small, context.getString(R.string.widget_login_required))
        return rv
      }

      val hidden = snap.ageMillis != null && snap.ageMillis!! > AGE_HIDDEN_MS
      val stale = snap.ageMillis != null && snap.ageMillis!! > AGE_STALE_MS

      rv.setViewVisibility(R.id.widget_login_required_small, View.GONE)
      rv.setViewVisibility(R.id.widget_content_small, if (hidden) View.GONE else View.VISIBLE)
      rv.setTextViewText(
        R.id.widget_freshness_small,
        when {
          hidden -> context.getString(R.string.widget_refresh_in_app)
          stale -> "${snap.hhmm}·" + context.getString(R.string.widget_stale_prefix)
          else -> "${snap.hhmm} 기준"
        }
      )
      rv.setInt(
        R.id.widget_root_small, "setBackgroundResource",
        if (stale) R.drawable.widget_bg_stale else R.drawable.widget_bg_normal
      )

      if (!hidden) {
        // 주의: alerts 배열은 앱이 이미 표시용으로 최대 3건까지 잘라 스냅샷에
        // 담았을 가능성이 높다(A2). 그 경우 이 건수는 실제 미해결 경고 총량이
        // 아니라 "스냅샷에 포함된 건수"다 — 정확한 총량이 필요하면 스키마에
        // alertsTotal 같은 필드를 추가하는 게 맞고, 이건 RN/PD 쪽 확인이 필요한
        // 설계 결정이라 이 팀에서 임의로 필드를 늘리지 않았다.
        rv.setTextViewText(R.id.small_alerts_count, "경고 ${snap.alerts.length()}건")
        rv.setTextViewText(R.id.small_services_count, "서비스 ${snap.serviceTotal - snap.serviceDone}건")
        rv.setTextViewText(R.id.small_directives_count, "지시 ${snap.directivesPending}건")

        rv.setOnClickPendingIntent(
          R.id.small_alerts_count,
          deepLinkPendingIntent(context, base + 2, "$SCHEME://alerts?entry=widget")
        )
        rv.setOnClickPendingIntent(
          R.id.small_services_count,
          deepLinkPendingIntent(context, base + 3, "$SCHEME://workboard?block=now&entry=widget")
        )
        rv.setOnClickPendingIntent(
          R.id.small_directives_count,
          deepLinkPendingIntent(context, base + 4, "$SCHEME://todos?entry=widget")
        )
      }

      return rv
    }

    // ── 갱신 알람(WorkManager 부재 → AlarmManager 대체, ADR §4-2) ───

    private fun refreshPendingIntent(context: Context): PendingIntent {
      val intent = Intent(context, TopCareWidgetProvider::class.java).apply { action = ACTION_REFRESH }
      return PendingIntent.getBroadcast(
        context, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    /**
     * 15분 비정확 반복(SCHEDULE_EXACT_ALARM 권한 요구 안 함). 위젯이 최소 1개
     * 남아있는 동안만 유지(onEnabled/onUpdate에서 재등록, onDisabled에서 취소).
     * 이 알람은 재부팅 후 자동 복원되지 않는다(RECEIVE_BOOT_COMPLETED 권한을
     * 새로 추가하지 않기로 함 — 최소 권한 원칙). 대신 res/xml/widget_topcare_info.xml의
     * updatePeriodMillis(30분, 시스템이 재부팅에도 보장)가 백스톱 역할을 하고,
     * 앱이 스냅샷을 다시 쓸 때마다의 즉시 갱신이 주 경로라 노화 표기가 크게
     * 어긋나지 않는다.
     */
    private fun scheduleRefreshAlarm(context: Context) {
      try {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        am.setInexactRepeating(
          AlarmManager.ELAPSED_REALTIME,
          SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
          AlarmManager.INTERVAL_FIFTEEN_MINUTES,
          refreshPendingIntent(context)
        )
      } catch (e: Exception) {
        // 알람 등록 실패해도 치명적이지 않음(위 주석의 백스톱들이 남아있음).
      }
    }

    private fun cancelRefreshAlarm(context: Context) {
      try {
        val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        am.cancel(refreshPendingIntent(context))
      } catch (e: Exception) {
        // 무시 — 마지막 위젯 제거 시점의 정리 실패는 치명적이지 않음.
      }
    }
  }

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    renderAll(context, appWidgetManager, appWidgetIds)
    scheduleRefreshAlarm(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    appWidgetManager.updateAppWidget(appWidgetId, renderWidget(context, appWidgetManager, appWidgetId))
  }

  override fun onEnabled(context: Context) {
    scheduleRefreshAlarm(context)
  }

  override fun onDisabled(context: Context) {
    cancelRefreshAlarm(context)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH) {
      updateAllWidgets(context)
    }
  }
}
