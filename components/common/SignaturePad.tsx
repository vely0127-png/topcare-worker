/**
 * 서명 패드 (2026-08-05) — 첫 접속 동의 서명용.
 * PanResponder로 좌표를 수집하고 react-native-svg로 실시간 렌더.
 * 좌표(strokes)가 법적 원본으로 서버에 저장된다(서버가 SVG 생성).
 * ⚠ topcare-guardian/components/common/SignaturePad.tsx 와 미러 — 수정 시 함께.
 */
import { useRef, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, PanResponder } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type SignaturePoint = { x: number; y: number };
export type SignatureData = { width: number; height: number; strokes: SignaturePoint[][] };

function strokeToD(stroke: SignaturePoint[]): string {
  return stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}

export default function SignaturePad({
  height = 220,
  onChange,
}: {
  height?: number;
  onChange: (data: SignatureData | null) => void;
}) {
  const [strokes, setStrokes] = useState<SignaturePoint[][]>([]);
  const [size, setSize] = useState({ width: 0, height });
  // 진행 중 스트로크는 ref로 모으고 state는 move마다 갱신(리렌더로 실시간 표시)
  const currentRef = useRef<SignaturePoint[]>([]);
  const strokesRef = useRef<SignaturePoint[][]>([]);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const emit = () => {
    const all = strokesRef.current;
    onChange(all.length > 0 ? { width: Math.round(sizeRef.current.width), height, strokes: all } : null);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentRef.current = [{ x: Math.round(locationX * 10) / 10, y: Math.round(locationY * 10) / 10 }];
        setStrokes([...strokesRef.current, currentRef.current]);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentRef.current.push({ x: Math.round(locationX * 10) / 10, y: Math.round(locationY * 10) / 10 });
        setStrokes([...strokesRef.current, [...currentRef.current]]);
      },
      onPanResponderRelease: () => {
        if (currentRef.current.length > 1) {
          strokesRef.current = [...strokesRef.current, currentRef.current];
        }
        currentRef.current = [];
        setStrokes([...strokesRef.current]);
        emit();
      },
    }),
  ).current;

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = [];
    setStrokes([]);
    onChange(null);
  };

  return (
    <View>
      <View
        style={[styles.pad, { height }]}
        onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height })}
        {...pan.panHandlers}
      >
        {strokes.length === 0 && <Text style={styles.placeholder}>여기에 서명해주세요</Text>}
        <Svg width="100%" height="100%">
          {strokes.map((s, i) => (
            <Path key={i} d={strokeToD(s)} fill="none" stroke="#111" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
      </View>
      <TouchableOpacity onPress={clear} style={styles.clearBtn}>
        <Text style={styles.clearText}>다시 쓰기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  placeholder: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    color: '#94a3b8',
    fontSize: 17,
  },
  clearBtn: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  clearText: { color: '#64748b', fontSize: 16 },
});
