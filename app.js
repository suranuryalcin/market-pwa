/* =========================================
   MARKET BARKOD PWA - ANA MANTIK
   ========================================= */

// --- DURUM ---
let products = [];              // JSON'dan yüklenen ürünler
let currentProduct = null;      // Tekli taramada bulunan ürün
let cart = [];                  // Sepet: [{ barcode, name, price, unit, qty }]
let scanMode = null;            // 'single' | 'bulk'
let videoStream = null;
let scanInterval = null;
let detector = null;
let isFlashOn = false; // YENİ EKLENDİ

// --- DOM ---
const $ = (id) => document.getElementById(id);
const screens = {
  home: $('home-screen'),
  scan: $('scan-screen'),
  result: $('result-screen'),
  cart: $('cart-screen')
};

// =========================================================
// YARDIMCILAR
// =========================================================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function setStatus(text) {
  $('status').textContent = text;
}

function formatPrice(n) {
  return n.toFixed(2).replace('.', ',') + ' ₺';
}

// =========================================================
// ÜRÜNLERİ YÜKLE
// =========================================================
async function loadProducts() {
  try {
    const res = await fetch('data/products.json');
    products = await res.json();
    console.log(`✅ ${products.length} ürün yüklendi.`);
  } catch (err) {
    console.error('Ürünler yüklenemedi:', err);
    alert('Ürün veritabanı yüklenemedi. Sayfayı yenileyin.');
  }
}

// =========================================================
// BARKOD DEDEKTÖRÜ HAZIRLIĞI
// =========================================================
async function setupDetector() {
  if (!('BarcodeDetector' in window)) {
    alert('Bu tarayıcı BarcodeDetector API\'sini desteklemiyor.\nChrome (Android) kullanın.');
    return false;
  }
  const supported = await BarcodeDetector.getSupportedFormats();
  console.log('Desteklenen formatlar:', supported);

  // Yaygın perakende formatlarını kullan
  const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
  const formats = wanted.filter(f => supported.includes(f));

  detector = new BarcodeDetector({ formats });
  console.log('Kullanılacak formatlar:', formats);
  return true;
}

// =========================================================
// KAMERAYI BAŞLAT / DURDUR
// =========================================================
async function startCamera() {
  try {
    // Kamerayı başlat (flaş zorlaması olmadan)
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    
    const video = $('video');
    video.srcObject = videoStream;
    await video.play();

    // Flaş butonunu HER ZAMAN görünür yap
    // (Destekleyip desteklemediğini butona basınca anlayacağız)
    $('btn-flash').style.display = 'flex';
    isFlashOn = false;
    $('btn-flash').classList.remove('active');

    return true;
  } catch (err) {
    console.error('Kamera hatası:', err);
    alert('Kameraya erişilemedi: ' + err.message);
    return false;
  }
}

function stopCamera() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  // YENİ: Kamera kapanınca flaş butonunu sıfırla
  isFlashOn = false;
  if ($('btn-flash')) {
    $('btn-flash').classList.remove('active');
  }
}

// =========================================================
// TARAMA DÖNGÜSÜ
// =========================================================
async function scanLoop() {
  const video = $('video');
  if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

  try {
    const barcodes = await detector.detect(video);
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      handleBarcode(code);
    }
  } catch (err) {
    // Sessizce geç (bazı karelerde hata olabilir)
  }
}

// =========================================================
// BARKOD YAKALANDIĞINDA
// =========================================================
function handleBarcode(code) {
  // Aynı barkodu tekrar tekrar okumayı engelle (debounce)
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  const product = products.find(p => p.barcode === code);

  if (scanMode === 'single') {
    stopCamera();
    showResult(product, code);
  } else if (scanMode === 'bulk') {
    addToCart(product, code);
    // Kısa bir bekleme sonrası taramaya devam et
    setStatus('Okundu: ' + (product ? product.name : code));
    setTimeout(() => {
      if (scanMode === 'bulk') {
        scanInterval = setInterval(scanLoop, 700);
      }
    }, 1200);
  }
}

// =========================================================
// TEKLİ SONUÇ EKRANI
// =========================================================
function showResult(product, code) {
  currentProduct = product;
  const card = $('product-card');

  if (!product) {
    card.innerHTML = `<div class="empty">❌ Ürün bulunamadı<br><small>Barkod: ${code}</small></div>`;
    $('btn-add-single').style.display = 'none';
  } else {
    card.innerHTML = `
      <h2>${product.name}</h2>
      <div class="row"><span>Marka</span><span>${product.brand}</span></div>
      <div class="row"><span>Kategori</span><span>${product.category}</span></div>
      <div class="row"><span>Miktar</span><span>${product.unit}</span></div>
      <div class="row"><span>Barkod</span><span>${product.barcode}</span></div>
      <div class="price">${formatPrice(product.price)}</div>
    `;
    $('btn-add-single').style.display = 'flex';
  }
  showScreen('result');
}

