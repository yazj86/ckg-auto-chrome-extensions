// ==================== DATA PREPARATION ====================
let currentMode = REGISTRATION_MODES.INDIVIDUAL;

function detectModeFromFilename() {
  const filename = window.location.pathname.split("/").pop();
  if (filename.includes("sekolah")) {
    return REGISTRATION_MODES.SCHOOL;
  }
  return REGISTRATION_MODES.INDIVIDUAL;
}

currentMode = detectModeFromFilename();

let rawExcelData = [];
let excelHeaders = [];

document.addEventListener("DOMContentLoaded", () => {
  detectCurrentMode();
  initTableHeaders();
  loadActiveDataFromStorage();
  populateDefaultOptions();
  initDefaultInputs();
  initDefaultInputsPemeriksaan();

  const excelFileInput = document.getElementById("excelFileInput");
  if (excelFileInput)
    excelFileInput.addEventListener("change", handleExcelUpload);

  const processAndSaveBtn = document.getElementById("processAndSaveBtn");
  if (processAndSaveBtn)
    processAndSaveBtn.addEventListener("click", processMappingAndSave);

  const btnSaveDefault = document.getElementById("btnSaveDefault");
  if (btnSaveDefault) btnSaveDefault.addEventListener("click", saveDataDefault);

  const btnDownloadExcel = document.getElementById("btnDownloadExcel");
  if (btnDownloadExcel)
    btnDownloadExcel.addEventListener("click", downloadExcelAktifData);

  const btnClearAktifData = document.getElementById("btnClearAktifData");
  if (btnClearAktifData)
    btnClearAktifData.addEventListener("click", clearAktifData);

  const toggleDefaultData = document.getElementById("toggleDefaultData");
  if (toggleDefaultData)
    toggleDefaultData.addEventListener("change", refreshTableDisplay);
});

function detectCurrentMode() {
  const filename = window.location.pathname.split("/").pop();
  if (filename.includes("sekolah")) {
    currentMode = REGISTRATION_MODES.SCHOOL;
  } else {
    currentMode = REGISTRATION_MODES.INDIVIDUAL;
  }
  console.log(`Mode aktif: ${currentMode}`);
  return currentMode;
}

function getCurrentSchema() {
  return getSchemaByMode(currentMode);
}

function getCurrentDefaultData() {
  return getDefaultData(currentMode);
}

// ==================== SAFE DEFAULT PEMERIKSAAN ====================
function safeGetDefaultPemeriksaanData() {
  if (typeof getDefaultPemeriksaanData === "function") {
    return getDefaultPemeriksaanData();
  }
  // Fallback: generate dari pemeriksaanDataSchema jika tersedia
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

// ==================== TABLE HEADERS ====================
function initTableHeaders() {
  const headerRow = document.getElementById("tableHeaderRow");
  if (!headerRow) return;

  const schema = getCurrentSchema();
  let html = `<th class="text-center" style="min-width: 90px;">Validitas</th>`;
  html += schema.map((field) => `<th>${field.label}</th>`).join("");
  headerRow.innerHTML = html;
}

// ==================== EXCEL UPLOAD ====================
function handleExcelUpload(e) {
  try {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
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

// ==================== MAPPING UI ====================
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

  document.getElementById("mappingSection").classList.remove("d-none");
  document.querySelectorAll(".mapping-select").forEach((select) => {
    handleSelectColor(select);
  });

  container.addEventListener("change", function (event) {
    if (event.target && event.target.classList.contains("mapping-select")) {
      handleSelectColor(event.target);
    }
  });
}

// ==================== VALIDATION & PROCESSING ====================
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

// ==================== TABLE RENDERING ====================
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

// ==================== DEFAULT OPTIONS ====================
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

// ==================== CLEAR DATA ====================
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

// ==================== DOWNLOAD EXCEL ====================
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

// ==================== DEFAULT PEMERIKSAAN ====================
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
