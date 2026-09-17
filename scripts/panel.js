// ==================== GLOBAL STATE ====================
let currentMode = REGISTRATION_MODES.INDIVIDUAL;
let byDateLogEntries = []; // ✅ buffer untuk export Excel

// ✅ NEW: Map untuk lookup index asli (setelah delete/re-render)
window.__byDateLogData = byDateLogEntries;

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

  const chkMulai = document.getElementById("byDateChkMulai");
  const chkMandiri = document.getElementById("byDateChkMandiri");
  const optMulai = chkMulai ? chkMulai.checked : true;
  const optMandiri = chkMandiri ? chkMandiri.checked : true;

  const srcChecked = document.querySelector(
    'input[name="byDateSource"]:checked',
  );
  const sourceTab = srcChecked ? srcChecked.value : "Belum Pemeriksaan";

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

  if (typeof runPemeriksaanByDate !== "function") {
    showErrorSwal(
      "Fungsi runPemeriksaanByDate tidak ditemukan. Pastikan file robot-pemeriksaan-by-date.js sudah dimuat.",
    );
    return;
  }

  // ✅ Simpan mode & sourceTab global untuk log & retry
  window.__byDateCurrentMode = currentMode;
  window.__byDateSourceTab = sourceTab;
  window.__byDateStop = false;

  showLoading();
  const stopBtn = document.getElementById("stopByDateBtn");
  if (stopBtn) stopBtn.classList.remove("d-none");

  showPanelMessage("📅 Memulai Pemeriksaan by Date (auto loop)...");
  clearByDateLog();

  try {
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

// ==================== ✅ BY-DATE LOG TABLE (AKSI DI PALING AWAL) ====================
function appendByDateLog(entry) {
  const tbody = document.getElementById("byDateLogBody");
  const counter = document.getElementById("byDateLogCounter");
  if (!tbody) return;

  // ✅ Entry lengkap dengan timestamp + mode + sourceTab
  const logEntry = {
    no: byDateLogEntries.length + 1,
    nama: entry.nama || "-",
    tglLahir: entry.tglLahir || "-",
    tiket: entry.tiket || "-",
    status: entry.status || "WARN",
    keterangan: entry.keterangan || "-",
    mode: entry.mode || window.__byDateCurrentMode || "individual",
    sourceTab: entry.sourceTab || window.__byDateSourceTab || "Belum Pemeriksaan",
    tanggalJam: new Date().toLocaleString("id-ID"),
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  byDateLogEntries.push(logEntry);

  const tr = document.createElement("tr");
  tr.dataset.index = String(logEntry.no - 1);
  tr.dataset.status = logEntry.status;

  // Row color
  if (logEntry.status === "OK") tr.className = "log-row-ok";
  else if (logEntry.status === "SKIP") tr.className = "log-row-skip";
  else if (logEntry.status === "WARN") tr.className = "log-row-warn";
  else if (logEntry.status === "GAGAL" || logEntry.status === "ERROR")
    tr.className = "log-row-fail";

  const badge = getStatusBadgeHTML(logEntry.status);
  const waktu = formatTimeShort(logEntry.timestamp);
  const idx = logEntry.no - 1;

  // ✅ Kolom Aksi di PALING AWAL
  tr.innerHTML = `
    <td class="text-center">${renderAksiDropdownHTML(logEntry, idx)}</td>
    <td class="text-muted">${logEntry.no}</td>
    <td>${escapeHTML(logEntry.nama)}</td>
    <td>${escapeHTML(logEntry.tglLahir)}</td>
    <td><code style="font-size:0.72rem">${escapeHTML(logEntry.tiket)}</code></td>
    <td class="text-center">${badge}</td>
    <td class="small">${escapeHTML(logEntry.keterangan)}</td>
    <td class="text-muted small">${waktu}</td>
  `;

  tbody.appendChild(tr);
  tr.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (counter) counter.textContent = String(byDateLogEntries.length);
}

// ==================== RENDER AKSI DROPDOWN (BOOTSTRAP) ====================
function renderAksiDropdownHTML(entry, idx) {
  const isDone = entry.status === "OK";
  const isSkip = entry.status === "SKIP";
  const disableRetry = isDone || isSkip;

  const btnId = `logAksiBtn-${idx}`;

  return `
    <div class="dropdown">
      <button class="btn btn-sm btn-warning dropdown-toggle py-0 px-2"
              type="button"
              id="${btnId}"
              data-bs-toggle="dropdown"
              data-bs-boundary="viewport"
              aria-expanded="false"
              style="font-size:0.68rem;font-weight:700">
        Aksi
      </button>
      <ul class="dropdown-menu shadow compact-menu" aria-labelledby="${btnId}" style="font-size:0.76rem">
        <li class="px-3 pt-1 pb-1 dropdown-header">
          <small class="text-muted d-block text-center">${escapeHTML(entry.nama)}</small>
          <small class="text-muted d-block text-center" style="font-size:smaller">${escapeHTML(entry.tiket)}</small>
        </li>
        <li><hr class="dropdown-divider"></li>
        <li>
          <a class="dropdown-item py-1 action-log-trigger ${disableRetry ? "disabled" : ""}"
             data-action="retry" data-index="${idx}" href="#"
             style="${disableRetry ? "pointer-events:none;opacity:0.5" : ""}">
            🔄 Retry Peserta
          </a>
        </li>
        <li>
          <a class="dropdown-item py-1 action-log-trigger" data-action="detail" data-index="${idx}" href="#">
            👁 Lihat Detail
          </a>
        </li>
        <li>
          <a class="dropdown-item py-1 action-log-trigger" data-action="copy" data-index="${idx}" href="#">
            📋 Copy Data
          </a>
        </li>
        <li><hr class="dropdown-divider"></li>
        <li>
          <a class="dropdown-item py-1 text-danger action-log-trigger" data-action="delete" data-index="${idx}" href="#">
            🗑 Hapus dari Log
          </a>
        </li>
      </ul>
    </div>
  `;
}

// ==================== EVENT DELEGATION UNTUK AKSI LOG ====================
document.addEventListener("click", async (e) => {
  const trigger = e.target.closest(".action-log-trigger");
  if (!trigger) return;
  e.preventDefault();

  const action = trigger.dataset.action;
  const idx = parseInt(trigger.dataset.index, 10);
  if (isNaN(idx)) return;

  if (action === "retry") await handleRetryFromLog(idx);
  else if (action === "detail") handleViewDetailLog(idx);
  else if (action === "copy") handleCopyLog(idx);
  else if (action === "delete") handleDeleteLog(idx);
});

// ==================== HANDLER: RETRY ====================
async function handleRetryFromLog(idx) {
  const entry = byDateLogEntries[idx];
  if (!entry) return;

  if (typeof retryByDateSingle !== "function") {
    Swal.fire({
      icon: "error",
      title: "Retry tidak tersedia",
      text: "Fungsi retryByDateSingle tidak ditemukan.",
    });
    return;
  }

  const confirm = await Swal.fire({
    icon: "question",
    title: "Retry peserta ini?",
    html: `
      <div style="text-align:left;font-size:0.9rem">
        <p style="margin:4px 0"><b>Nama:</b> ${escapeHTML(entry.nama)}</p>
        <p style="margin:4px 0"><b>Tgl Lahir:</b> ${escapeHTML(entry.tglLahir)}</p>
        <p style="margin:4px 0"><b>Tiket:</b> ${escapeHTML(entry.tiket)}</p>
        <p style="margin:4px 0"><b>Status sebelumnya:</b> ${getStatusBadgeHTML(entry.status)}</p>
        <p style="margin:4px 0;color:#64748b;font-size:0.85rem"><b>Keterangan:</b> ${escapeHTML(entry.keterangan)}</p>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Ya, Retry",
    cancelButtonText: "Batal",
    confirmButtonColor: "#0f7f8c",
  });
  if (!confirm.isConfirmed) return;

  appendPanelMessage(`\n🔄 Retry: ${entry.nama} (${entry.tiket})`);
  showLoading();

  try {
    const result = await retryByDateSingle(
      {
        nama: entry.nama,
        tglLahir: entry.tglLahir,
        tiket: entry.tiket,
      },
      entry.mode || "individual",
      {
        mandiri: true,
        sourceTab: entry.sourceTab || "Belum Pemeriksaan",
      },
    );

    hideLoading();

    // Log hasil retry sebagai baris baru
    appendByDateLog({
      nama: entry.nama,
      tglLahir: entry.tglLahir,
      tiket: entry.tiket,
      status: result.success ? "OK" : "GAGAL",
      keterangan: `[Retry] ${result.message || "(no message)"}`,
      mode: entry.mode,
      sourceTab: entry.sourceTab,
      timestamp: new Date().toISOString(),
    });

    // ✅ Update baris lama jadi "diretry" — Aksi sekarang di children[0]
    const oldRow = document.querySelector(
      `#byDateLogBody tr[data-index="${idx}"]`,
    );
    if (oldRow) {
      const aksiCell = oldRow.children[0]; // ← KOLOM PALING AWAL
      if (aksiCell) {
        aksiCell.innerHTML = `<span style="color:#64748b;font-size:0.72rem;font-style:italic">↻ diretry</span>`;
      }
    }

    Swal.fire({
      icon: result.success ? "success" : "warning",
      title: result.success ? "Retry berhasil" : "Retry gagal",
      text: result.message || "-",
      timer: 2500,
      showConfirmButton: false,
    });
  } catch (err) {
    hideLoading();
    console.error("[RETRY] Error:", err);
    appendByDateLog({
      nama: entry.nama,
      tglLahir: entry.tglLahir,
      tiket: entry.tiket,
      status: "ERROR",
      keterangan: `[Retry] Error: ${err.message}`,
      mode: entry.mode,
      sourceTab: entry.sourceTab,
      timestamp: new Date().toISOString(),
    });
    Swal.fire({ icon: "error", title: "Retry error", text: err.message });
  }
}

// ==================== HANDLER: LIHAT DETAIL ====================
function handleViewDetailLog(idx) {
  const entry = byDateLogEntries[idx];
  if (!entry) return;

  Swal.fire({
    title: "Detail Log",
    html: `
      <div style="text-align:left;font-size:0.88rem">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#64748b;width:120px">Nama</td><td><b>${escapeHTML(entry.nama)}</b></td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Tgl Lahir</td><td>${escapeHTML(entry.tglLahir)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Tiket</td><td><code>${escapeHTML(entry.tiket)}</code></td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Status</td><td>${getStatusBadgeHTML(entry.status)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Keterangan</td><td>${escapeHTML(entry.keterangan)}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Mode</td><td>${escapeHTML(entry.mode || "-")}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Source Tab</td><td>${escapeHTML(entry.sourceTab || "-")}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b">Waktu</td><td>${escapeHTML(entry.tanggalJam || "-")}</td></tr>
        </table>
      </div>
    `,
    icon: "info",
    confirmButtonText: "Tutup",
    confirmButtonColor: "#0f7f8c",
    width: 480,
  });
}

// ==================== HANDLER: COPY DATA ====================
async function handleCopyLog(idx) {
  const entry = byDateLogEntries[idx];
  if (!entry) return;

  const text = [
    `Nama: ${entry.nama || "-"}`,
    `Tgl Lahir: ${entry.tglLahir || "-"}`,
    `Tiket: ${entry.tiket || "-"}`,
    `Status: ${entry.status || "-"}`,
    `Keterangan: ${entry.keterangan || "-"}`,
    `Waktu: ${entry.tanggalJam || "-"}`,
  ].join("\n");

  try {
    await navigator.clipboard.writeText(text);
    Swal.fire({
      icon: "success",
      title: "Tersalin!",
      timer: 1200,
      showConfirmButton: false,
      toast: true,
      position: "top-end",
    });
  } catch (e) {
    Swal.fire({
      title: "Copy Manual",
      input: "textarea",
      inputValue: text,
      inputAttributes: { readonly: true },
      confirmButtonText: "Tutup",
    });
  }
}

// ==================== HANDLER: HAPUS LOG ====================
async function handleDeleteLog(idx) {
  const entry = byDateLogEntries[idx];
  if (!entry) return;

  const confirm = await Swal.fire({
    icon: "warning",
    title: "Hapus dari log?",
    html: `Baris <b>${escapeHTML(entry.nama)}</b> akan dihapus.`,
    showCancelButton: true,
    confirmButtonColor: "#dc2626",
    confirmButtonText: "Ya, Hapus",
    cancelButtonText: "Batal",
  });
  if (!confirm.isConfirmed) return;

  byDateLogEntries.splice(idx, 1);
  renderUlangLogTable();

  Swal.fire({
    icon: "success",
    title: "Terhapus",
    timer: 1000,
    showConfirmButton: false,
  });
}

// ==================== RE-RENDER LOG TABLE (AKSI DI PALING AWAL) ====================
function renderUlangLogTable() {
  const tbody = document.getElementById("byDateLogBody");
  const counter = document.getElementById("byDateLogCounter");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!byDateLogEntries || byDateLogEntries.length === 0) {
    if (counter) counter.textContent = "0";
    return;
  }

  byDateLogEntries.forEach((entry, i) => {
    entry.no = i + 1; // renumber

    const tr = document.createElement("tr");
    tr.dataset.index = String(i);
    tr.dataset.status = entry.status || "";

    if (entry.status === "OK") tr.className = "log-row-ok";
    else if (entry.status === "SKIP") tr.className = "log-row-skip";
    else if (entry.status === "WARN") tr.className = "log-row-warn";
    else if (entry.status === "GAGAL" || entry.status === "ERROR")
      tr.className = "log-row-fail";

    const badge = getStatusBadgeHTML(entry.status);
    const waktu = formatTimeShort(entry.timestamp);

    // ✅ Kolom Aksi di PALING AWAL
    tr.innerHTML = `
      <td class="text-center">${renderAksiDropdownHTML(entry, i)}</td>
      <td class="text-muted">${entry.no}</td>
      <td>${escapeHTML(entry.nama)}</td>
      <td>${escapeHTML(entry.tglLahir)}</td>
      <td><code style="font-size:0.72rem">${escapeHTML(entry.tiket)}</code></td>
      <td class="text-center">${badge}</td>
      <td class="small">${escapeHTML(entry.keterangan)}</td>
      <td class="text-muted small">${waktu}</td>
    `;
    tbody.appendChild(tr);
  });

  if (counter) counter.textContent = String(byDateLogEntries.length);
}

// ==================== UTILITY: BADGE STATUS ====================
function getStatusBadgeHTML(status) {
  const s = String(status || "").toUpperCase();
  if (s === "OK") return `<span class="badge bg-success">OK</span>`;
  if (s === "SKIP") return `<span class="badge bg-info text-dark">SKIP</span>`;
  if (s === "WARN") return `<span class="badge bg-warning text-dark">WARN</span>`;
  if (s === "GAGAL" || s === "FAIL") return `<span class="badge bg-danger">GAGAL</span>`;
  if (s === "ERROR") return `<span class="badge bg-danger">ERROR</span>`;
  return `<span class="badge bg-secondary">${escapeHTML(s || "-")}</span>`;
}

// ==================== UTILITY: ESCAPE HTML ====================
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==================== UTILITY: FORMAT WAKTU ====================
function formatTimeShort(isoString) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}.${mm}.${ss}`;
  } catch (e) {
    return "-";
  }
}

// ==================== CLEAR LOG ====================
function clearByDateLog() {
  const tbody = document.getElementById("byDateLogBody");
  const counter = document.getElementById("byDateLogCounter");
  if (tbody) tbody.innerHTML = "";
  if (counter) counter.textContent = "0";
  byDateLogEntries = [];
  window.__byDateLogData = byDateLogEntries;
}

// ==================== DOWNLOAD LOG EXCEL ====================
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
  ws["!cols"] = [
    { wch: 5 },
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
    { wch: 45 },
    { wch: 20 },
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
window.handleRetryFromLog = handleRetryFromLog;