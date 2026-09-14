import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const BRAND_NAME = '𐰉𐰆𐰺𐰽𐰀𐰲𐰃';
const GRID_COLUMNS = Array.from({ length: 17 }, (_, index) => index);
const GRID_ROWS = Array.from({ length: 35 }, (_, index) => index);

export default function TacticalSplash({ onFinished }) {
  const { width, height } = useWindowDimensions();
  const intro = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const completionRef = useRef(onFinished);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    completionRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const startedAt = Date.now();
    const progressTimer = setInterval(() => {
      const next = Math.min(100, Math.floor((Date.now() - startedAt) / 30));
      setPercent(next);
    }, 30);

    Animated.parallel([
      Animated.timing(intro, {
        toValue: 1,
        duration: 680,
        delay: 50,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scan, {
        toValue: 1,
        duration: 2750,
        delay: 120,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setPercent(100);
      setTimeout(() => completionRef.current?.(), 420);
    });

    return () => {
      clearInterval(progressTimer);
      intro.stopAnimation();
      scan.stopAnimation();
      progress.stopAnimation();
    };
  }, [intro, progress, scan]);

  const reticleSize = Math.min(176, width * 0.46);
  const emblemScale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  const scanTranslate = scan.interpolate({ inputRange: [0, 1], outputRange: [-16, height + 20] });
  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const titleOpacity = progress.interpolate({ inputRange: [0, 0.11, 0.22, 1], outputRange: [0, 0, 1, 1] });
  const unitOpacity = progress.interpolate({ inputRange: [0, 0.17, 0.28, 1], outputRange: [0, 0, 1, 1] });
  const bootOneOpacity = progress.interpolate({ inputRange: [0, 0.20, 0.24, 1], outputRange: [0, 0, 1, 1] });
  const bootTwoOpacity = progress.interpolate({ inputRange: [0, 0.41, 0.45, 1], outputRange: [0, 0, 1, 1] });
  const bootThreeOpacity = progress.interpolate({ inputRange: [0, 0.62, 0.66, 1], outputRange: [0, 0, 1, 1] });
  const stage = percent < 34
    ? 'SİSTEM KONTROLÜ'
    : percent < 68
      ? 'GÜVENLİ KANAL'
      : percent < 100
        ? 'ERİŞİM HAZIRLANIYOR'
        : 'BRAVO HAZIR';

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <View pointerEvents="none" style={styles.grid}>
        {GRID_COLUMNS.map(index => (
          <View key={`v-${index}`} style={[styles.gridVertical, { left: `${index * 6.25}%` }]} />
        ))}
        {GRID_ROWS.map(index => (
          <View key={`h-${index}`} style={[styles.gridHorizontal, { top: `${index * 3}%` }]} />
        ))}
      </View>

      <View style={[styles.corner, styles.cornerTopLeft]} />
      <View style={[styles.corner, styles.cornerTopRight]} />
      <View style={[styles.corner, styles.cornerBottomLeft]} />
      <View style={[styles.corner, styles.cornerBottomRight]} />
      <Text style={[styles.micro, styles.topLeft]}>BCL SECURE OPS</Text>
      <Text style={[styles.micro, styles.topRight]}>MOBILE TERMINAL</Text>

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.reticle,
            {
              width: reticleSize,
              height: reticleSize,
              borderRadius: reticleSize / 2,
              opacity: intro,
              transform: [{ scale: emblemScale }],
            },
          ]}
        >
          <View style={styles.verticalSight} />
          <View style={styles.horizontalSight} />
          <Image
            source={require('./assets/borsaci-crescent-star.png')}
            style={styles.emblem}
            resizeMode="contain"
            accessibilityLabel="Borsacı ay yıldız logosu"
          />
        </Animated.View>

        <Animated.Text style={[styles.brand, { opacity: titleOpacity }]}>{BRAND_NAME}</Animated.Text>
        <Animated.Text style={[styles.unit, { opacity: unitOpacity }]}>BRAVO // BİST OPERASYON MERKEZİ</Animated.Text>
        <View style={styles.telemetry}>
          <Text style={styles.telemetryText}>TR-34</Text>
          <Text style={styles.telemetryText}>SECURE ENCLAVE</Text>
          <Text style={styles.telemetryText}>ŞİFRELİ</Text>
        </View>
        <View style={styles.bootList}>
          <Animated.Text style={[styles.bootText, { opacity: bootOneOpacity }]}>› GÜVENLİ KANAL BAŞLATILIYOR</Animated.Text>
          <Animated.Text style={[styles.bootText, { opacity: bootTwoOpacity }]}>› PORTFÖY MODÜLÜ BAĞLANIYOR</Animated.Text>
          <Animated.Text style={[styles.bootText, { opacity: bootThreeOpacity }]}>› ERİŞİM KİLİDİ HAZIRLANIYOR</Animated.Text>
        </View>
        <View style={styles.progressBlock}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>{stage}</Text>
            <Text style={styles.progressText}>{String(percent).padStart(2, '0')}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        </View>
      </View>

      <Text style={styles.footer}>KİŞİSEL ERİŞİM // YETKİ SEVİYESİ: BRAVO</Text>
      <Animated.View pointerEvents="none" style={[styles.scanLine, { transform: [{ translateY: scanTranslate }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#010907', overflow: 'hidden' },
  grid: { ...StyleSheet.absoluteFillObject, opacity: 0.12 },
  gridVertical: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#3db37f' },
  gridHorizontal: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#3db37f' },
  corner: { position: 'absolute', width: 22, height: 22, borderColor: '#d98c17' },
  cornerTopLeft: { left: 10, top: 10, borderLeftWidth: 1, borderTopWidth: 1 },
  cornerTopRight: { right: 10, top: 10, borderRightWidth: 1, borderTopWidth: 1 },
  cornerBottomLeft: { left: 10, bottom: 10, borderLeftWidth: 1, borderBottomWidth: 1 },
  cornerBottomRight: { right: 10, bottom: 10, borderRightWidth: 1, borderBottomWidth: 1 },
  micro: { position: 'absolute', top: 18, color: '#7aa38c', fontFamily: Platform.select({ ios: 'Courier-Bold', default: 'monospace' }), fontSize: 9, letterSpacing: 0.8 },
  topLeft: { left: 20 },
  topRight: { right: 20, textAlign: 'right' },
  content: { flex: 1, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  reticle: { borderWidth: 1, borderColor: 'rgba(217, 140, 23, 0.48)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  verticalSight: { position: 'absolute', top: -8, bottom: -8, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(232, 158, 33, 0.46)' },
  horizontalSight: { position: 'absolute', left: -8, right: -8, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(232, 158, 33, 0.46)' },
  emblem: { width: '88%', height: '88%' },
  brand: { color: '#ffbd36', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  unit: { color: '#97b5a6', fontFamily: Platform.select({ ios: 'Courier-Bold', default: 'monospace' }), fontSize: 10, letterSpacing: 0.7, textAlign: 'center', marginTop: 3 },
  telemetry: { width: '100%', minHeight: 30, marginTop: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(51, 125, 89, 0.55)', backgroundColor: 'rgba(5, 36, 23, 0.68)', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  telemetryText: { color: '#b8c9bf', fontFamily: Platform.select({ ios: 'Courier-Bold', default: 'monospace' }), fontSize: 9 },
  bootList: { width: '100%', marginTop: 13, minHeight: 70 },
  bootText: { color: '#94b09f', fontFamily: Platform.select({ ios: 'Courier-Bold', default: 'monospace' }), fontSize: 10, lineHeight: 22, letterSpacing: 0.25 },
  progressBlock: { width: '100%', marginTop: 2 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressText: { color: '#e3a13b', fontFamily: Platform.select({ ios: 'Courier-Bold', default: 'monospace' }), fontSize: 9 },
  progressTrack: { height: 3, marginTop: 7, backgroundColor: 'rgba(94, 120, 104, 0.34)', overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#ffa80d', shadowColor: '#ffa80d', shadowOpacity: 0.8, shadowRadius: 5 },
  footer: { position: 'absolute', bottom: 20, left: 20, right: 20, color: '#708f7d', fontFamily: Platform.select({ ios: 'Courier-Bold', default: 'monospace' }), fontSize: 8, letterSpacing: 0.4, textAlign: 'center' },
  scanLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, opacity: 0.9, backgroundColor: 'rgba(255, 184, 59, 0.19)', shadowColor: '#ffad1f', shadowOpacity: 0.7, shadowRadius: 9 },
});

