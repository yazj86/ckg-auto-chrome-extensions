// ==================== GLOBAL STATE ====================
let currentMode = REGISTRATION_MODES.INDIVIDUAL;

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
  const url = chrome.runtime.getURL(
    mode === REGISTRATION_MODES.SCHOOL
      ? "data-preparation-sekolah.html"
      : "data-preparation-individu.html",
  );

  try {
    const tabs = await chrome.tabs.query({ url });
    if (tabs.length > 0) {
      // Jika sudah ada, fokuskan ke tab tersebut
      const tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } else {
      // Jika belum ada, buka tab baru
      await chrome.tabs.create({ url });
    }
  } catch (err) {
    console.error("Gagal membuka halaman persiapan data:", err);
    showErrorSwal("Gagal membuka halaman persiapan data.");
  }
}

// ==================== EVENT LISTENERS: OPEN DATA PREPARATION ====================
document
  .getElementById("openDataPreparationIndividu")
  .addEventListener("click", () => {
    openDataPreparation(REGISTRATION_MODES.INDIVIDU);
  });

document
  .getElementById("openDataPreparationSekolah")
  .addEventListener("click", () => {
    openDataPreparation(REGISTRATION_MODES.SCHOOL);
  });

// ==================== DOM CONTENT LOADED ====================
document.addEventListener("DOMContentLoaded", () => {
  // Inisialisasi tanggal pemeriksaan untuk individu
  if (!localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN)) {
    const defaultTanggal = String(new Date().getDate());
    localStorage.setItem(LOCAL_STORAGE.TGL_PEMERIKSAAN, defaultTanggal);
  }

  populateTanggalPemeriksaan();
  loadDataTable(currentMode);
  initRunSetting();

  document
    .getElementById("btnRefreshIndividu")
    .addEventListener("click", () =>
      loadDataTable(REGISTRATION_MODES.INDIVIDUAL),
    );
  document
    .getElementById("btnRefreshSekolah")
    .addEventListener("click", () => loadDataTable(REGISTRATION_MODES.SCHOOL));
  document
    .getElementById("runProcessBtn")
    .addEventListener("click", runProcess);
  document
    .getElementById("btnRefreshSummary")
    .addEventListener("click", renderSummary);

  // Tab switching
  document
    .getElementById("tab-individu")
    .addEventListener("click", () => switchMode(REGISTRATION_MODES.INDIVIDUAL));
  document
    .getElementById("tab-sekolah")
    .addEventListener("click", () => switchMode(REGISTRATION_MODES.SCHOOL));
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
      // ✅ FIX: kirim hanya (iData, mode)
      // defDataPemeriksaan & pemeriksaanDataSchema diambil sendiri
      // di dalam runPemeriksaanMandiri via getDefaultPemeriksaanData()
      eData = await runPemeriksaanMandiri(eData, mode);
    }
  } catch (err) {
    console.error("Error pada runCheckPemeriksaan:", err);
    eData.keterangan = `Error pemeriksaan: ${err.message || String(err)}`;
    eData.pemeriksaan = "GAGAL";
  }

  return eData;
}