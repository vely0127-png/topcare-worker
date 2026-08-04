/**
 * 비콘 등록 화면 (2026-08-05) — workeradmin 전용.
 * 비콘의 QR을 스캔(또는 수동 입력)하고 호실을 선택해 서버 등록부(beacon)에 등록한다.
 * 권한: 관리자 또는 웹 설정 > 비콘에서 지정된 '비콘 관리자' (GET /api/beacons?permission=1).
 * 위치별 인물(입소자) 배정·수정은 웹 설정 > 비콘 탭에서.
 */
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { apiFetch } from '@/lib/api/client';
import { syncRegistryFromServer } from '@/lib/hooks/useBeaconProximity';

interface RoomOpt { id: string; number: string; floor?: number | null }
interface BeaconRow {
  id: string; beaconId: string; label: string | null; isActive: boolean;
  room: { number: string } | null;
  residents: { id: string; name: string }[];
}

export default function BeaconRegisterScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // 근접 화면에서 감지된 미등록 비콘의 식별자를 프리필 (QR값≠전파 식별자 문제의 현장 해법)
  const params = useLocalSearchParams<{ uuid?: string }>();
  const [beaconId, setBeaconId] = useState(typeof params.uuid === 'string' ? params.uuid : '');
  const [roomId, setRoomId] = useState('');
  const [label, setLabel] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [camGranted, setCamGranted] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const permission = useQuery({
    queryKey: ['beacon-permission'],
    queryFn: () => apiFetch<{ canRegister: boolean }>('/api/beacons?permission=1'),
  });
  const rooms = useQuery({
    queryKey: ['rooms-for-beacon'],
    queryFn: () => apiFetch<RoomOpt[]>('/api/settings/rooms'),
  });
  const beacons = useQuery({
    queryKey: ['beacons'],
    queryFn: () => apiFetch<BeaconRow[]>('/api/beacons'),
  });

  useEffect(() => {
    if (!scanOpen) return;
    void (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setCamGranted(status === 'granted');
    })();
  }, [scanOpen]);

  async function submit() {
    if (!beaconId.trim()) { Alert.alert('입력 필요', '비콘 QR을 스캔하거나 ID를 입력해주세요'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/api/beacons', {
        method: 'POST',
        body: { beaconId: beaconId.trim(), roomId: roomId || undefined, label: label.trim() || undefined },
      });
      Alert.alert('등록 완료', `비콘이 등록되었습니다${roomId ? '' : ' (공용부 — 호실은 웹에서 지정 가능)'}`);
      setBeaconId(''); setLabel(''); setRoomId('');
      await queryClient.invalidateQueries({ queryKey: ['beacons'] });
      await syncRegistryFromServer(); // 스캔 레지스트리 즉시 반영 (재시작 불필요)
    } catch (e) {
      Alert.alert('등록 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해주세요');
    } finally {
      setSubmitting(false);
    }
  }

  if (permission.isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#1A5276" /></View>;
  }
  if (!permission.data?.canRegister) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <MaterialCommunityIcons name="shield-lock-outline" size={40} color="#94a3b8" />
          <Text style={styles.deniedTitle}>비콘 등록 권한이 없습니다</Text>
          <Text style={styles.deniedText}>관리자에게 요청하세요 — 웹 설정 › 비콘 › 비콘 관리자 지정</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>돌아가기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const roomList = rooms.data ?? [];
  const list = beacons.data ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>비콘 등록</Text>
        <Text style={styles.subtitle}>
          권장: 근접/출퇴근 화면에서 감지된 기기의 [등록] 버튼 사용 — QR에 적힌 값이
          비콘이 실제로 쏘는 전파 식별자와 다르면 감지 매칭이 안 됩니다
        </Text>

        {/* QR 스캔 + 수동 입력 */}
        <TouchableOpacity style={styles.scanBtn} onPress={() => setScanOpen(true)}>
          <MaterialCommunityIcons name="qrcode-scan" size={20} color="#fff" />
          <Text style={styles.scanBtnText}>QR 코드 스캔</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="비콘 ID (QR 스캔 시 자동 입력)"
          autoCapitalize="none"
          autoCorrect={false}
          value={beaconId}
          onChangeText={setBeaconId}
        />

        {/* 호실 선택 */}
        <Text style={styles.label}>설치 호실</Text>
        <View style={styles.roomGrid}>
          <TouchableOpacity
            style={[styles.roomChip, roomId === '' && styles.roomChipOn]}
            onPress={() => setRoomId('')}
          >
            <Text style={[styles.roomChipText, roomId === '' && styles.roomChipTextOn]}>공용부</Text>
          </TouchableOpacity>
          {roomList.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.roomChip, roomId === r.id && styles.roomChipOn]}
              onPress={() => setRoomId(r.id)}
            >
              <Text style={[styles.roomChipText, roomId === r.id && styles.roomChipTextOn]}>{r.number}호</Text>
            </TouchableOpacity>
          ))}
        </View>
        {roomList.length === 0 && (
          <Text style={styles.hint}>등록된 호실이 없습니다 — 웹 설정 › 생활실설정에서 먼저 등록해주세요</Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="라벨 (선택 — 예: 침대측, 정문)"
          value={label}
          onChangeText={setLabel}
        />

        <TouchableOpacity
          style={[styles.submitBtn, (!beaconId.trim() || submitting) && styles.btnDisabled]}
          disabled={!beaconId.trim() || submitting}
          onPress={() => void submit()}
        >
          <Text style={styles.submitText}>{submitting ? '등록 중…' : '비콘 등록'}</Text>
        </TouchableOpacity>

        {/* 등록된 비콘 목록 */}
        <Text style={[styles.label, { marginTop: 24 }]}>등록된 비콘 ({list.length})</Text>
        {list.length === 0 && <Text style={styles.hint}>아직 등록된 비콘이 없습니다</Text>}
        {list.map((b) => (
          <View key={b.id} style={styles.beaconRow}>
            <MaterialCommunityIcons name="bluetooth" size={18} color={b.isActive ? '#2563EB' : '#9CA3AF'} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.beaconId} numberOfLines={1}>{b.beaconId}</Text>
              <Text style={styles.beaconMeta}>
                {b.room ? `${b.room.number}호` : '공용부'}
                {b.label ? ` · ${b.label}` : ''}
                {b.residents.length > 0 ? ` · ${b.residents.map((r) => r.name).join(', ')}` : ''}
              </Text>
            </View>
            {!b.isActive && <Text style={styles.inactive}>비활성</Text>}
          </View>
        ))}
        <Text style={styles.hint}>위치별 인물 배정·수정은 웹 설정 › 비콘에서 합니다</Text>
      </ScrollView>

      {/* QR 스캔 모달 */}
      <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
        <View style={styles.scanModal}>
          {camGranted === false ? (
            <View style={styles.center}>
              <Text style={styles.deniedText}>카메라 권한이 필요합니다 — 설정에서 허용해주세요</Text>
            </View>
          ) : (
            <BarCodeScanner
              style={StyleSheet.absoluteFillObject}
              onBarCodeScanned={({ data }) => {
                setBeaconId(String(data ?? '').trim());
                setScanOpen(false);
              }}
            />
          )}
          <TouchableOpacity style={styles.scanClose} onPress={() => setScanOpen(false)}>
            <Text style={styles.scanCloseText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16 },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1A5276', borderRadius: 12, paddingVertical: 14 },
  scanBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginTop: 10 },
  label: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 16, marginBottom: 8 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roomChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  roomChipOn: { backgroundColor: '#1A5276', borderColor: '#1A5276' },
  roomChipText: { fontSize: 13, color: '#334155' },
  roomChipTextOn: { color: '#fff', fontWeight: '700' },
  submitBtn: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  btnDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  beaconRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  beaconId: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  beaconMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  inactive: { fontSize: 11, color: '#9CA3AF' },
  deniedTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginTop: 12 },
  deniedText: { fontSize: 13, color: '#64748b', marginTop: 6, textAlign: 'center' },
  backBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, backgroundColor: '#e2e8f0' },
  backText: { color: '#334155', fontWeight: '600' },
  scanModal: { flex: 1, backgroundColor: '#000' },
  scanClose: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  scanCloseText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
});