// =========================================================
// SEPET İŞLEMLERİ
// =========================================================
function addToCart(product, code) {
  if (!product) {
    setStatus('❌ Ürün bulunamadı: ' + code);
    return;
  }
  const existing = cart.find(item => item.barcode === product.barcode);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      unit: product.unit,
      qty: 1
    });
  }
  updateCartUI();
  setStatus('🛒 ' + product.name + ' eklendi');
}

function removeFromCart(barcode) {
  cart = cart.filter(item => item.barcode !== barcode);
  updateCartUI();
}

function clearCart() {
  if (cart.length === 0) return;
  if (confirm('Sepeti tamamen temizlemek istiyor musunuz?')) {
    cart = [];
    updateCartUI();
  }
}

function updateCartUI() {
  const list = $('cart-list');
  const totalEl = $('cart-total');
  const countEl = $('cart-count');

  // Sayaç (üst menüdeki)
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
  countEl.textContent = totalQty;

  // Liste
  if (cart.length === 0) {
    list.innerHTML = `<li style="justify-content:center;color:#888;">Sepet boş</li>`;
  } else {
    list.innerHTML = cart.map(item => `
      <li>
        <div class="info">
          ${item.name}
          <small>${formatPrice(item.price)} × ${item.qty} = ${formatPrice(item.price * item.qty)}</small>
        </div>
        <div class="actions">
          <span class="qty">${item.qty}</span>
          <button class="del" data-barcode="${item.barcode}">Sil</button>
        </div>
      </li>
    `).join('');

    // Silme butonlarını bağla
    list.querySelectorAll('.del').forEach(btn => {
      btn.addEventListener('click', () => removeFromCart(btn.dataset.barcode));
    });
  }

  // Toplam
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  totalEl.textContent = formatPrice(total);
}

// =========================================================
// OLAY DİNLEYİCİLERİ
// =========================================================
function bindEvents() {

  // --- Ana Menü ---
  $('btn-single').addEventListener('click', () => startScan('single'));
  $('btn-bulk').addEventListener('click', () => startScan('bulk'));
  $('btn-view-cart').addEventListener('click', () => {
    updateCartUI();
    showScreen('cart');
  });

  // --- Tarama Ekranı ---
  $('btn-back-scan').addEventListener('click', () => {
    scanMode = null;
    stopCamera();
    setStatus('Hazır');
    showScreen('home');
  });

  // --- FLAŞ BUTONU (D ADIMI BURAYA EKLENDİ) ---
    // --- Flaş Butonu ---
  $('btn-flash').addEventListener('click', async () => {
    if (!videoStream) return;
    const track = videoStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities();
    
    // Eğer cihaz flaşı desteklemiyorsa uyar
    if (!capabilities.torch) {
      alert('Cihazınız veya tarayıcınız kamera flaşını desteklemiyor.');
      return;
    }

    try {
      isFlashOn = !isFlashOn;
      await track.applyConstraints({
        advanced: [{ torch: isFlashOn }]
      });
      
      if (isFlashOn) {
        $('btn-flash').classList.add('active');
        setStatus('💡 Flaş Açık');
      } else {
        $('btn-flash').classList.remove('active');
        setStatus('Taranıyor...');
      }
    } catch (err) {
      console.error('Flaş hatası:', err);
      alert('Flaş açılırken hata oluştu: ' + err.message);
    }
  });

  // --- Sonuç Ekranı ---
  $('btn-add-single').addEventListener('click', () => {
    if (currentProduct) {
      addToCart(currentProduct, currentProduct.barcode);
      showScreen('home');
    }
  });
  $('btn-scan-again').addEventListener('click', () => startScan('single'));
  $('btn-back-result').addEventListener('click', () => {
    setStatus('Hazır');
    showScreen('home');
  });

  // --- Sepet Ekranı ---
  $('btn-clear-cart').addEventListener('click', clearCart);
  $('btn-back-cart').addEventListener('click', () => showScreen('home'));
}

// =========================================================
// TARAMAYI BAŞLAT
// =========================================================
async function startScan(mode) {
  scanMode = mode;

  // Detector yoksa kur
  if (!detector) {
    const ok = await setupDetector();
    if (!ok) return;
  }

  showScreen('scan');
  $('scan-hint').textContent = mode === 'single'
    ? '📷 Ürün barkodunu çerçeveye hizalayın'
    : '🧺 Sepete ürün eklemek için barkodları okutun';
  setStatus('Taranıyor...');

  const ok = await startCamera();
  if (!ok) {
    showScreen('home');
    return;
  }

  // Her 700ms'de bir kare tara
  scanInterval = setInterval(scanLoop, 700);
}

// =========================================================
// SERVICE WORKER KAYDI
// =========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('✅ Service Worker kayıtlı'))
      .catch(err => console.error('SW kayıt hatası:', err));
  });
}

// =========================================================
// BAŞLAT
// =========================================================
(async function init() {
  await loadProducts();
  bindEvents();
  updateCartUI();
})();