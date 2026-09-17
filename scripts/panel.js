// ==================== GLOBAL STATE ====================
let currentMode = REGISTRATION_MODES.INDIVIDUAL;
let byDateLogEntries = []; // ✅ buffer untuk export Excel

// ==================== KONFIGURASI HALAMAN PERSIAPAN ====================
const PREPARATION_PAGES = {
  [REGISTRATION_MODES.INDIVIDUAL]: "data-preparation-individu.html",
  [REGISTRATION_MODES.SCHOOL]: "data-preparation-sekolah.html",
  "by-date": "data-preparation-by-date.html",
};

// ==================== WRAPPER RUN PENDAFTARAN ====================
async function runPendaftaran(iData, mode = REGISTRATION_MODES.INDIVIDUAL) {
  const defData = getDefaultData(mode);
  if (mode === REGISTRATION_MODES.SCHOOL) {
    return await runPendaftaranSekolah(iData, defData);
  } else {
    return await runPendaftaranIndividu(iData, defData);
  }
}

// ==================== WRAPPER RUN KEHADIRAN ====================
async function runKehadiran(iData, mode = REGISTRATION_MODES.INDIVIDUAL) {
  const defData = getDefaultData(mode);
  if (mode === REGISTRATION_MODES.SCHOOL) {
    return await runKehadiranSekolah(iData, defData);
  } else {
    return await runKehadiranIndividu(iData, defData);
  }
}

// ==================== HELPER: BUKA HALAMAN PERSIAPAN DATA ====================
async function openDataPreparation(mode) {
  const relativePath = PREPARATION_PAGES[mode];

  if (!relativePath) {
    console.error(`Mode persiapan tidak dikenal: ${mode}`);
    showErrorSwal(`Mode persiapan "${mode}" belum terdaftar.`);
    return;
  }

  const url = chrome.runtime.getURL(relativePath);

  try {
    const tabs = await chrome.tabs.query({ url });

    if (tabs.length > 0) {
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url });
    }
  } catch (err) {
    console.error("Gagal membuka halaman persiapan data:", err);
    showErrorSwal("Gagal membuka halaman persiapan data.");
  }
}

