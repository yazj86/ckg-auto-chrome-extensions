// ==================== DATA PREPARATION (SEMUA MODE) ====================
// Handle:
//   - Individu : Upload Excel peserta + default data + default pemeriksaan
//   - Sekolah  : Sama seperti individu + tambahan field sekolah
//   - By-Date  : Upload Excel TARGET + default pemeriksaan (pakai schema individu)

// ==================== GLOBAL STATE ====================
let currentMode = REGISTRATION_MODES.INDIVIDUAL;
let isByDateMode = false;

// State untuk individu/sekolah
let rawExcelData = [];
let excelHeaders = [];

// State untuk by-date
let byDateRawExcelData = [];
let byDateExcelHeaders = [];
let byDateTargets = [];

// ==================== MODE DETECTION ====================
function detectModeFromFilename() {
  const filename = window.location.pathname.split("/").pop();
  if (filename.includes("sekolah")) {
    return REGISTRATION_MODES.SCHOOL;
  }
  if (filename.includes("by-date") || filename.includes("bydate")) {
    return "by-date";
  }
  return REGISTRATION_MODES.INDIVIDUAL;
}

currentMode = detectModeFromFilename();
isByDateMode = currentMode === "by-date";

// ==================== INIT ====================
document.addEventListener("DOMContentLoaded", () => {
  detectCurrentMode();

  // Common
  initTableHeaders();
  initByDateTableHeaders(); // Khusus by-date
  loadActiveDataFromStorage();
  loadSavedByDateTargets(); // Khusus by-date
  populateDefaultOptions();
  initDefaultInputs();
  initDefaultInputsPemeriksaan();

  // Event listener individu/sekolah
  bindIndividuSekolahListeners();

  // Event listener by-date
  if (isByDateMode) {
    bindByDateListeners();
  }
});

// ==================== DETECT CURRENT MODE ====================
function detectCurrentMode() {
  const filename = window.location.pathname.split("/").pop();
  if (filename.includes("sekolah")) {
    currentMode = REGISTRATION_MODES.SCHOOL;
    isByDateMode = false;
  } else if (filename.includes("by-date") || filename.includes("bydate")) {
    currentMode = "by-date";
    isByDateMode = true;
  } else {
    currentMode = REGISTRATION_MODES.INDIVIDUAL;
    isByDateMode = false;
  }
  console.log(
    `Mode aktif: ${currentMode}${isByDateMode ? " (By Date)" : ""}`,
  );
  return currentMode;
}

// ==================== SCHEMA GETTERS ====================
function getCurrentSchema() {
  // By-date pakai schema individu (fallback dari getSchemaByMode)
  if (isByDateMode) {
    return typeof individualDataSchema !== "undefined"
      ? individualDataSchema
      : dataSchema;
  }
  return getSchemaByMode(currentMode);
}

function getCurrentDefaultData() {
  // By-date pakai default data individu
  return getDefaultData(
    isByDateMode ? REGISTRATION_MODES.INDIVIDUAL : currentMode,
  );
}

// ==================== SAFE DEFAULT PEMERIKSAAN ====================
function safeGetDefaultPemeriksaanData() {
  if (typeof getDefaultPemeriksaanData === "function") {
    return getDefaultPemeriksaanData();
  }
  if (typeof pemeriksaanDataSchema !== "undefined") {
    const defaults = {};
    Object.keys(pemeriksaanDataSchema).forEach((catKey) => {
      const category = pemeriksaanDataSchema[catKey];
      category.input.forEach((inputItem) => {
        defaults[`${catKey}_${inputItem.key}`] = inputItem.default || "";
      });
    });
    return defaults;
  }
  return {};
}

function safeSaveDefaultPemeriksaanData(data) {
  if (typeof saveDefaultPemeriksaanData === "function") {
    saveDefaultPemeriksaanData(data);
  } else {
    localStorage.setItem(
      LOCAL_STORAGE.DEFAULT_DATA_PEMERIKSAAN,
      JSON.stringify(data),
    );
  }
}

// ==================== TABLE HEADERS (INDIVIDU/SEKOLAH) ====================
function initTableHeaders() {
  const headerRow = document.getElementById("tableHeaderRow");
  if (!headerRow) return;

  const schema = getCurrentSchema();
  let html = `<th class="text-center" style="min-width: 90px;">Validitas</th>`;
  html += schema.map((field) => `<th>${field.label}</th>`).join("");
  headerRow.innerHTML = html;
}

