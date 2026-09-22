/* =========================================================
   AI QUERY — parser sederhana untuk pertanyaan tentang data
   ========================================================= */
const AIQuery = (function() {

  /* Referensi ke state global WebGIS (diisi oleh map.html) */
  let _state = null;
  let _getColor = null;
  let _labelPenyakit = { dbd: 'DBD', leptospirosis: 'Leptospirosis', tb_baru: 'TB Baru' };

  function init(state, getColorFn) {
    _state = state;
    _getColor = getColorFn;
  }

  /* Deteksi penyakit dari teks */
  function detectPenyakit(text) {
    const t = text.toLowerCase();
    if (t.includes('dbd') || t.includes('dengue') || t.includes('berdarah')) return 'dbd';
    if (t.includes('lepto')) return 'leptospirosis';
    if (t.includes('tb') || t.includes('tuberkulosis') || t.includes('tuberculosis')) return 'tb_baru';
    return null;
  }

  /* Deteksi tahun */
  function detectTahun(text) {
    const m = text.match(/\b(20\d{2})\b/);
    return m ? parseInt(m[1]) : null;
  }

  /* Format daftar kecamatan dengan nilai */
  function formatRanking(mapData, n = 5, asc = false) {
    const arr = Object.entries(mapData).map(([kec, val]) => ({ kec, val }));
    arr.sort((a, b) => asc ? a.val - b.val : b.val - a.val);
    return arr.slice(0, n);
  }

  /* Format jawaban HTML */
  function html(title, body) {
    return '<h4 style="margin:0 0 8px;color:#2c3e50;font-size:13px;">' +
           '<i class="fas fa-robot" style="color:#3498db;"></i> ' + title + '</h4>' +
           '<div style="font-size:12px;line-height:1.7;color:#34495e;">' + body + '</div>';
  }

  /* Handler utama */
  async function ask(question) {
    if (!_state) return html('Asisten AI', 'Data belum siap. Tunggu beberapa detik.');

    const q = question.toLowerCase().trim();
    const penyakit = detectPenyakit(q) || _state.penyakit;
    const tahun = detectTahun(q) || _state.tahun;
    const labelP = _labelPenyakit[penyakit] || penyakit;

    // ============ INTENT 1: Kasus tertinggi ============
    if (q.match(/tertinggi|terbanyak|paling banyak|paling tinggi|max/)) {
      const ranking = formatRanking(_state.mapData, 5, false);
      let body = 'Untuk <b>' + labelP + '</b> tahun <b>' + tahun + '</b>, ' +
                 '5 kecamatan dengan kasus terbanyak:<br><br>';
      body += '<ol style="padding-left:20px;margin:0;">';
      ranking.forEach(r => {
        body += '<li><b>' + r.kec + '</b> — ' + r.val + ' kasus</li>';
      });
      body += '</ol>';
      return html('Kasus Tertinggi', body);
    }

    // ============ INTENT 2: Kasus terendah ============
    if (q.match(/terendah|paling sedikit|paling rendah|min/)) {
      const ranking = formatRanking(_state.mapData, 5, true);
      let body = 'Untuk <b>' + labelP + '</b> tahun <b>' + tahun + '</b>, ' +
                 '5 kecamatan dengan kasus paling sedikit:<br><br>';
      body += '<ol style="padding-left:20px;margin:0;">';
      ranking.forEach(r => {
        body += '<li><b>' + r.kec + '</b> — ' + r.val + ' kasus</li>';
      });
      body += '</ol>';
      return html('Kasus Terendah', body);
    }

    // ============ INTENT 3: Total kasus ============
    if (q.match(/total|jumlah|berapa.*kasus|semua/)) {
      const total = Object.values(_state.mapData).reduce((a, b) => a + b, 0);
      const nKec = Object.keys(_state.mapData).length;
      const body = 'Total kasus <b>' + labelP + '</b> tahun <b>' + tahun + '</b>: ' +
                   '<b style="color:#c0392b;font-size:16px;">' + total + '</b> kasus<br>' +
                   'Tersebar di <b>' + nKec + '</b> kecamatan.';
      return html('Total Kasus', body);
    }

    // ============ INTENT 4: Info kecamatan tertentu ============
    for (const kec of Object.keys(_state.mapData)) {
      if (q.includes(kec.toLowerCase())) {
        const val = _state.mapData[kec] || 0;
        const detail = _state.barData[kec] || {};
        let body = '<b>' + kec + '</b><br>' +
                   'Kasus <b>' + labelP + '</b> tahun <b>' + tahun + '</b>: ' +
                   '<b style="color:#c0392b;">' + val + '</b><br>';
        if (detail.laki_laki !== undefined) {
          body += '<br><b>Detail:</b><br>' +
                  '• Laki-laki: ' + detail.laki_laki + '<br>' +
                  '• Perempuan: ' + detail.perempuan + '<br>' +
                  '• Meninggal (L): ' + (detail.meninggal_laki_laki || 0) + '<br>' +
                  '• Meninggal (P): ' + (detail.meninggal_perempuan || 0);
        }
        return html('Info Kecamatan', body);
      }
    }

    // ============ INTENT 5: Aksesibilitas faskes ============
    if (q.match(/akses|terjangkau|faskes|fasilitas|rumah sakit|puskesmas/)) {
      const body = '<b>Info Aksesibilitas Faskes:</b><br><br>' +
        '• <b style="color:#00c853;">Sangat Terjangkau</b> (&lt;1 km dari faskes)<br>' +
        '• <b style="color:#ffd600;">Terjangkau</b> (1–3 km)<br>' +
        '• <b style="color:#ff6d00;">Jauh</b> (3–5 km)<br>' +
        '• <b style="color:#d50000;">Tidak Terjangkau</b> (&gt;5 km)<br><br>' +
        'Aktifkan layer di panel kanan untuk melihat sebarannya di peta.';
      return html('Aksesibilitas Faskes', body);
    }

    // ============ INTENT 6: Bandingkan 2 penyakit ============
    if (q.match(/banding|vs|dibandingkan/)) {
      const body = '<b>Perbandingan Penyakit:</b><br><br>' +
                   'Penyakit saat ini: <b>' + labelP + '</b><br>' +
                   'Tahun: <b>' + tahun + '</b><br><br>' +
                   'Ganti dropdown "Jenis Penyakit" dan "Tahun" untuk ' +
                   'membandingkan data antar penyakit/tahun.';
      return html('Perbandingan', body);
    }

    // ============ INTENT 7: Bantuan ============
    if (q.match(/bantu|help|apa yang bisa|contoh|panduan/)) {
      const body = 'Saya bisa menjawab pertanyaan seperti:<br><br>' +
        '• "Kecamatan mana yang DBD-nya tertinggi tahun 2025?"<br>' +
        '• "Total kasus leptospirosis 2024?"<br>' +
        '• "Berapa kasus DBD di Tembalang?"<br>' +
        '• "Daerah mana yang tidak terjangkau faskes?"<br>' +
        '• "Bandingkan DBD dan TB"';
      return html('Panduan', body);
    }

    // ============ FALLBACK ============
    const body = 'Maaf, saya belum mengerti pertanyaan tersebut.<br><br>' +
                 'Coba tanya seperti:<br>' +
                 '• "Kasus DBD tertinggi 2025?"<br>' +
                 '• "Total kasus Leptospirosis?"<br>' +
                 '• "Info Tembalang"<br>' +
                 '• Ketik "bantuan" untuk daftar lengkap';
    return html('Tidak Dikenali', body);
  }

  return { init, ask };
})();