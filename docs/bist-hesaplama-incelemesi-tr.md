# BIST hesaplama incelemesi

İncelenen sürüm: `f9685a8643fb90f623fa06a59f39d9b9e5d8b801` (`main`).
İnceleme tarihi: 6 Ekim 2026. Kaynak kod ve kontrollü örnek veriler incelendi; canlı hesabın verilerine erişilmedi.

## Türkçe görünüm

BIST sekmesindeki filtreler, başlıklar, özet kartları, işlem ve veri kalitesi durumları, seçim nedenleri, lot hesapları, teknik gösterge açıklamaları, dengeleme ve geçmiş alanları Türkçeleştirildi. Standart gösterge kısaltmaları (TSMOM, SMA, EMA, RSI, MACD, ATR) korunarak Türkçe açıklamaları eklendi. Geçmişte ham JSON göstermek yerine Türkçe alan adları kullanıldı. API anahtarları ve hesaplama motoru değiştirilmedi.

## Doğrulanan kusurlar

### 1. Yüksek: sermaye değişikliği kâr gibi gösteriliyor

`server.js` içindeki `buildBistTsmomSnapshot`, kayıtlı hesabın nakit ve pozisyonlarını kullanıyor; hesabın `paper.initialCapital` değerini hesaplama modeline aktarmıyor. `trading/bist-tsmom-service.js` sermayeyi her durumda 100.000 TL kabul ederek toplam kârı ve getiriyi hesaplıyor. Oysa sunucunun risk ayarları hesabın sermayesini değiştirebiliyor.

Örnek: başlangıç sermayesi ve nakdi 200.000 TL olan, hiç işlem yapmamış hesap için mevcut model 100.000 TL kâr ve %100 getiri gösteriyor. Doğru değerler 0 TL ve %0 olmalı. Muhasebe mutabakat uyarısı var ama gösterilen kâr/getiriyi düzeltmiyor.

Öneri: 100.000 TL strateji tahsis bütçesi ile mevcut hesabın başlangıç sermayesini ayrı alanlarda taşıyın; hesap getirisi hesabın gerçek sermayesine göre hesaplanmalı. Sermaye giriş/çıkışları varsa bunlar da getiriden ayrılmalı.

### 2. Yüksek: eksik ay sonu verisi geçerli referans sayılıyor

`monthlyCloses`, ay içindeki son mevcut kaydı seçiyor; bunun ayın son işlem gününe ait olduğunu doğrulamıyor. `buildTsmomPortfolio`, ilgili ayların bulunmasını yeterli kabul ediyor. Son fiyatın güncel olması, 12 ay önceki referansın eksik olmasını engellemiyor.

Yeniden üretim: 1 Şubat 2024 kapanışı 100 TL ve 28 Şubat 2025 kapanışı 120 TL; diğer bütün kayıtlar eksik; inceleme zamanı 1 Mart 2025. Model referansı `2024-02-01` kabul ediyor, %20 momentum, uygun veri ve alış önerisi üretiyor. 2024 Şubat ayının son işlem günü fiyatı bilinmediğinden bu hesap doğrulanamaz.

Öneri: referans ve sinyal aylarının son işlem günü kapsamasını borsa takvimi/veri sağlayıcı bilgisiyle doğrulayın; eksiklikte açık veri kalitesi uyarısı ve işlem engeli üretin.

### 3. Orta: sonraki dengeleme tarihinde saat dilimi uyuşmazlığı

Momentum ayı İstanbul takvimine göre belirlenirken `server.js:nextBistTsmomRebalanceDate` UTC takvimini kullanıyor.

Örnek: `2025-02-28T21:05:00Z`, İstanbul'da 1 Mart 00:05. Sinyal ayı Şubat olarak doğru seçiliyor; sonraki dengeleme ise 1 Mart olarak gösteriliyor. Aynı aylık ilk gün kuralına göre sonraki tarih 1 Nisan olmalı.

Öneri: iki hesapta da İstanbul ay/yıl bilgisini kullanın; gerçekten işlem yapılacak tarih gösterilecekse hafta sonu ve tatil takvimini de uygulayın.

### 4. Orta: geçersiz açık pozisyonlar sessizce kaybolabiliyor

`positionBySymbol`, lotu eksik, negatif veya sayıya çevrilemeyen açık pozisyonları hata kaydı oluşturmadan atlıyor. Sonrasında hesap boş görünürse, nakit eksik olduğunda 100.000 TL varsayılan nakit oluşturulabiliyor.