// ==================== ✅ BY-DATE: TABLE HEADERS ====================
function initByDateTableHeaders() {
  const headerRow = document.getElementById("targetTableHeaderRow");
  if (!headerRow) return;

  const schema = getCurrentSchema();
  let html = "";
  schema.forEach((field) => {
    html += `<th>${field.label}</th>`;
  });
  headerRow.innerHTML = html;
}

// ==================== BIND LISTENERS: INDIVIDU/SEKOLAH ====================
function bindIndividuSekolahListeners() {
  const excelFileInput = document.getElementById("excelFileInput");
  if (excelFileInput) {
    excelFileInput.addEventListener("change", handleExcelUpload);
  }

  const processAndSaveBtn = document.getElementById("processAndSaveBtn");
  if (processAndSaveBtn) {
    processAndSaveBtn.addEventListener("click", processMappingAndSave);
  }

  const btnSaveDefault = document.getElementById("btnSaveDefault");
  if (btnSaveDefault) {
    btnSaveDefault.addEventListener("click", saveDataDefault);
  }

  const btnDownloadExcel = document.getElementById("btnDownloadExcel");
  if (btnDownloadExcel) {
    btnDownloadExcel.addEventListener("click", downloadExcelAktifData);
  }

  const btnClearAktifData = document.getElementById("btnClearAktifData");
  if (btnClearAktifData) {
    btnClearAktifData.addEventListener("click", clearAktifData);
  }

  const toggleDefaultData = document.getElementById("toggleDefaultData");
  if (toggleDefaultData) {
    toggleDefaultData.addEventListener("change", refreshTableDisplay);
  }
}

// ==================== ✅ BIND LISTENERS: BY-DATE ====================
function bindByDateListeners() {
  // Upload Excel target
  const byDateExcelInput = document.getElementById("excelFileInput");
  if (byDateExcelInput) {
    // Override — listener sebelumnya udah dipasang bindIndividuSekolahListeners
    // Jadi kita pasang listener baru yang handle by-date
    // Karena element sama, kita replace dengan yang baru
    byDateExcelInput.removeEventListener("change", handleExcelUpload);
    byDateExcelInput.addEventListener("change", handleByDateExcelUpload);
  }

  const byDateProcessBtn = document.getElementById("processAndSaveBtn");
  if (byDateProcessBtn) {
    byDateProcessBtn.removeEventListener("click", processMappingAndSave);
    byDateProcessBtn.addEventListener("click", processByDateMappingAndSave);
  }

  // Toggle
  const toggleDefaultTarget = document.getElementById("toggleDefaultTarget");
  if (toggleDefaultTarget) {
    const saved = localStorage.getItem("by-date-target-toggle");
    toggleDefaultTarget.checked = saved !== "false";

    toggleDefaultTarget.addEventListener("change", function () {
      localStorage.setItem("by-date-target-toggle", String(this.checked));
      refreshByDateTableDisplay();
    });
  }

  // Download
  const btnDownloadTarget = document.getElementById("btnDownloadTarget");
  if (btnDownloadTarget) {
    btnDownloadTarget.addEventListener("click", downloadByDateTargets);
  }

  // Clear
  const btnClearTarget = document.getElementById("btnClearTarget");
  if (btnClearTarget) {
    btnClearTarget.addEventListener("click", clearByDateTargets);
  }
}

// ==================== EXCEL UPLOAD (INDIVIDU/SEKOLAH) ====================
function handleExcelUpload(e) {
  try {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (ev) {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      if (jsonData.length === 0) {
        alert("File excel kosong!");
        return;
      }

      rawExcelData = jsonData;
      excelHeaders = Object.keys(jsonData[0]);

      generateMappingUI();
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    console.error("Error saat upload Excel:", err);
    showErrorSwal("Terjadi kesalahan saat membaca file Excel");
  }
}

// ==================== ✅ EXCEL UPLOAD (BY-DATE) ====================
function handleByDateExcelUpload(e) {
  try {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (jsonData.length === 0) {
        showErrorSwal("File Excel kosong!");
        return;
      }

      byDateRawExcelData = jsonData;
      byDateExcelHeaders = Object.keys(jsonData[0]);

      generateByDateMappingUI();
    };
    reader.readAsArrayBuffer(file);
  } catch (err) {
    console.error("Error upload Excel by-date:", err);
    showErrorSwal("Terjadi kesalahan saat membaca file Excel");
  }
}