// ==================== DOM CONTENT LOADED ====================
document.addEventListener("DOMContentLoaded", () => {
  // ------------------------------------------------------------
  // 1) Inisialisasi tanggal pemeriksaan untuk individu
  // ------------------------------------------------------------
  if (!localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN)) {
    const defaultTanggal = String(new Date().getDate());
    localStorage.setItem(LOCAL_STORAGE.TGL_PEMERIKSAAN, defaultTanggal);
  }

  populateTanggalPemeriksaan();
  loadDataTable(currentMode);
  initRunSetting();

  // ------------------------------------------------------------
  // 2) Event listener: Tombol Persiapan Data
  // ------------------------------------------------------------
  const btnPrepIndividu = document.getElementById(
    "openDataPreparationIndividu",
  );
  if (btnPrepIndividu) {
    btnPrepIndividu.addEventListener("click", () =>
      openDataPreparation(REGISTRATION_MODES.INDIVIDUAL),
    );
  }

  const btnPrepSekolah = document.getElementById("openDataPreparationSekolah");
  if (btnPrepSekolah) {
    btnPrepSekolah.addEventListener("click", () =>
      openDataPreparation(REGISTRATION_MODES.SCHOOL),
    );
  }

  const btnPrepByDate = document.getElementById("openDataPreparationByDate");
  if (btnPrepByDate) {
    btnPrepByDate.addEventListener("click", () =>
      openDataPreparation("by-date"),
    );
  }

  // ------------------------------------------------------------
  // 3) Event listener: Tombol-tombol utama
  // ------------------------------------------------------------
  const btnRefreshIndividu = document.getElementById("btnRefreshIndividu");
  if (btnRefreshIndividu) {
    btnRefreshIndividu.addEventListener("click", () =>
      loadDataTable(REGISTRATION_MODES.INDIVIDUAL),
    );
  }

  const btnRefreshSekolah = document.getElementById("btnRefreshSekolah");
  if (btnRefreshSekolah) {
    btnRefreshSekolah.addEventListener("click", () =>
      loadDataTable(REGISTRATION_MODES.SCHOOL),
    );
  }

  const runProcessBtn = document.getElementById("runProcessBtn");
  if (runProcessBtn) {
    runProcessBtn.addEventListener("click", runProcess);
  }

  const btnRefreshSummary = document.getElementById("btnRefreshSummary");
  if (btnRefreshSummary) {
    btnRefreshSummary.addEventListener("click", renderSummary);
  }

  // ------------------------------------------------------------
  // 4) Tab switching
  // ------------------------------------------------------------
  const tabIndividu = document.getElementById("tab-individu");
  if (tabIndividu) {
    tabIndividu.addEventListener("click", () =>
      switchMode(REGISTRATION_MODES.INDIVIDUAL),
    );
  }

  const tabSekolah = document.getElementById("tab-sekolah");
  if (tabSekolah) {
    tabSekolah.addEventListener("click", () =>
      switchMode(REGISTRATION_MODES.SCHOOL),
    );
  }

  // ------------------------------------------------------------
  // 5) PEMERIKSAAN BY DATE — Init
  // ------------------------------------------------------------
  const inputTglDari = document.getElementById("inputTglDari");
  const inputTglSampai = document.getElementById("inputTglSampai");
  const runByDateBtn = document.getElementById("runByDateBtn");
  const stopByDateBtn = document.getElementById("stopByDateBtn");
  const clearByDateLogBtn = document.getElementById("clearByDateLogBtn");
  const downloadByDateLogBtn = document.getElementById(
    "downloadByDateLogBtn",
  );

  if (inputTglDari) {
    inputTglDari.value =
      localStorage.getItem(LOCAL_STORAGE.BY_DATE_DARI) || "";
    inputTglDari.addEventListener("change", function () {
      localStorage.setItem(LOCAL_STORAGE.BY_DATE_DARI, this.value);
      console.log("By Date - Dari:", this.value);
    });
  }

  if (inputTglSampai) {
    inputTglSampai.value =
      localStorage.getItem(LOCAL_STORAGE.BY_DATE_SAMPAI) || "";
    inputTglSampai.addEventListener("change", function () {
      localStorage.setItem(LOCAL_STORAGE.BY_DATE_SAMPAI, this.value);
      console.log("By Date - Sampai:", this.value);
    });
  }

  if (runByDateBtn) {
    runByDateBtn.addEventListener("click", handlePemeriksaanByDate);
  }

  if (stopByDateBtn) {
    stopByDateBtn.addEventListener("click", () => {
      window.__byDateStop = true;
      appendPanelMessage("⏹️ Permintaan stop dikirim...");
    });
  }

  if (clearByDateLogBtn) {
    clearByDateLogBtn.addEventListener("click", clearByDateLog);
  }

  // ✅ NEW: tombol download log Excel
  if (downloadByDateLogBtn) {
    downloadByDateLogBtn.addEventListener("click", downloadByDateLogExcel);
  }

  // ------------------------------------------------------------
  // 6) Checkbox Mode Pemeriksaan by-date
  // ------------------------------------------------------------
  const byDateChkMulai = document.getElementById("byDateChkMulai");
  const byDateChkMandiri = document.getElementById("byDateChkMandiri");

  if (byDateChkMulai) {
    byDateChkMulai.checked =
      localStorage.getItem("by-date-chk-mulai") !== "false";
    byDateChkMulai.addEventListener("change", function () {
      localStorage.setItem("by-date-chk-mulai", String(this.checked));
    });
  }

  if (byDateChkMandiri) {
    byDateChkMandiri.checked =
      localStorage.getItem("by-date-chk-mandiri") !== "false";
    byDateChkMandiri.addEventListener("change", function () {
      localStorage.setItem("by-date-chk-mandiri", String(this.checked));
      // Sync ke run-setting.pemeriksaan.mandiri
      const currentData = getRunSettingData();
      currentData.pemeriksaan.mandiri = this.checked;
      saveRunSettingData(currentData);
    });
  }

  // ------------------------------------------------------------
  // 7) Source tab (radio) by-date
  // ------------------------------------------------------------
  const srcBelum = document.getElementById("srcBelum");
  const srcSedang = document.getElementById("srcSedang");
  [srcBelum, srcSedang].forEach((radio) => {
    if (!radio) return;
    radio.addEventListener("change", function () {
      if (this.checked) {
        localStorage.setItem("by-date-source", this.value);
      }
    });
  });
});

