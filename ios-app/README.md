# Borsacı iOS

Kişisel kullanım için hazırlanmış Expo/React Native iOS istemcisidir. Mevcut Render sunucusuna bağlanır, oturumu uygulama içinde tutar ve uygulama arka plana geçtiğinde Face ID kilidini etkinleştirir.

## Telefonda hızlı deneme

1. Bilgisayarda Node.js kurulu olmalıdır.
2. Bu klasörde `npm install` ve ardından `npx expo start` çalıştırın.
3. iPhone'a App Store'dan Expo Go yükleyin ve ekrandaki QR kodunu tarayın.
4. İlk açılışta çalışan Render adresini `https://` ile girin.

## App Store olmadan bağımsız kurulum

`npx eas-cli build --platform ios --profile preview` komutu Apple hesabı ve cihaz kaydı üzerinden imzalı kurulum bağlantısı üretir. Apple'ın imzalama adımları nedeniyle bu aşamada Expo ve Apple hesabıyla giriş gerekir.

Parola veya API anahtarı uygulama kaynak koduna yazılmaz.