// ==================== MAPPING UI (INDIVIDU/SEKOLAH) ====================
function handleSelectColor(selectElement) {
  if (!selectElement) return;
  if (selectElement.value === "") {
    selectElement.style.color = "#dc3545";
    selectElement.style.fontWeight = "bold";
  } else {
    selectElement.style.color = "#212529";
    selectElement.style.fontWeight = "normal";
  }
}

function generateMappingUI() {
  const container = document.getElementById("mappingDropdownsContainer");
  if (!container) return;

  container.innerHTML = "";

  const normalizedOptions = excelHeaders.map((h) => ({
    original: h,
    normalized: normalizeHeaderString(h),
  }));

  const schema = getCurrentSchema();

  schema.forEach((field) => {
    let autoMatch = "";
    const found = normalizedOptions.find((opt) =>
      field.keys.includes(opt.normalized),
    );
    if (found) autoMatch = found.original;

    const colDiv = document.createElement("div");
    colDiv.className = "flex-shrink-0 me-2";

    let selectOptionsHtml = `<option value="" style="color: #dc3545; font-weight: bold;">-- Lewati Kolom --</option>`;
    excelHeaders.forEach((header) => {
      const isSelected = header === autoMatch ? "selected" : "";
      selectOptionsHtml += `<option value="${header}" ${isSelected}>${header}</option>`;
    });

    colDiv.innerHTML = `
      <div class="form-group p-1 border rounded bg-light">
        <label class="form-label small text-truncate fw-bold mb-1 d-block">${field.label}</label>
        <select class="form-select form-select-sm mapping-select" data-main-key="${field.mainKey}">
          ${selectOptionsHtml}
        </select>
      </div>
    `;
    container.appendChild(colDiv);
  });

  const mappingSection = document.getElementById("mappingSection");
  if (mappingSection) mappingSection.classList.remove("d-none");

  document.querySelectorAll(".mapping-select").forEach((select) => {
    handleSelectColor(select);
  });

  container.addEventListener("change", function (event) {
    if (event.target && event.target.classList.contains("mapping-select")) {
      handleSelectColor(event.target);
    }
  });
}

// ==================== ✅ MAPPING UI (BY-DATE) ====================
function generateByDateMappingUI() {
  const container = document.getElementById("mappingDropdownsContainer");
  const mappingSection = document.getElementById("mappingSection");
  if (!container) return;

  container.innerHTML = "";

  const schema = getCurrentSchema();
  if (schema.length === 0) {
    showErrorSwal("Schema tidak tersedia. Cek constant.js.");
    return;
  }

  const normalizedOptions = byDateExcelHeaders.map((h) => ({
    original: h,
    normalized: normalizeHeaderString(h),
  }));

  schema.forEach((field) => {
    let autoMatch = "";
    const found = normalizedOptions.find((opt) =>
      field.keys.includes(opt.normalized),
    );
    if (found) autoMatch = found.original;

    const wrapper = document.createElement("div");
    wrapper.className = "mini-field";

    let optionsHtml = `<option value="" style="color:#dc3545;font-weight:bold">-- Lewati --</option>`;
    byDateExcelHeaders.forEach((header) => {
      const sel = header === autoMatch ? "selected" : "";
      optionsHtml += `<option value="${header}" ${sel}>${header}</option>`;
    });

    wrapper.innerHTML = `
      <label class="mini-label" title="${field.label}">${field.label}</label>
      <select class="form-select form-select-sm by-date-mapping-select"
              data-main-key="${field.mainKey}">
        ${optionsHtml}
      </select>
    `;
    container.appendChild(wrapper);
  });

  if (mappingSection) mappingSection.classList.remove("d-none");

  // Warnai select yang kosong
  document
    .querySelectorAll(".by-date-mapping-select")
    .forEach((sel) => {
      if (!sel.value) {
        sel.style.color = "#dc3545";
        sel.style.fontWeight = "bold";
      } else {
        sel.style.color = "#212529";
        sel.style.fontWeight = "normal";
      }
    });

  container.addEventListener("change", function (event) {
    if (
      event.target &&
      event.target.classList.contains("by-date-mapping-select")
    ) {
      if (event.target.value === "") {
        event.target.style.color = "#dc3545";
        event.target.style.fontWeight = "bold";
      } else {
        event.target.style.color = "#212529";
        event.target.style.fontWeight = "normal";
      }
    }
  });
}

