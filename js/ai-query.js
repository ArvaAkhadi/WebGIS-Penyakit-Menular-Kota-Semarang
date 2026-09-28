/* =========================================================
   AI QUERY — Versi LLM (Groq + Llama 3.3 70B)
   Dengan Function Calling untuk akses data real WebGIS
   ========================================================= */
const AIQuery = (function() {

  const GROQ_API_KEY = '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';  // ← Ganti dengan key Anda
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODEL = 'llama-3.3-70b-versatile';

  let _state = null;
  let _labelPenyakit = { dbd: 'DBD', leptospirosis: 'Leptospirosis', tb_baru: 'TB Baru' };
  let _conversationHistory = [];

  function init(state) {
    _state = state;
    _conversationHistory = [];
  }

  /* =========================================================
     TOOLS — fungsi yang bisa dipanggil LLM
     ========================================================= */
  const tools = {
    get_top_kecamatan: function(args) {
      const penyakit = args.penyakit || _state.penyakit;
      const n = args.jumlah || 5;
      const asc = args.terendah === true;
      const arr = Object.entries(_state.mapData).map(([kec, val]) => ({ kec, val }));
      arr.sort((a, b) => asc ? a.val - b.val : b.val - a.val);
      return {
        penyakit: _labelPenyakit[penyakit] || penyakit,
        tahun: _state.tahun,
        ranking: arr.slice(0, n).map((r, i) => ({ peringkat: i + 1, kecamatan: r.kec, kasus: r.val }))
      };
    },

    get_total_kasus: function(args) {
      const penyakit = args.penyakit || _state.penyakit;
      const total = Object.values(_state.mapData).reduce((a, b) => a + b, 0);
      const nKec = Object.keys(_state.mapData).length;
      return {
        penyakit: _labelPenyakit[penyakit] || penyakit,
        tahun: _state.tahun,
        total_kasus: total,
        jumlah_kecamatan: nKec,
        rata_rata: Math.round(total / nKec)
      };
    },

    get_info_kecamatan: function(args) {
      const kec = args.kecamatan;
      if (!kec) return { error: 'Nama kecamatan tidak disebutkan' };
      const key = Object.keys(_state.mapData).find(k =>
        k.toLowerCase().includes(kec.toLowerCase())
      );
      if (!key) return { error: 'Kecamatan "' + kec + '" tidak ditemukan' };
      const detail = _state.barData[key] || {};
      return {
        kecamatan: key,
        penyakit: _labelPenyakit[_state.penyakit] || _state.penyakit,
        tahun: _state.tahun,
        total_kasus: _state.mapData[key] || 0,
        laki_laki: detail.laki_laki || 0,
        perempuan: detail.perempuan || 0,
        meninggal_laki_laki: detail.meninggal_laki_laki || 0,
        meninggal_perempuan: detail.meninggal_perempuan || 0
      };
    },

    get_semua_kecamatan: function() {
      return {
        penyakit: _labelPenyakit[_state.penyakit] || _state.penyakit,
        tahun: _state.tahun,
        data: Object.entries(_state.mapData)
          .sort((a, b) => b[1] - a[1])
          .map(([kec, val]) => ({ kecamatan: kec, kasus: val }))
      };
    },

    get_status_aksesibilitas: function() {
      return {
        informasi: 'Layer aksesibilitas faskes terbagi 4 zona: ' +
          'Sangat Terjangkau (<1km, hijau), ' +
          'Terjangkau (1-3km, kuning), ' +
          'Jauh (3-5km, oranye), ' +
          'Tidak Terjangkau (>5km, merah). ' +
          'Aktifkan layer di panel untuk melihat sebarannya di peta.'
      };
    },

    get_konteks_peta: function() {
      return {
        penyakit_aktif: _labelPenyakit[_state.penyakit] || _state.penyakit,
        tahun_aktif: _state.tahun,
        jumlah_kecamatan: Object.keys(_state.mapData).length,
        total_kasus: Object.values(_state.mapData).reduce((a, b) => a + b, 0)
      };
    }
  };

  /* =========================================================
     SKEMA TOOLS untuk LLM
     ========================================================= */
  const toolsSchema = [
    {
      type: 'function',
      function: {
        name: 'get_top_kecamatan',
        description: 'Mendapatkan daftar kecamatan dengan kasus tertinggi atau terendah untuk penyakit dan tahun yang aktif.',
        parameters: {
          type: 'object',
          properties: {
            penyakit: { type: 'string', enum: ['dbd', 'leptospirosis', 'tb_baru'], description: 'Jenis penyakit' },
            jumlah:   { type: 'integer', description: 'Jumlah kecamatan yang diminta (default 5)' },
            terendah: { type: 'boolean', description: 'True jika ingin yang terendah, false/default untuk tertinggi' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_total_kasus',
        description: 'Menghitung total kasus penyakit di seluruh kecamatan pada tahun aktif.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_info_kecamatan',
        description: 'Mendapatkan detail kasus di kecamatan tertentu (L/P/meninggal).',
        parameters: {
          type: 'object',
          properties: {
            kecamatan: { type: 'string', description: 'Nama kecamatan, contoh: Tembalang, Genuk' }
          },
          required: ['kecamatan']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_semua_kecamatan',
        description: 'Mendapatkan data semua kecamatan, diurutkan dari kasus terbanyak.',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_status_aksesibilitas',
        description: 'Menjelaskan zona aksesibilitas faskes (buffer 1/3/5 km).',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_konteks_peta',
        description: 'Mendapatkan konteks peta saat ini (penyakit & tahun aktif, total kasus).',
        parameters: { type: 'object', properties: {} }
      }
    }
  ];

  /* =========================================================
     SYSTEM PROMPT
     ========================================================= */
  const SYSTEM_PROMPT = `Anda adalah "Asisten AI Peta" untuk WebGIS Dinamika Penyakit Menular Kota Semarang.

Tugas Anda: menjawab pertanyaan pengguna tentang data penyakit menular (DBD, Leptospirosis, TB Baru) dan aksesibilitas fasilitas kesehatan di Kota Semarang.

ATURAN PENTING:
1. SELALU panggil fungsi (tool) yang tersedia untuk mendapatkan data AKTUAL dari peta. JANGAN mengarang angka.
2. Jawab dengan BAHASA INDONESIA yang ramah, jelas, dan ringkas.
3. Jika data yang diminta tidak tersedia, katakan dengan jujur.
4. Jika pengguna menyebut nama kecamatan yang mirip (misal "tembalang" → "Tembalang"), tetap coba panggil fungsi.
5. Sajikan data dalam bentuk poin-poin yang mudah dibaca.
6. Jika pengguna meminta rekomendasi atau insight, berikan analisis singkat setelah data.
7. JANGAN tampilkan nama fungsi atau kode teknis ke pengguna.

KONTEKS WEBGIS:
- Penyakit yang dipantau: DBD, Leptospirosis, TB Baru
- Periode: 2019-2026
- Wilayah: 16 kecamatan di Kota Semarang
- Buffer aksesibilitas: 1km (sangat terjangkau), 3km (terjangkau), 5km (jauh), >5km (tidak terjangkau)`;

  /* =========================================================
     MAIN ASK FUNCTION
     ========================================================= */
  async function ask(userMessage) {
    if (!_state) {
      return '<div style="color:#ffb3b3;">Data peta belum siap. Tunggu beberapa detik.</div>';
    }

    // Tambahkan ke history
    _conversationHistory.push({ role: 'user', content: userMessage });

    // Batasi history agar tidak terlalu panjang (10 pesan terakhir)
    if (_conversationHistory.length > 10) {
      _conversationHistory = _conversationHistory.slice(-10);
    }

    try {
      // === Panggilan Pertama ===
      let messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ..._conversationHistory
      ];

      let response = await callGroq(messages, toolsSchema);
      let choice = response.choices[0];
      let assistantMsg = choice.message;

      // === Cek apakah LLM minta panggil tool ===
      let iterations = 0;
      while (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0 && iterations < 5) {
        iterations++;
        messages.push(assistantMsg);

        // Eksekusi semua tool calls
        for (const toolCall of assistantMsg.tool_calls) {
          const fnName = toolCall.function.name;
          let args = {};
          try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch(e){}

          console.log('🔧 Tool call:', fnName, args);
          const result = tools[fnName] ? tools[fnName](args) : { error: 'Fungsi tidak ditemukan' };

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
        }

        // Panggil LLM lagi dengan hasil tool
        response = await callGroq(messages, toolsSchema);
        assistantMsg = response.choices[0].message;
      }

      // === Jawaban Final ===
      const finalText = assistantMsg.content || 'Maaf, saya tidak bisa menjawab saat ini.';
      _conversationHistory.push({ role: 'assistant', content: finalText });

      return formatMarkdown(finalText);

    } catch (err) {
      console.error('AI Error:', err);
      return '<div style="color:#ffb3b3;">⚠️ Error AI: ' + err.message + '<br>' +
             'Coba lagi atau cek API key.</div>';
    }
  }

  /* =========================================================
     CALL GROQ API
     ========================================================= */
  async function callGroq(messages, tools) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GROQ_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('HTTP ' + res.status + ': ' + errText.substring(0, 100));
    }

    return await res.json();
  }

  /* =========================================================
     MARKDOWN FORMATTER (sederhana)
     ========================================================= */
  function formatMarkdown(text) {
    return text
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      // Italic
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      // List items
      .replace(/^\s*[-•]\s+(.+)$/gm, '• $1')
      .replace(/^\s*(\d+)\.\s+(.+)$/gm, '$1. $2')
      // Line breaks
      .replace(/\n/g, '<br>');
  }

  /* =========================================================
     CLEAR HISTORY
     ========================================================= */
  function clearHistory() {
    _conversationHistory = [];
  }

  return { init, ask, clearHistory };
})();
