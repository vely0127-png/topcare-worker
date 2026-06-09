/**
 * 내 근무 탭 - 오늘 배정 근무 및 담당 입주자 목록
 */
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const TODAY = new Date();

// Mock data
const MY_SHIFT = {
  type: '오전 근무',
  time: '06:00 - 14:00',
  ward: '2병동',
};

const ASSIGNED_RESIDENTS = [
  { id: '1', name: '김순자', room: '102호', risk: 'HIGH', tasks: 3 },
  { id: '2', name: '이영철', room: '205호', risk: 'MEDIUM', tasks: 1 },
  { id: '3', name: '박정희', room: '301호', risk: 'HIGH', tasks: 4 },
  { id: '4', name: '최영순', room: '104호', risk: 'LOW', tasks: 2 },
];

const TODAY_TASKS = [
  { id: '1', title: '김순자 - 오전 목욕 케어', time: '08:00', done: true },
  { id: '2', title: '이영철 - 혈압 측정', time: '09:00', done: true },
  { id: '3', title: '박정희 - 약물 투여 확인', time: '10:00', done: false },
  { id: '4', title: '최영순 - 식사 보조', time: '12:00', done: false },
];

export default function MyScheduleScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Today's Date */}
        <View style={styles.dateCard}>
          <Text style={styles.dateText}>
            {format(TODAY, 'yyyy년 M월 d일 EEEE', { locale: ko })}
          </Text>
          <View style={styles.shiftBadge}>
            <Text style={styles.shiftType}>{MY_SHIFT.type}</Text>
            <Text style={styles.shiftTime}>{MY_SHIFT.time} · {MY_SHIFT.ward}</Text>
          </View>
        </View>

        {/* Today's Tasks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>오늘의 업무</Text>
          {TODAY_TASKS.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.taskItem, task.done && styles.taskDone]}
            >
              <View style={[styles.taskCheck, task.done && styles.taskCheckDone]}>
                {task.done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.taskContent}>
                <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]}>
                  {task.title}
                </Text>
                <Text style={styles.taskTime}>{task.time}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Assigned Residents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>담당 입주자 ({ASSIGNED_RESIDENTS.length}명)</Text>
          {ASSIGNED_RESIDENTS.map((resident) => (
            <TouchableOpacity key={resident.id} style={styles.residentCard}>
              <View style={styles.residentAvatar}>
                <Text style={styles.avatarText}>{resident.name[0]}</Text>
              </View>
              <View style={styles.residentInfo}>
                <Text style={styles.residentName}>{resident.name}</Text>
                <Text style={styles.residentRoom}>{resident.room}</Text>
              </View>
              <View style={styles.residentRight}>
                <RiskBadge level={resident.risk} />
                <Text style={styles.taskCount}>{resident.tasks}개 업무</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function RiskBadge({ level }: { level: string }) {
  const colors = {
    HIGH: { bg: '#FEE2E2', text: '#DC2626' },
    MEDIUM: { bg: '#FEF3C7', text: '#D97706' },
    LOW: { bg: '#DCFCE7', text: '#16A34A' },
  }[level] || { bg: '#F3F4F6', text: '#6B7280' };

  return (
    <View style={[styles.riskBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.riskText, { color: colors.text }]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, gap: 16 },
  dateCard: {
    backgroundColor: '#1A5276',
    borderRadius: 12,
    padding: 16,
  },
  dateText: { color: '#fff', fontSize: 14, opacity: 0.8 },
  shiftBadge: { marginTop: 8 },
  shiftType: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  shiftTime: { color: '#fff', fontSize: 14, opacity: 0.8, marginTop: 2 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 56,
  },
  taskDone: { opacity: 0.6 },
  taskCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  taskCheckDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  taskTime: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  residentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 64,
  },
  residentAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: 'bold', color: '#1D4ED8' },
  residentInfo: { flex: 1 },
  residentName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  residentRoom: { fontSize: 13, color: '#6B7280' },
  residentRight: { alignItems: 'flex-end', gap: 4 },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  riskText: { fontSize: 11, fontWeight: '700' },
  taskCount: { fontSize: 11, color: '#6B7280' },
});