// ==================== VALIDATION & PROCESSING (INDIVIDU/SEKOLAH) ====================
function processAndValidateAge(row) {
  if (!row.tgl_lahir) {
    row.status_usia = "";
    return row;
  }

  const birthDate = parseDDMMYYYY(row.tgl_lahir);
  const today = new Date();

  let ageInYears = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    ageInYears--;
  }

  if (ageInYears < 6) {
    row.status_usia = "BALITA";
  } else if (ageInYears >= 6 && ageInYears < 18) {
    row.status_usia = "SEKOLAH";
  } else if (ageInYears >= 60) {
    row.status_usia = "LANSIA";
  } else {
    row.status_usia = "";
  }

  if (row.status_usia !== "BALITA") {
    row.nik_wali = "-";
    row.nama_wali = "-";
    row.tgl_lahir_wali = "-";
    row.jenis_kelamin_wali = "-";
    row.no_hp_wali = "-";
  }
  return row;
}

function processMappingAndSave() {
  const selects = document.querySelectorAll(".mapping-select");
  const userMap = {};
  const schema = getCurrentSchema();

  selects.forEach((select) => {
    const mainKey = select.getAttribute("data-main-key");
    const excelTargetKey = select.value;
    if (excelTargetKey) {
      userMap[mainKey] = excelTargetKey;
    }
  });

  const finalizedData = rawExcelData.map((row) => {
    let cleanRow = {};
    let rowErrors = [];

    schema.forEach((field) => {
      const targetExcelField = userMap[field.mainKey];
      let rawValue = targetExcelField ? row[targetExcelField] : "";

      if (field.validation.type === "number") {
        rawValue = cleanNumberOnly(rawValue);
      } else if (field.validation.type === "date") {
        rawValue = toDDMMYYYY(rawValue);
      } else if (field.validation.type === "phone") {
        rawValue = cleanPhoneNumber(rawValue);
      } else if (field.validation.type === "enum") {
        if (rawValue) {
          let cleanVal = rawValue
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[\s-]/g, "_");

          if (field.validation.mapTo && field.validation.mapTo[cleanVal]) {
            rawValue = field.validation.mapTo[cleanVal];
          } else if (field.validation.options) {
            const matchedOption = field.validation.options.find(
              (opt) =>
                opt.toString().trim().toLowerCase().replace(/[\s-]/g, "_") ===
                cleanVal,
            );
            if (matchedOption) {
              rawValue = matchedOption;
            } else {
              rawValue = rawValue.toString().trim();
            }
          } else {
            rawValue = rawValue.toString().trim();
          }
        }
      } else if (
        field.validation.type === "text" &&
        field.validation.maxLength
      ) {
        rawValue = rawValue
          ? rawValue.toString().substring(0, field.validation.maxLength)
          : "";
      }

      cleanRow[field.mainKey] =
        rawValue !== null && rawValue !== undefined ? rawValue : "";

      const isFieldEmpty =
        cleanRow[field.mainKey] === "" ||
        cleanRow[field.mainKey] === null ||
        cleanRow[field.mainKey] === undefined;

      if (field.validation.required && isFieldEmpty) {
        rowErrors.push(`[${field.label}] wajib diisi`);
      } else if (!isFieldEmpty) {
        if (field.validation.type === "enum") {
          let validOptions = field.validation.options || [];
          if (field.validation.mapTo) {
            validOptions = [
              ...validOptions,
              ...Object.values(field.validation.mapTo),
            ];
          }
          if (!validOptions.includes(cleanRow[field.mainKey])) {
            rowErrors.push(
              `[${field.label}] nilai "${cleanRow[field.mainKey]}" tidak sesuai opsi`,
            );
          }
        }
        if (field.validation.customValidator) {
          const validatorName = field.validation.customValidator;
          const validateFn = validatorRegistry[validatorName];
          if (validateFn) {
            const validationResult = validateFn(cleanRow[field.mainKey]);
            if (!validationResult.success) {
              rowErrors.push(validationResult.message);
            }
          }
        }
      }
    });

    let processedRow = processAndValidateAge(cleanRow);
    processedRow["is_valid"] = rowErrors.length === 0;
    if (rowErrors.length > 0) {
      processedRow["keterangan"] = rowErrors.join(", ");
    }
    return processedRow;
  });

  saveAktifData(finalizedData);
  showSuccess(
    `Berhasil memproses ${finalizedData.length} baris data kedalam database aplikasi.`,
  );

  const totalInvalid = finalizedData.filter((d) => !d.is_valid).length;
  if (totalInvalid > 0) {
    Swal.fire({
      title: "Data Disimpan dengan Catatan",
      text: `Berhasil memproses ${finalizedData.length} data. Namun, ada ${totalInvalid} baris data yang TIDAK VALID. Mohon periksa tabel.`,
      icon: "warning",
      confirmButtonText: "Periksa Tabel",
    });
  } else {
    showSuccess(
      `Semua data (${finalizedData.length} baris) valid dan siap digunakan.`,
    );
  }
  renderTableData(finalizedData);
}