// ==================== MODE SWITCHING ====================
function switchMode(mode) {
  currentMode = mode;
  console.log(`Mode berpindah ke: ${currentMode}`);
  loadDataTable(mode);
  if (mode === REGISTRATION_MODES.INDIVIDUAL) {
    populateTanggalPemeriksaan();
  }
}

// ==================== TANGGAL PEMERIKSAAN ====================
function populateTanggalPemeriksaan() {
  const selectEl = document.getElementById("tanggal_pemeriksaan_individu");
  if (!selectEl) return;

  const options = [];
  for (let i = 1; i <= 31; i++) {
    options.push(`<option value="${i}">${i}</option>`);
  }
  selectEl.innerHTML = options.join("");

  let savedTanggal = localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN);
  if (!savedTanggal) {
    savedTanggal = String(new Date().getDate());
    localStorage.setItem(LOCAL_STORAGE.TGL_PEMERIKSAAN, savedTanggal);
  }
  selectEl.value = savedTanggal;

  selectEl.addEventListener("change", function () {
    localStorage.setItem(LOCAL_STORAGE.TGL_PEMERIKSAAN, this.value);
    console.log("Tanggal pemeriksaan disimpan:", this.value);
  });
}

// ==================== LOAD DATA TABLE ====================
function loadDataTable(mode = REGISTRATION_MODES.INDIVIDUAL) {
  const theData = getAktifData();
  const tbodyId =
    mode === REGISTRATION_MODES.SCHOOL
      ? "tBodyAktifDataSekolah"
      : "tBodyAktifDataIndividu";
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  tbody.innerHTML = "";
  theData.forEach((item) => {
    const btnId = `dropdownMenuButton-${item.no}`;
    const tr = document.createElement("tr");
    tr.dataset.id = item.no;

    let cellValid = `<td class="text-center"><span class="badge bg-success">Valid ✓</span></td>`;
    if (!item.is_valid) {
      tr.className = "table-danger";
      cellValid = `<td class="text-center"><span class="badge bg-danger">⚠️ Invalid</span></td>`;
    }

    const aksiHtml = `
      <td>
        <div class="dropdown">
          <button class="btn btn-sm btn-warning dropdown-toggle py-0 px-2" type="button"
                  id="${btnId}" data-bs-toggle="dropdown" aria-expanded="false">
            Aksi
          </button>
          <ul class="dropdown-menu shadow compact-menu" aria-labelledby="${btnId}">
            <li class="px-3 pt-1 pb-1 dropdown-header">
              <small class="text-muted d-block text-center">${item.nama}</small>
              <small class="text-muted d-block text-center" style="font-size: smaller;">${item.nik}</small>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger action-trigger py-1" data-action="invalid" href="#">⚠️ Tandai Tidak Valid</a></li>
            <li><a class="dropdown-item text-success action-trigger py-1" data-action="clear-status" href="#">🔄 Bersihkan Status</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="run" data-field="pendaftaran" href="#">⚡ Run Pendaftaran</a></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="run" data-field="kehadiran" href="#">⚡ Run Kehadiran</a></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="run" data-field="pemeriksaan" href="#">⚡ Run Pemeriksaan</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="status" data-field="pendaftaran" data-val="OK" href="#">✓ Pendaftaran OK</a></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="status" data-field="kehadiran" data-val="OK" href="#">✓ Kehadiran OK</a></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="status" data-field="pemeriksaan" data-val="OK" href="#">✓ Pemeriksaan OK</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="status" data-field="pendaftaran" data-val="MANUAL" href="#">✎ Pendaftaran Manual</a></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="status" data-field="kehadiran" data-val="MANUAL" href="#">✎ Kehadiran Manual</a></li>
            <li><a class="dropdown-item action-trigger py-1" data-action="status" data-field="pemeriksaan" data-val="MANUAL" href="#">✎ Pemeriksaan Manual</a></li>
          </ul>
        </div>
      </td>
    `;

    let dataHtml = "";
    if (mode === REGISTRATION_MODES.SCHOOL) {
      dataHtml = `
        ${aksiHtml}
        ${cellValid}
        <td>${item.no}</td>
        <td>${item.nik}</td>
        <td>${item.nama}</td>
        <td>${item.nama_sekolah || "-"}</td>
        <td>${item.jenjang_pendidikan || "-"}</td>
        <td>${item.tgl_lahir}</td>
        <td>${item.jenis_kelamin}</td>
        <td>${item.status_usia}</td>
        <td>${item.status_input}</td>
        <td>${item.pendaftaran}</td>
        <td>${item.kehadiran}</td>
        <td>${item.pemeriksaan}</td>
        <td>${item.pemeriksaan_mandiri}</td>
        <td>${item.rapor}</td>
        <td>${item.keterangan}</td>
      `;
    } else {
      dataHtml = `
        ${aksiHtml}
        ${cellValid}
        <td>${item.no}</td>
        <td>${item.nik}</td>
        <td>${item.nama}</td>
        <td>${item.tgl_lahir}</td>
        <td>${item.jenis_kelamin}</td>
        <td>${item.status_usia}</td>
        <td>${item.status_input}</td>
        <td>${item.pendaftaran}</td>
        <td>${item.kehadiran}</td>
        <td>${item.pemeriksaan}</td>
        <td>${item.pemeriksaan_mandiri}</td>
        <td>${item.rapor}</td>
        <td>${item.keterangan}</td>
      `;
    }

    tr.innerHTML = dataHtml;
    tbody.appendChild(tr);

    tr.addEventListener("click", (e) => {
      const trigger = e.target.closest(".action-trigger");
      if (!trigger) return;

      e.preventDefault();
      const action = trigger.dataset.action;

      if (action === "invalid") {
        tandaiTidakValid(item.no);
      } else if (action === "run") {
        const field = trigger.dataset.field;
        runOneByOne(item.no, field);
      } else if (action === "status") {
        const field = trigger.dataset.field;
        const val = trigger.dataset.val;
        tandaiStatus(item.no, field, val);
      } else if (action === "clear-status") {
        clearStatus(item.no);
      }
    });
  });
}

