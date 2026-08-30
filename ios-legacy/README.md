# Borsacı Legacy — iPhone 5

iPhone 5 ve iOS 10.3.4 için hazırlanmış, bağımsız Borsacı WebView istemcisidir.

- Minimum iOS: 10.0
- Mimari: armv7
- Paket kimliği: `com.enscvs.borsaci.legacy`
- Sunucu: `https://gemini-borsaci.onrender.com`
- Açılış: Ay-yıldız ve Göktürkçe adla taktik BRAVO yükleme animasyonu
- Kilit: İlk açılışta kullanıcının belirlediği 4 haneli PIN
- PIN saklama: Keychain içinde PBKDF2-SHA256 ile türetilmiş özet
- Arka plana geçince otomatik kilit
- Beş hatalı denemeden sonra 30 saniye bekleme

IPA, `.github/workflows/build-ios-legacy.yml` akışıyla Theos ve iOS 11.4 SDK kullanılarak iOS 10 hedefli armv7 olarak üretilir. IPA imzasız/adhoc çıkar; Sideloadly kurulum sırasında kullanıcının Apple hesabıyla yeniden imzalar.