// ==================== ✅ PROSES BY-DATE ====================
function processByDateMappingAndSave() {
  const selects = document.querySelectorAll(".by-date-mapping-select");
  const userMap = {};
  const schema = getCurrentSchema();

  selects.forEach((select) => {
    const mainKey = select.getAttribute("data-main-key");
    if (select.value) userMap[mainKey] = select.value;
  });

  if (!userMap.nik && !userMap.nama) {
    showErrorSwal(
      "Minimal mapping kolom 'NIK' atau 'Nama' harus diisi supaya robot bisa mencocokkan peserta.",
    );
    return;
  }

  // Proses semua field yang dimapping (untuk konsistensi tampilan)
  const finalized = byDateRawExcelData.map((row, i) => {
    const cleanRow = {};

    schema.forEach((field) => {
      const targetExcelField = userMap[field.mainKey];
      let rawValue = targetExcelField ? row[targetExcelField] : "";

      // Cleaning sesuai validation type (sama seperti individu)
      if (field.validation?.type === "number") {
        rawValue = cleanNumberOnly(rawValue);
      } else if (field.validation?.type === "date") {
        rawValue = toDDMMYYYY(rawValue);
      } else if (field.validation?.type === "phone") {
        rawValue = cleanPhoneNumber(rawValue);
      } else if (field.validation?.type === "enum") {
        if (rawValue) {
          let cleanVal = rawValue
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[\s-]/g, "_");

          if (field.validation.mapTo && field.validation.mapTo[cleanVal]) {
            rawValue = field.validation.mapTo[cleanVal];
          } else if (field.validation.options) {
            const matchedOption = field.validation.options.find(
              (opt) =>
                opt.toString().trim().toLowerCase().replace(/[\s-]/g, "_") ===
                cleanVal,
            );
            if (matchedOption) {
              rawValue = matchedOption;
            } else {
              rawValue = rawValue.toString().trim();
            }
          } else {
            rawValue = rawValue.toString().trim();
          }
        }
      } else if (
        field.validation?.type === "text" &&
        field.validation.maxLength
      ) {
        rawValue = rawValue
          ? rawValue.toString().substring(0, field.validation.maxLength)
          : "";
      }

      cleanRow[field.mainKey] =
        rawValue !== null && rawValue !== undefined ? rawValue : "";
    });

    if (!cleanRow.no) cleanRow.no = i + 1;
    return cleanRow;
  });

  // Filter yang minimal punya NIK atau Nama
  const valid = finalized.filter((t) => t.nik || t.nama);

  if (valid.length === 0) {
    showErrorSwal("Tidak ada baris valid setelah diproses.");
    return;
  }

  byDateTargets = valid;
  localStorage.setItem(
    LOCAL_STORAGE.BY_DATE_EXCEL_TARGETS,
    JSON.stringify(valid),
  );

  const mappingSection = document.getElementById("mappingSection");
  if (mappingSection) mappingSection.classList.add("d-none");

  const input = document.getElementById("excelFileInput");
  if (input) input.value = "";

  byDateRawExcelData = [];
  byDateExcelHeaders = [];

  // Auto-aktifkan toggle
  const toggle = document.getElementById("toggleDefaultTarget");
  if (toggle && !toggle.checked) {
    toggle.checked = true;
    localStorage.setItem("by-date-target-toggle", "true");
  }

  refreshByDateTableDisplay();

  console.log(
    `%c[SAVED]%c ${valid.length} target peserta by-date`,
    "background:#0f8a5f;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700",
    "color:#0f8a5f;font-weight:600",
  );

  if (typeof showSuccess === "function") {
    showSuccess(
      `Berhasil memproses & menyimpan ${valid.length} target peserta.`,
    );
  }
}