Örnek: açık A pozisyonu, lot -5, maliyet ve fiyat 100 TL, nakit bilinmiyor. Model 0 açık pozisyon ve 100.000 TL net portföy değeri gösteriyor. Geçersiz kayıt varken muhasebe doğrulanmış gibi görünmemeli.

Öneri: geçersiz pozisyonları ayrı hata listesinde koruyun, net değer/nakit belirsizliğini görünür kılın ve eksik nakde boş hesap varsayımı uygulamayın.

## Yöntem tercihleri ve sınırlamalar

- Yahoo isteği düzeltilmiş kapanış verisini talep ediyor; ancak `fetchYahooChart` yalnız `quote.close` alanını işliyor. Bu nedenle ekran fiyat getirisi hesaplıyor; temettü dahil toplam getiri hesapladığı varsayılmamalı. Toplam getiri hedefleniyorsa düzeltilmiş seri ayrıca kullanılmalı; lot ve değerleme gerçek işlem fiyatından yapılmalı. Canlı bir hissede kurumsal işlem etkisi bu incelemede ölçülmedi.
- ATR, son 14 gerçek aralığın basit ortalaması; Wilder yumuşatması kullanılmıyor. Açıklama bu yöntemle uyumlu. Farklı platformların ATR değerleriyle fark olması tek başına aritmetik hata sayılmaz.
- Oynaklık popülasyon standart sapması ve yılda 252 işlem günü varsayımıyla hesaplanıyor. Hacim ortalaması son günü de içeriyor.
- Dengeleme tutarları komisyon ve fiyat kayması hariç brüt önizleme. Uzun tatillerde 72 saat fiyat yaşı kuralı alış ve satışı engelleyebilir.
- Aylık, nakit ve net değer geçmişi kalıcı tarihçe değil, istek sırasında üretilen anlık görünüm. Aylık otomatik emir yürütümü bu ekranda yok.

## Doğrulama

50 ilgili test geçti: momentum referansları, sıralama, lot, nakit, muhasebe, teknik göstergeler, filtreleme, Türkçe detay/geçmiş gösterimi ve etkileşimler. Bu testlerin geçmesi yukarıdaki ek örneklerle saptanan kusurları ortadan kaldırmıyor.

HTTP varlık testleri ortamın `127.0.0.1` üzerinde port açmayı `EPERM` ile engellemesi nedeniyle çalıştırılamadı. Canlı site görüntüsü ve canlı hesap sonuçları doğrulanmadı. İlk commit yalnız Türkçe sunumu düzenledi. Aşağıdaki ikinci aşamada raporlanan dört kusur düzeltildi.


## 7 Ekim 2026 — uygulanan düzeltmeler

- Türkçeleştirme önce `f766465824ba76266c7a1a9825cb049cc56269e0` commit'iyle main dalına yüklendi.
- Hesap kârı ve getirisi kayıtlı hesabın gerçek başlangıç sermayesine göre hesaplanıyor. Stratejinin 100.000 TL tahsis bütçesi ve 30 hisseye bölünmesi ayrı tutuldu; ekranda hesap başlangıç sermayesi de gösteriliyor. Geçersiz sermayede getiri bilinmiyor olarak gösteriliyor.
- Referans ve sinyal ayı kapanışları, tamamlanmış XU100 günlük verilerindeki son seans tarihleriyle doğrulanıyor. Böylece tatil günleri hesaba katılıyor. Takvim verisi alınamazsa doğrulanamayan işlemler engelleniyor. Hesaplama modülünün tek başına kullanımında hafta içi ay sonu kontrolü varsayılandır; üretim çağrısı XU100 takvimini açıkça sağlıyor. Veri sağlayıcının endeks geçmişinin doğru ve tam olması hâlâ bir bağımlılık.
- Sonraki aylık dengeleme günü İstanbul takviminden hesaplanıyor. Bu tarih aylık planlama tarihidir; tatil günlerinde otomatik emir göndermeyi ifade etmez.
- Negatif veya bilinmeyen lotlu açık pozisyonlar satırlarda korunuyor, işlem engeli ve muhasebe uyarısı gösteriliyor. Bu kayıtların değerlemesi ve net portföy değeri bilinmiyor kalıyor; eksik nakit boş hesap varsayımıyla doldurulmuyor.

Doğrulama: 60 ilgili test geçti; bunlara dört hata için sınır durumları ve üretim snapshot entegrasyon testleri dahil. Türkçe detay/geçmiş testleri de geçti. Canlı kullanıcı hesabı veya canlı site üzerinde sonuç kontrolü yapılmadı. Fiyat getirisi/temettü, basit ATR ve brüt önizleme yöntem tercihleri değiştirilmedi.