// ==================== FUNGSI RINGKASAN ====================
function summarizeColumn(colName) {
  const aktifData = getAktifData();
  const counts = {};
  aktifData.forEach((row) => {
    let val = row[colName] || "(Kosong)";
    counts[val] = (counts[val] || 0) + 1;
  });
  const total = aktifData.length;
  return Object.entries(counts).map(([val, count]) => ({
    value: val,
    count,
    percent: ((count / total) * 100).toFixed(2) + "%",
  }));
}

function renderSummary() {
  const container = document.getElementById("summary");
  if (!container) return;

  container.innerHTML = "";
  const cols = [
    "status_input",
    "status_usia",
    "keterangan",
    "pendaftaran",
    "kehadiran",
    "pemeriksaan",
    "pemeriksaan_mandiri",
    "rapor",
  ];

  cols.forEach((col) => {
    const summary = summarizeColumn(col);
    let table = `
      <b class="mt-2 text-capitalize">${col}</b>
      <table class="table table-bordered table-sm">
        <thead class="table-light">
          <tr>
            <th>Kategori</th>
            <th>Jumlah</th>
            <th>Persen</th>
          </tr>
        </thead>
        <tbody>
          ${summary
            .map(
              (s) => `
            <tr>
              <td>${s.value}</td>
              <td>${s.count}</td>
              <td>${s.percent}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
    `;
    container.innerHTML += table;
  });
}

// ==================== FUNGSI AKSI DATA ====================
function tandaiTidakValid(no) {
  const aktifData = getAktifData();
  const find = aktifData.find((it) => it.no == no);
  if (find) {
    find.is_valid = false;
    find.keterangan = "Ditandai Tidak Valid";
    saveAktifData(aktifData);
    loadDataTable(currentMode);
  } else {
    showErrorSwal(`Nomor ${no} tidak ditemukan!`);
  }
}

function clearStatus(no) {
  const aktifData = getAktifData();
  const find = aktifData.find((it) => it.no == no);
  if (find) {
    find.is_valid = true;
    find.pendaftaran = "";
    find.kehadiran = "";
    find.pemeriksaan = "";
    find.pemeriksaan_mandiri = "";
    find.keterangan = "";
    saveAktifData(aktifData);
    loadDataTable(currentMode);
  } else {
    showErrorSwal(`Nomor ${no} tidak ditemukan!`);
  }
}

function tandaiStatus(no, key, status) {
  const aktifData = getAktifData();
  const find = aktifData.find((it) => it.no == no);
  if (find) {
    find[key] = status;
    saveAktifData(aktifData);
    loadDataTable(currentMode);
  } else {
    showErrorSwal(`Nomor ${no} tidak ditemukan!`);
  }
}

// ==================== INISIALISASI RUN SETTING ====================
function initRunSetting() {
  const currentData = getRunSettingData();

  document.querySelectorAll(".main-chk").forEach((input) => {
    const field = input.getAttribute("data-field");
    input.checked = !!currentData[field];
  });

  document.querySelectorAll(".sub-chk").forEach((input) => {
    const subField = input.getAttribute("data-subfield");
    input.checked = !!currentData.pemeriksaan[subField];
  });

  function updatePemeriksaanParentStatus() {
    const parentInput = document.getElementById("chkPemeriksaan");
    const subGroup = document.getElementById("subPemeriksaanGroup");
    if (!parentInput || !subGroup) return;
    const hasActiveChild = Object.values(currentData.pemeriksaan).some(
      (value) => value === true,
    );
    parentInput.checked = hasActiveChild;
    subGroup.style.display = hasActiveChild ? "block" : "none";
  }
  updatePemeriksaanParentStatus();

  document.querySelectorAll(".main-chk").forEach((input) => {
    input.addEventListener("change", function () {
      const field = this.getAttribute("data-field");
      currentData[field] = this.checked;
      saveRunSettingData(currentData);
    });
  });

  const parentInput = document.getElementById("chkPemeriksaan");
  if (parentInput) {
    parentInput.addEventListener("change", function () {
      const isChecked = this.checked;
      Object.keys(currentData.pemeriksaan).forEach((key) => {
        currentData.pemeriksaan[key] = isChecked;
      });
      document.querySelectorAll(".sub-chk").forEach((input) => {
        input.checked = isChecked;
      });
      updatePemeriksaanParentStatus();
      saveRunSettingData(currentData);
    });
  }

  document.querySelectorAll(".sub-chk").forEach((input) => {
    input.addEventListener("change", function () {
      const subField = this.getAttribute("data-subfield");
      currentData.pemeriksaan[subField] = this.checked;
      updatePemeriksaanParentStatus();
      saveRunSettingData(currentData);
    });
  });
}

// ==================== RUN SATU DATA ====================
async function runOneByOne(no, key) {
  const aktifData = getAktifData();
  const index = aktifData.findIndex((it) => it.no == no);
  if (index !== -1) {
    const mode = currentMode;
    let iData = { ...aktifData[index] };

    try {
      if (key == "pendaftaran") {
        iData = await runPendaftaran(iData, mode);
      } else if (key == "kehadiran") {
        iData = await runKehadiran(iData, mode);
      } else if (key == "pemeriksaan") {
        const config = getRunSettingData();
        const defDataPemeriksaan = getDefaultPemeriksaanData();
        iData = await runCheckPemeriksaan(
          config,
          iData,
          defDataPemeriksaan,
          true,
          mode,
        );
      }
    } catch (err) {
      console.error(`Error pada aksi ${key} untuk data ${no}:`, err);
      iData.keterangan = `Error ${key}: ${err.message || String(err)}`;
    }

    aktifData[index] = iData;
    saveAktifData(aktifData);
    loadDataTable(mode);
  } else {
    showErrorSwal(`Nomor ${no} tidak ditemukan!`);
  }
}

// ==================== PROSES OTOMASI UTAMA ====================
function runProcess() {
  const runSetData = getRunSettingData();

  if (
    !runSetData.pendaftaran &&
    !runSetData.kehadiran &&
    !runSetData.pemeriksaan &&
    !runSetData.rapor
  ) {
    Swal.fire({
      title: "Info",
      text: "Silakan pilih minimal satu modul untuk dijalankan.",
      icon: "info",
    });
    return;
  }
  executeOtomasiProses(runSetData, currentMode);
}

async function executeOtomasiProses(
  config,
  mode = REGISTRATION_MODES.INDIVIDUAL,
) {
  showPanelMessage(`Persiapan pengisian data!`);
  showLoading();

  const defDataPemeriksaan = getDefaultPemeriksaanData();
  const listData = getAktifData();

  function updateRow(index, data) {
    listData[index] = data;
    saveAktifData(listData);
    loadDataTable(mode);
  }

  for (let i = 0; i < listData.length; i++) {
    let iData = { ...listData[i] };
    if (!iData.is_valid) continue;

    const tbodyId =
      mode === REGISTRATION_MODES.SCHOOL
        ? "tBodyAktifDataSekolah"
        : "tBodyAktifDataIndividu";
    const tr = document.querySelector(`#${tbodyId} tr[data-id="${iData.no}"]`);
    if (tr) tr.classList.add("table-primary");

    try {
      if (config.pendaftaran && !skipStatus(iData.pendaftaran)) {
        iData = await runPendaftaran(iData, mode);
        updateRow(i, iData);
      }

      if (
        config.kehadiran &&
        allowNextProcess(iData.pendaftaran) &&
        !skipStatus(iData.kehadiran)
      ) {
        iData = await runKehadiran(iData, mode);
        updateRow(i, iData);
      }

      if (
        config.pemeriksaan &&
        allowNextProcess(iData.pendaftaran) &&
        allowNextProcess(iData.kehadiran)
      ) {
        iData = await runCheckPemeriksaan(
          config,
          iData,
          defDataPemeriksaan,
          false,
          mode,
        );
        updateRow(i, iData);
      }
    } catch (err) {
      console.error(`Error pada data ${iData.no}:`, err);
      iData.keterangan = `Error: ${err.message || String(err)}`;
      updateRow(i, iData);
    }

    if (tr) tr.classList.remove("table-primary");
  }

  hideLoading();
  showPanelMessage(`Pengisian Data Selesai!`);
  showPanelMessage("");
}

// ==================== PEMERIKSAAN CHECK ====================
async function runCheckPemeriksaan(
  config,
  iData,
  defDataPemeriksaan,
  ignoreStatus = false,
  mode = REGISTRATION_MODES.INDIVIDUAL,
) {
  let eData = iData;
  const shouldRun = (status) => ignoreStatus || !skipStatus(status);
  const needRunPemeriksaan = Object.values(config.pemeriksaan ?? {}).some(
    Boolean,
  );

  try {
    if (needRunPemeriksaan) {
      eData = await runPemeriksaan(eData, mode);
    }

    if (
      config.pemeriksaan?.mandiri &&
      allowNextProcess(eData.pemeriksaan) &&
      shouldRun(eData.pemeriksaan_mandiri)
    ) {
      eData = await runPemeriksaanMandiri(eData, mode);
    }
  } catch (err) {
    console.error("Error pada runCheckPemeriksaan:", err);
    eData.keterangan = `Error pemeriksaan: ${err.message || String(err)}`;
    eData.pemeriksaan = "GAGAL";
  }

  return eData;
}

// ==================== ✅ PEMERIKSAAN BY DATE ====================
async function handlePemeriksaanByDate() {
  const tglDari = localStorage.getItem(LOCAL_STORAGE.BY_DATE_DARI) || "";
  const tglSampai = localStorage.getItem(LOCAL_STORAGE.BY_DATE_SAMPAI) || "";

  // ------------------------------------------------------------
  // ✅ Validasi wajib (tanggal akan diteruskan ke robot)
  // ------------------------------------------------------------
  if (!tglDari || !tglSampai) {
    Swal.fire({
      icon: "warning",
      title: "Tanggal belum diisi",
      text: "Isi dulu 'Catatan Dari' dan 'Catatan Sampai' sebelum menjalankan.",
    });
    return;
  }

  if (new Date(tglDari) > new Date(tglSampai)) {
    Swal.fire({
      icon: "warning",
      title: "Rentang tidak valid",
      text: "'Dari' tidak boleh lebih besar dari 'Sampai'.",
    });
    return;
  }

  // ------------------------------------------------------------
  // Ambil opsi dari checkbox by-date
  // ------------------------------------------------------------
  const chkMulai = document.getElementById("byDateChkMulai");
  const chkMandiri = document.getElementById("byDateChkMandiri");
  const optMulai = chkMulai ? chkMulai.checked : true;
  const optMandiri = chkMandiri ? chkMandiri.checked : true;

  const srcChecked =
    document.querySelector('input[name="byDateSource"]:checked');
  const sourceTab = srcChecked ? srcChecked.value : "Belum Pemeriksaan";

  // ------------------------------------------------------------
  // Info ke dialog konfirmasi
  // ------------------------------------------------------------
  const infoTgl = `
    <br>
    <div style="background:#e8f5f7;padding:8px 12px;border-radius:6px;margin-top:8px">
      📅 <b>Filter:</b> ${tglDari} s/d ${tglSampai}<br>
      📋 <b>Sumber tab:</b> ${sourceTab}<br>
      🩺 <b>Mulai Pemeriksaan:</b> ${optMulai ? "✅" : "❌"}<br>
      📝 <b>Isi Form Mandiri:</b> ${optMandiri ? "✅" : "❌"}
    </div>
  `;

  const confirm = await Swal.fire({
    title: "Pemeriksaan by Date",
    html: `
      <div style="text-align:left;font-size:0.9rem">
        <p>Robot akan memproses <b>semua peserta</b> di halaman pelayanan (sesuai filter tanggal yang sudah Anda set di web sehat), satu per satu, secara otomatis.</p>
        <ul style="margin:0.5rem 0;padding-left:1.2rem">
          <li>Pastikan sudah buka <code>ckg-pelayanan</code></li>
          <li>Pastikan filter tanggal sudah di-set</li>
          <li>Tab default = "Belum Pemeriksaan"</li>
        </ul>
        ${infoTgl}
      </div>
    `,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Jalankan",
    cancelButtonText: "Batal",
    confirmButtonColor: "#8b5cf6",
  });

  if (!confirm.isConfirmed) return;

  // ------------------------------------------------------------
  // Cek fungsi tersedia
  // ------------------------------------------------------------
  if (typeof runPemeriksaanByDate !== "function") {
    showErrorSwal(
      "Fungsi runPemeriksaanByDate tidak ditemukan. Pastikan file robot-pemeriksaan-by-date.js sudah dimuat.",
    );
    return;
  }

  // Reset flag stop + log
  window.__byDateStop = false;

  showLoading();
  const stopBtn = document.getElementById("stopByDateBtn");
  if (stopBtn) stopBtn.classList.remove("d-none");

  showPanelMessage("📅 Memulai Pemeriksaan by Date (auto loop)...");
  clearByDateLog();

  try {
    // ✅ Kirim filter + opsi ke robot
    const result = await runPemeriksaanByDate(currentMode, {
      dari: tglDari,
      sampai: tglSampai,
      sourceTab,
      mulai: optMulai,
      mandiri: optMandiri,
    });

    hideLoading();
    if (stopBtn) stopBtn.classList.add("d-none");

    if (result && result.stats) {
      const s = result.stats;
      appendPanelMessage(
        `\n📊 Selesai — Diproses: ${s.processed}, Skip: ${s.skipped}, Gagal: ${s.failed}`,
      );

      if (s.errors && s.errors.length > 0) {
        appendPanelMessage(
          `\n⚠️ Error detail (max 5):\n${s.errors.slice(0, 5).join("\n")}`,
        );
      }

      Swal.fire({
        title: "Selesai!",
        html: `
          <div style="text-align:left">
            <p><b>Hasil Akhir:</b></p>
            <ul style="padding-left:1.2rem;margin:0">
              <li>Berhasil diproses: <b>${s.processed}</b></li>
              <li>Skip (sudah diproses): <b>${s.skipped}</b></li>
              <li>Gagal: <b>${s.failed}</b></li>
            </ul>
            <p style="margin-top:12px;font-size:0.85rem;color:#6b7280">
              💡 Klik "Download Excel" di panel untuk simpan log sebagai dokumentasi.
            </p>
          </div>
        `,
        icon: s.failed === 0 ? "success" : "warning",
      });
    } else {
      Swal.fire({
        title: "Selesai",
        text: result?.message || "Proses selesai.",
        icon: "info",
      });
    }
  } catch (err) {
    hideLoading();
    if (stopBtn) stopBtn.classList.add("d-none");
    console.error("Error di handlePemeriksaanByDate:", err);
    showErrorSwal(`Error: ${err.message}`);
  }
}

// ==================== ✅ BY-DATE LOG TABLE ====================
function appendByDateLog({ nama, tglLahir, tiket, status, keterangan }) {
  const tbody = document.getElementById("byDateLogBody");
  const counter = document.getElementById("byDateLogCounter");
  if (!tbody) return;

  const idx = byDateLogEntries.length + 1;
  const now = new Date();
  const waktu = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // ✅ Simpan ke buffer untuk export Excel
  byDateLogEntries.push({
    no: idx,
    nama: nama || "",
    tglLahir: tglLahir || "",
    tiket: tiket || "",
    status: status || "",
    keterangan: keterangan || "",
    tanggalJam: now.toLocaleString("id-ID"),
  });

  let badge = `<span class="badge bg-secondary">${status}</span>`;
  let rowClass = "";
  if (status === "OK") {
    badge = `<span class="badge bg-success">OK</span>`;
    rowClass = "log-row-ok";
  } else if (status === "SKIP") {
    badge = `<span class="badge bg-info text-dark">SKIP</span>`;
    rowClass = "log-row-skip";
  } else if (status === "GAGAL" || status === "FAIL") {
    badge = `<span class="badge bg-danger">GAGAL</span>`;
    rowClass = "log-row-fail";
  } else if (status === "WARN") {
    badge = `<span class="badge bg-warning text-dark">WARN</span>`;
    rowClass = "log-row-warn";
  }

  const tr = document.createElement("tr");
  if (rowClass) tr.className = rowClass;
  tr.innerHTML = `
    <td>${idx}</td>
    <td>${nama || "-"}</td>
    <td>${tglLahir || "-"}</td>
    <td>${tiket || "-"}</td>
    <td class="text-center">${badge}</td>
    <td>${keterangan || "-"}</td>
    <td>${waktu}</td>
  `;
  tbody.appendChild(tr);
  tr.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (counter) counter.textContent = String(idx);
}

function clearByDateLog() {
  const tbody = document.getElementById("byDateLogBody");
  const counter = document.getElementById("byDateLogCounter");
  if (tbody) tbody.innerHTML = "";
  if (counter) counter.textContent = "0";
  byDateLogEntries = []; // ✅ reset buffer juga
}

// ==================== ✅ DOWNLOAD LOG EXCEL ====================
function downloadByDateLogExcel() {
  if (byDateLogEntries.length === 0) {
    Swal.fire({
      icon: "info",
      title: "Log kosong",
      text: "Belum ada log untuk diunduh.",
    });
    return;
  }

  if (typeof XLSX === "undefined") {
    showErrorSwal(
      "Library XLSX tidak tersedia. Tambahkan <script src='lib/xlsx.full.min.js'></script> di panel.html.",
    );
    return;
  }

  // Bangun rows — kolom rapi
  const rows = byDateLogEntries.map((e) => ({
    No: e.no,
    Nama: e.nama,
    "Tgl Lahir": e.tglLahir,
    Tiket: e.tiket,
    Status: e.status,
    Keterangan: e.keterangan,
    "Tanggal & Jam": e.tanggalJam,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Atur lebar kolom biar rapi
  ws["!cols"] = [
    { wch: 5 }, // No
    { wch: 25 }, // Nama
    { wch: 15 }, // Tgl Lahir
    { wch: 15 }, // Tiket
    { wch: 10 }, // Status
    { wch: 45 }, // Keterangan
    { wch: 20 }, // Tanggal & Jam
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Log By Date");

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  XLSX.writeFile(wb, `CKG-ByDate-Log_${stamp}.xlsx`);

  console.log(
    `%c[EXPORT]%c Log By Date (${byDateLogEntries.length} baris) → Excel`,
    "background:#0f8a5f;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700",
    "color:#0f8a5f;font-weight:600",
  );
}

// ==================== EXPOSE KE GLOBAL (untuk robot by-date) ====================
window.appendByDateLog = appendByDateLog;
window.clearByDateLog = clearByDateLog;