// ==================== TABLE RENDERING (INDIVIDU/SEKOLAH) ====================
function renderTableData(dataList) {
  const tbody = document.getElementById("dataBody");
  if (!tbody) return;

  const schema = getCurrentSchema();
  const totalColumns = schema.length + 1;

  if (!dataList || dataList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${totalColumns}" class="text-center text-muted">Belum ada data aktif.</td></tr>`;
    return;
  }

  const showDefault = document.getElementById("toggleDefaultData")?.checked;
  const defaultData = showDefault ? getCurrentDefaultData() : null;

  let html = "";
  dataList.forEach((row) => {
    const rowClass = row.is_valid ? "" : "table-danger";
    html += `<tr class="${rowClass}">`;
    if (row.is_valid) {
      html += `<td class="text-center"><span class="badge bg-success">Valid ✓</span></td>`;
    } else {
      html += `<td class="text-center"><span class="badge bg-danger" title="${row.keterangan}">⚠️ Invalid</span></td>`;
    }

    schema.forEach((field) => {
      let cellValue = row[field.mainKey];

      if (field.mainKey === "keterangan") {
        const textClass = row.is_valid ? "" : "text-danger fw-bold";
        html += `<td class="${textClass}">${row.keterangan || "-"}</td>`;
      } else {
        const isCellValueEmpty =
          cellValue === undefined ||
          cellValue === null ||
          cellValue.toString().trim() === "";

        if (isCellValueEmpty && showDefault && defaultData) {
          let fallbackValue = defaultData[field.mainKey];
          if (fallbackValue) {
            html += `<td class="text-primary fw-semibold">${fallbackValue}</td>`;
          } else {
            html += `<td></td>`;
          }
        } else {
          html += `<td>${cellValue ?? ""}</td>`;
        }
      }
    });
    html += `</tr>`;
  });
  tbody.innerHTML = html;
}

