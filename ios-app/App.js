import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { WebView } from 'react-native-webview';

const URL_KEY = 'borsaci.serverUrl';
const DEFAULT_SERVER_URL = 'https://gemini-borsaci.onrender.com';
const BRAND_NAME = '𐰉𐰆𐰺𐰽𐰀𐰲𐰃';

function normalizeUrl(value) {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(trimmed)) return '';
  return trimmed;
}

export default function App() {
  const webRef = useRef(null);
  const appState = useRef(AppState.currentState);
  const [serverUrl, setServerUrl] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(true);
  const [settings, setSettings] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState('');

  const unlock = useCallback(async () => {
    const available = await LocalAuthentication.hasHardwareAsync();
    const enrolled = available && await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      setLocked(false);
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Borsacı kilidini aç',
      cancelLabel: 'Vazgeç',
      fallbackLabel: '',
      disableDeviceFallback: true,
    });
    if (result.success) setLocked(false);
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await SecureStore.getItemAsync(URL_KEY);
      const initialUrl = saved || DEFAULT_SERVER_URL;
      setServerUrl(initialUrl);
      setDraftUrl(initialUrl);
      setLoading(false);
      await unlock();
    })();
  }, [unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (appState.current === 'active' && /inactive|background/.test(next)) setLocked(true);
      appState.current = next;
    });
    return () => subscription.remove();
  }, []);

  async function saveUrl() {
    const value = normalizeUrl(draftUrl);
    if (!value) {
      Alert.alert('Geçersiz adres', 'Adres https:// ile başlamalıdır.');
      return;
    }
    await SecureStore.setItemAsync(URL_KEY, value);
    setServerUrl(value);
    setSettings(false);
    setWebError('');
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#22c55e" size="large" /></View>;
  }

  if (locked) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.lockCard}>
          <Image source={require('./assets/borsaci-crescent-star.png')} style={styles.logo} accessibilityLabel="Borsacı ay yıldız logosu" />
          <Text style={styles.title}>{BRAND_NAME}</Text>
          <Text style={styles.subtitle}>Portföyünüz Face ID ile korunuyor.</Text>
          <Pressable style={styles.primaryButton} onPress={unlock}>
            <Text style={styles.primaryText}>Face ID ile aç</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (settings || !serverUrl) {
    return (
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.settings}>
          <Text style={styles.title}>Sunucu bağlantısı</Text>
          <Text style={styles.subtitle}>Render’daki Borsacı adresini girin. Adres cihazınızda şifreli saklanır.</Text>
          <TextInput
            value={draftUrl}
            onChangeText={setDraftUrl}
            placeholder="https://...onrender.com"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={saveUrl}>
            <Text style={styles.primaryText}>Kaydet ve bağlan</Text>
          </Pressable>
          {!!serverUrl && <Pressable style={styles.secondaryButton} onPress={() => setSettings(false)}><Text style={styles.secondaryText}>Vazgeç</Text></Pressable>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View><Text style={styles.headerTitle}>{BRAND_NAME}</Text><Text style={styles.status}>{webError ? 'Bağlantı sorunu' : 'Güvenli bağlantı'}</Text></View>
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={() => webRef.current?.reload()}><Text style={styles.actionText}>Yenile</Text></Pressable>
          <Pressable style={styles.action} onPress={() => setSettings(true)}><Text style={styles.actionText}>Ayarlar</Text></Pressable>
        </View>
      </View>
      {webLoading && <View style={styles.progress}><ActivityIndicator color="#22c55e" /></View>}
      {!!webError && <View style={styles.error}><Text style={styles.errorText}>{webError}</Text><Pressable onPress={() => webRef.current?.reload()}><Text style={styles.retry}>Tekrar dene</Text></Pressable></View>}
      <WebView
        ref={webRef}
        source={{ uri: serverUrl }}
        style={styles.web}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        onLoadStart={() => { setWebLoading(true); setWebError(''); }}
        onLoadEnd={() => setWebLoading(false)}
        onError={() => { setWebLoading(false); setWebError('Sunucuya ulaşılamadı. Render adresini ve internet bağlantısını kontrol edin.'); }}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setWebError(`Sunucu ${nativeEvent.statusCode} hatası verdi.`);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07110d' }, center: { flex: 1, backgroundColor: '#07110d', alignItems: 'center', justifyContent: 'center' },
  lockCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }, logo: { width: 118, height: 108, resizeMode: 'contain', marginBottom: 18 },
  title: { color: '#f8fafc', fontSize: 28, fontWeight: '800', marginBottom: 8 }, subtitle: { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  primaryButton: { minHeight: 52, width: '100%', borderRadius: 14, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, primaryText: { color: 'white', fontWeight: '800', fontSize: 16 },
  secondaryButton: { padding: 16, alignItems: 'center' }, secondaryText: { color: '#94a3b8', fontWeight: '700' }, settings: { flex: 1, justifyContent: 'center', padding: 24 }, input: { minHeight: 54, borderRadius: 14, backgroundColor: '#111c17', borderWidth: 1, borderColor: '#263b31', color: '#f8fafc', paddingHorizontal: 16, fontSize: 15, marginBottom: 14 },
  header: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#263b31' }, headerTitle: { color: '#f8fafc', fontSize: 19, fontWeight: '800' }, status: { color: '#22c55e', fontSize: 11, marginTop: 2 }, actions: { flexDirection: 'row', gap: 8 }, action: { backgroundColor: '#14231b', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 9 }, actionText: { color: '#d1fae5', fontSize: 12, fontWeight: '700' },
  progress: { position: 'absolute', top: 70, zIndex: 3, alignSelf: 'center', backgroundColor: '#14231b', padding: 8, borderRadius: 20 }, web: { flex: 1, backgroundColor: '#07110d' }, error: { padding: 14, backgroundColor: '#3f1515', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, errorText: { color: '#fecaca', flex: 1, fontSize: 12 }, retry: { color: '#fff', fontWeight: '800', marginLeft: 12 }
});