// ==================== ✅ RENDER TABLE BY-DATE ====================
function refreshByDateTableDisplay() {
  const tbody = document.getElementById("targetTableBody");
  const statusDot = document.getElementById("targetStatusDot");
  const toggle = document.getElementById("toggleDefaultTarget");
  const schema = getCurrentSchema();
  if (!tbody) return;

  const totalColumns = schema.length || 1;
  const isToggled = toggle ? toggle.checked : true;

  if (!isToggled || byDateTargets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${totalColumns}" class="text-center text-muted py-4">
          📭 Belum ada target. Silakan unggah file Excel.
        </td>
      </tr>
    `;
    if (statusDot) statusDot.classList.add("d-none");
    return;
  }

  let html = "";
  byDateTargets.forEach((row) => {
    html += `<tr>`;
    schema.forEach((field) => {
      const value = row[field.mainKey];
      html += `<td>${value ?? ""}</td>`;
    });
    html += `</tr>`;
  });
  tbody.innerHTML = html;

  if (statusDot) statusDot.classList.remove("d-none");
}

function refreshTableDisplay() {
  const stored = localStorage.getItem(LOCAL_STORAGE.AKTIF_DATA);
  const currentData = stored ? JSON.parse(stored) : [];
  renderTableData(currentData);
}

function loadActiveDataFromStorage() {
  const stored = localStorage.getItem(LOCAL_STORAGE.AKTIF_DATA);
  if (stored) {
    const data = JSON.parse(stored);
    renderTableData(data);
  }
}

// ==================== ✅ LOAD TARGET BY-DATE ====================
function loadSavedByDateTargets() {
  try {
    byDateTargets = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE.BY_DATE_EXCEL_TARGETS) || "[]",
    );
  } catch (e) {
    byDateTargets = [];
  }

  if (byDateTargets.length > 0) {
    refreshByDateTableDisplay();
  } else if (isByDateMode) {
    refreshByDateTableDisplay();
  }
}

// ==================== DEFAULT OPTIONS (INDIVIDU/SEKOLAH) ====================
function populateDefaultOptions() {
  const selectPekerjaan = document.getElementById("pekerjaan");
  if (selectPekerjaan) {
    const fragment = document.createDocumentFragment();
    PekerjaanOptions.forEach((pekerjaan) => {
      const option = document.createElement("option");
      option.value = pekerjaan;
      option.textContent = pekerjaan;
      fragment.appendChild(option);
    });
    selectPekerjaan.appendChild(fragment);
  }

  const selectStatusPerkawinan = document.getElementById("status_perkawinan");
  if (selectStatusPerkawinan) {
    const fragment = document.createDocumentFragment();
    PerkawinanOptions.forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      fragment.appendChild(option);
    });
    selectStatusPerkawinan.appendChild(fragment);
  }

  if (currentMode === REGISTRATION_MODES.SCHOOL) {
    const selectJenjang = document.getElementById("jenjang_pendidikan");
    if (selectJenjang) {
      const fragment = document.createDocumentFragment();
      KelasOptions.forEach((kelas) => {
        const option = document.createElement("option");
        option.value = kelas;
        option.textContent = kelas;
        fragment.appendChild(option);
      });
      selectJenjang.appendChild(fragment);
    }
  }
}

function initDefaultInputs() {
  const defData = getCurrentDefaultData();
  if (!defData) return;

  Object.keys(defData).forEach((key) => {
    const inputElement = document.getElementById(key);
    if (inputElement) {
      inputElement.value = defData[key] || "";
    }
  });
}

function saveDataDefault() {
  const defData = getCurrentDefaultData();
  if (!defData) return;

  Object.keys(defData).forEach((key) => {
    const inputElement = document.getElementById(key);
    if (inputElement) {
      defData[key] = (inputElement.value ?? "").trim();
    }
  });

  localStorage.setItem(LOCAL_STORAGE.DEFAULT_DATA, JSON.stringify(defData));
  showSuccess("Berhasil menyimpan data default!");
}

// ==================== CLEAR DATA (INDIVIDU/SEKOLAH) ====================
function clearAktifData() {
  Swal.fire({
    title: "Hapus Semua Aktif Data?",
    text: "Data aktif dan pengaturan mapping akan direset!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc3545",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Ya, Hapus!",
    cancelButtonText: "Batal",
    customClass: { popup: "small-swal" },
  }).then((result) => {
    if (result.isConfirmed) {
      localStorage.removeItem(LOCAL_STORAGE.AKTIF_DATA);
      renderTableData([]);
      const excelFileInput = document.getElementById("excelFileInput");
      const mappingSection = document.getElementById("mappingSection");
      if (excelFileInput) excelFileInput.value = "";
      if (mappingSection) mappingSection.classList.add("d-none");
      Swal.fire({
        title: "Berhasil!",
        text: "Data aktif telah dibersihkan.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
      });
    }
  });
}

// ==================== ✅ CLEAR TARGET BY-DATE ====================
function clearByDateTargets() {
  Swal.fire({
    icon: "warning",
    title: "Hapus Target?",
    text: "Setelah dihapus, robot akan memproses SEMUA peserta di rentang tanggal.",
    showCancelButton: true,
    confirmButtonColor: "#dc3545",
    cancelButtonText: "Batal",
    confirmButtonText: "Ya, Hapus!",
  }).then((r) => {
    if (!r.isConfirmed) return;

    byDateTargets = [];
    byDateRawExcelData = [];
    byDateExcelHeaders = [];

    localStorage.removeItem(LOCAL_STORAGE.BY_DATE_EXCEL_TARGETS);

    const input = document.getElementById("excelFileInput");
    if (input) input.value = "";

    const mappingSection = document.getElementById("mappingSection");
    if (mappingSection) mappingSection.classList.add("d-none");

    refreshByDateTableDisplay();

    if (typeof showSuccess === "function") {
      showSuccess("Target dihapus. Mode: Semua peserta.");
    }
  });
}

// ==================== DOWNLOAD EXCEL (INDIVIDU/SEKOLAH) ====================
function downloadExcelAktifData() {
  const stored = localStorage.getItem(LOCAL_STORAGE.AKTIF_DATA);
  if (!stored) {
    Swal.fire({
      title: "Gagal!",
      text: "Tidak ada data aktif yang bisa diunduh.",
      icon: "error",
    });
    return;
  }

  const aktifData = JSON.parse(stored);
  if (aktifData.length === 0) {
    Swal.fire({ title: "Info", text: "Data aktif kosong.", icon: "info" });
    return;
  }

  const schema = getCurrentSchema();
  const excelRows = aktifData.map((row) => {
    const newRow = {};
    schema.forEach((field) => {
      let cellValue = row[field.mainKey];
      if (
        cellValue === undefined ||
        cellValue === null ||
        cellValue.toString().trim() === ""
      ) {
        cellValue = "";
      }
      newRow[field.label] = cellValue ?? "";
    });
    return newRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data Aktif");

  const timestamp = new Date().toISOString().slice(0, 10);
  const prefix =
    currentMode === REGISTRATION_MODES.SCHOOL ? "SEKOLAH" : "INDIVIDU";
  XLSX.writeFile(
    workbook,
    `CKG-ROBOT_${prefix}_Data-Aktif-Export_${timestamp}.xlsx`,
  );

  Swal.fire({
    title: "Berhasil!",
    text: "File Excel berhasil diunduh.",
    icon: "success",
    timer: 1500,
    showConfirmButton: false,
  });
}

// ==================== ✅ DOWNLOAD TARGET BY-DATE ====================
function downloadByDateTargets() {
  if (byDateTargets.length === 0) {
    showErrorSwal("Tidak ada target untuk diunduh.");
    return;
  }

  if (typeof XLSX === "undefined") {
    showErrorSwal("Library XLSX tidak tersedia.");
    return;
  }

  const schema = getCurrentSchema();

  const rows = byDateTargets.map((row) => {
    const newRow = {};
    schema.forEach((field) => {
      let val = row[field.mainKey];
      if (
        val === undefined ||
        val === null ||
        val.toString().trim() === ""
      ) {
        val = "";
      }
      newRow[field.label] = val;
    });
    return newRow;
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Target By Date");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `CKG-ByDate-Target_${stamp}.xlsx`);

  if (typeof showSuccess === "function") {
    showSuccess("File Excel target berhasil diunduh.");
  }
}

// ==================== DEFAULT PEMERIKSAAN (SEMUA MODE) ====================
function initDefaultInputsPemeriksaan() {
  const container = document.getElementById(
    "defaultValuesPemeriksaanContainer",
  );
  if (!container) return;

  const currentSettings = safeGetDefaultPemeriksaanData();

  Object.keys(pemeriksaanDataSchema).forEach((catKey) => {
    const category = pemeriksaanDataSchema[catKey];

    category.input.forEach((inputItem) => {
      const uniqueId = `${catKey}_${inputItem.key}`;
      const savedValue =
        currentSettings[uniqueId] !== undefined
          ? currentSettings[uniqueId]
          : inputItem.default;

      const itemWrapper = document.createElement("div");
      itemWrapper.className = "flex-shrink-0 me-2";
      itemWrapper.style.width = "220px";

      let controlHTML = "";

      if (inputItem.type === "text" || inputItem.type === "number") {
        const inputType = inputItem.type === "number" ? "number" : "text";
        const stepAttribute = inputType === "number" ? 'step="any"' : "";
        controlHTML = `
          <input type="${inputType}" id="${uniqueId}" ${stepAttribute}
                 class="form-control form-control-sm data-default-input"
                 value="${savedValue !== null ? savedValue : ""}">
        `;
      } else {
        let optionsArray = [];
        if (Array.isArray(inputItem.options)) {
          optionsArray = inputItem.options;
        }
        const optionsHTML = optionsArray
          .map((opt) => {
            const isSelected = opt === savedValue ? "selected" : "";
            return `<option value="${opt}" ${isSelected}>${opt}</option>`;
          })
          .join("");
        controlHTML = `
          <select id="${uniqueId}" class="form-select form-select-sm data-default-input">
            ${optionsHTML}
          </select>
        `;
      }

      itemWrapper.innerHTML = `
        <div class="form-group p-1 border rounded bg-light h-100 d-flex flex-column justify-content-between">
          <label for="${uniqueId}" class="form-label small text-truncate fw-bold mb-1 d-block"
                 title="${category.label} - ${inputItem.label}">
            ${category.label}<br><span class="text-muted fw-normal">${inputItem.label}</span>
          </label>
          ${controlHTML}
        </div>
      `;
      container.appendChild(itemWrapper);
    });
  });

  const btnSaveDefaultPemeriksaan = document.getElementById(
    "btnSaveDefaultPemeriksaan",
  );
  if (btnSaveDefaultPemeriksaan) {
    btnSaveDefaultPemeriksaan.addEventListener("click", () => {
      const payload = {};
      const inputs = document.querySelectorAll(".data-default-input");
      inputs.forEach((selectElement) => {
        payload[selectElement.id] = selectElement.value;
      });
      safeSaveDefaultPemeriksaanData(payload);
      showSuccess("Berhasil menyimpan data default pemeriksaan!");
    });
  }
}