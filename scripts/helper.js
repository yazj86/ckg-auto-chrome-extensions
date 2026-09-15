// ==================== UI & ERROR HANDLING ====================
function showErrorSwal(error, fallbackTitle = "Terjadi Kesalahan") {
  let title = fallbackTitle;
  let htmlContent = "";
  let icon = "error";

  if (Array.isArray(error)) {
    title = "Validasi Data Gagal";
    icon = "warning";

    const maxDisplay = 5;
    const displayedErrors = error.slice(0, maxDisplay);
    const remaining = error.length - maxDisplay;

    htmlContent = `
            <div class="text-start fs-6" style="max-height: 200px; overflow-y: auto; background: #f8f9fa; padding: 10px; border-radius: 5px;">
                <ul class="mb-0 text-danger ps-3">
                    ${displayedErrors.map((err) => `<li>${err}</li>`).join("")}
                </ul>
                ${remaining > 0 ? `<p class="text-muted small mt-2 mb-0 text-center">...dan ${remaining} data error lainnya.</p>` : ""}
            </div>
        `;
  } else if (error instanceof Error) {
    title = error.name || "System Error";
    htmlContent = `<p class="fw-bold text-secondary mb-1">Pesan Sistem:</p><code class="text-danger">${error.message}</code>`;
  } else if (typeof error === "object" && error !== null) {
    title = error.title || title;
    htmlContent = error.message || JSON.stringify(error);
  } else if (typeof error === "string") {
    htmlContent = error;
  } else {
    htmlContent = "Terjadi kesalahan internal pada robot parser.";
  }

  Swal.fire({
    title: title,
    html: htmlContent,
    icon: icon,
    confirmButtonText: "Mengerti",
    confirmButtonColor: "#dc3545",
    allowOutsideClick: false,
    customClass: {
      popup: "border-0 shadow-lg",
    },
  });
}

function showSuccess(msg = "") {
  Swal.fire({
    title: "Berhasil!",
    text: msg,
    icon: "success",
  });
}

// ==================== DATA CLEANING & FORMATTING ====================
function normalizeHeaderString(str) {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

function cleanNumberOnly(val) {
  if (val === null || val === undefined) return null;
  let str = val.toString().replace(/,/g, "."); // antisipasi koma desimal
  let cleaned = str.replace(/[^0-9.]/g, ""); // saring hanya angka dan titik desimal
  return cleaned ? Number(cleaned) : null;
}

/**
 * Konversi berbagai format tanggal ke DD-MM-YYYY.
 * Handles:
 *   - Excel serial number (44927)
 *   - JavaScript Date object (dari SheetJS)
 *   - String "DD-MM-YYYY" / "DD/MM/YYYY"
 *   - String "YYYY-MM-DD" / "YYYY/MM/DD"
 *   - String natural "15 Jan 1990" / "Jan 15, 1990"
 * @returns {string|null} DD-MM-YYYY atau null kalau gagal
 */
function toDDMMYYYY(dateStr) {
  // Guard: null / undefined / empty
  if (dateStr === null || dateStr === undefined || dateStr === "") return null;

  // 1. Excel serial number (contoh: 44927)
  if (!isNaN(dateStr) && Number(dateStr) > 2500) {
    const serial = Number(dateStr);
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + serial * 86400000);
    if (isNaN(date.getTime())) return null;
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }

  // 2. JavaScript Date object (dari SheetJS cellDates:true)
  if (dateStr instanceof Date) {
    if (isNaN(dateStr.getTime())) return null;
    const day = String(dateStr.getDate()).padStart(2, "0");
    const month = String(dateStr.getMonth() + 1).padStart(2, "0");
    const year = dateStr.getFullYear();
    return `${day}-${month}-${year}`;
  }

  // 3. String parsing
  const str = dateStr.toString().trim();
  let day, month, year, match;

  // 3a. Format DD-MM-YYYY atau DD/MM/YYYY
  match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);
  if (match) {
    day = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
    return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
  }

  // 3b. Format YYYY-MM-DD atau YYYY/MM/DD
  match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
  if (match) {
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    day = parseInt(match[3], 10);
    return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
  }

  // 3c. Fallback: coba Date.parse() — handle "Jan 15, 1990", "15 Jan 1990", dll.
  const fallbackDate = new Date(str);
  if (!isNaN(fallbackDate.getTime())) {
    const d = String(fallbackDate.getDate()).padStart(2, "0");
    const m = String(fallbackDate.getMonth() + 1).padStart(2, "0");
    const y = fallbackDate.getFullYear();
    return `${d}-${m}-${y}`;
  }

  // 4. Benar-benar gagal → return null
  console.warn("[CKG] Gagal parse tanggal:", dateStr);
  return null;
}

/**
 * Parse string DD-MM-YYYY ke JavaScript Date.
 * Selalu return Date valid atau Invalid Date (bukan throw).
 * @returns {Date}
 */
function parseDDMMYYYY(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return new Date(NaN);

  const parts = dateStr.split("-");
  if (parts.length !== 3) return new Date(NaN);

  const [day, month, year] = parts.map(Number);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date(NaN);

  const date = new Date(year, month - 1, day);

  // Validasi range: pastikan Date yang dihasilkan benar-benar sesuai input
  // (menangkap kasus seperti 31-02-2020 → JS auto-correct ke 02-03-2020)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return new Date(NaN);
  }

  return date;
}

/**
 * Parse DD-MM-YYYY ke object { day, month, year, date }.
 * @returns {object|null}
 */
function parseDateString(dateStr) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
  if (!match) {
    console.warn("Invalid date format. Expected DD-MM-YYYY");
    return null;
  }
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  return {
    day,
    month,
    year,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function cleanPhoneNumber(phone, defPhone = "") {
  if (!phone) return defPhone;
  let cleaned = phone.toString().replace(/\D/g, "");
  if (cleaned.startsWith("628")) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith("08")) {
    cleaned = cleaned.substring(1);
  }
  const minLength = 9;
  const maxLength = 13;
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    return defPhone;
  }
  if (!cleaned.startsWith("8")) {
    return defPhone;
  }
  return cleaned;
}

// ==================== PANEL MESSAGES & LOADING ====================
function showPanelMessage(message) {
  const parent = document.getElementById("parent-text-message");
  const textDiv = document.getElementById("text-message");
  if (!parent || !textDiv) return;
  if (message && message.trim() !== "") {
    textDiv.textContent = message;
    parent.classList.remove("d-none");
  } else {
    textDiv.textContent = "";
    parent.classList.add("d-none");
  }
}

function appendPanelMessage(message) {
  const parent = document.getElementById("parent-text-message");
  const textDiv = document.getElementById("text-message");
  if (!parent || !textDiv) return;
  if (message && message.trim() !== "") {
    if (textDiv.textContent.trim() === "") {
      textDiv.textContent = message;
    } else {
      const nextMessage = document.createElement("div");
      nextMessage.textContent = message;
      nextMessage.classList.add("mt-1");
      textDiv.appendChild(nextMessage);
    }
    parent.classList.remove("d-none");
    textDiv.scrollTop = textDiv.scrollHeight;
  }
}

function showLoading() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) spinner.style.display = "block";
}

function hideLoading() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) spinner.style.display = "none";
}

// ==================== DOM MANIPULATION & WAIT HELPERS ====================
function waitForElement(xpath, callback, parentEl, maxTries = 10) {
  let attempt = 0;
  function tryFind() {
    attempt++;
    const element = document.evaluate(
      xpath,
      parentEl || document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue;

    if (element) {
      setTimeout(() => callback(element), 500);
    } else if (attempt < maxTries) {
      const delay = 500 * attempt;
      setTimeout(tryFind, delay);
    } else {
      console.warn("Element not found after", maxTries, "attempts", xpath);
      callback(null); // <- tambahan, panggil callback dengan null agar waitForElementAsync bisa reject
    }
  }
  tryFind();
}

function forceClick(el) {
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "instant" });
  el.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
  el.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
  );
  // Fallback native click
  if (typeof el.click === "function") {
    el.click();
  }
}

function clickElement(el) {
  if (el) {
    el.dispatchEvent(
      new MouseEvent("click", {
        view: window,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
}

function inputElementValue(el, val) {
  if (el) {
    el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

const forceInput = (el, val) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(el, String(val));
  ["input", "change", "blur", "keyup"].forEach((e) =>
    el.dispatchEvent(new Event(e, { bubbles: true })),
  );
};

const typeInto = async (el, text, delay = 60) => {
  text = String(text);
  el.focus();
  el.value = "";
  for (const ch of text) {
    document.execCommand("insertText", false, ch);
    await new Promise((r) => setTimeout(r, delay));
  }
};

const clickRadioByText = (text) => {
  [...document.querySelectorAll("label")]
    .find((l) => l.innerText.trim() === text)
    ?.click();
};

function enterKeyElement(el) {
  if (el) {
    el.focus();
    const eventProps = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent("keydown", eventProps));
    el.dispatchEvent(new KeyboardEvent("keypress", eventProps));
    el.dispatchEvent(new KeyboardEvent("keyup", eventProps));
  }
}

function makeXPathCaseInsensitive(text) {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  return `translate(normalize-space(.), '${uppercase}', '${lowercase}')`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepUntilLoaded(ms = 500, text = "Memuat data", maxRetry = 20) {
  for (let i = 0; i < maxRetry; i++) {
    await new Promise((r) => setTimeout(r, ms));
    if (!document.body.textContent.toLowerCase().includes(text.toLowerCase())) {
      return true;
    }
  }
  console.warn(`Teks "${text}" masih ada setelah ${maxRetry} percobaan`);
  return true; // jangan throw
}

function waitForElementAsync(xpathOrSelector, parentEl, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = 200;
    function check() {
      const element = document.evaluate(
        xpathOrSelector,
        parentEl || document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      ).singleNodeValue;
      if (element) {
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for: ${xpathOrSelector}`));
      } else {
        setTimeout(check, interval);
      }
    }
    check();
  });
}

// ==================== AGE HELPERS ====================

/**
 * Hitung usia dalam tahun dari tanggal lahir.
 * @param {string} dateStr - DD-MM-YYYY
 * @returns {number} usia tahun, atau -1 kalau invalid
 */
function calculateAgeInYears(dateStr) {
  if (!dateStr) return -1;
  const birthDate = parseDDMMYYYY(dateStr);
  if (isNaN(birthDate.getTime())) return -1;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function isUnder10Years(dateStr) {
  const age = calculateAgeInYears(dateStr);
  return age >= 0 && age < 10;
}

function isUnder6Years(dateStr) {
  const age = calculateAgeInYears(dateStr);
  return age >= 0 && age < 6;
}

function isOver60Years(dateStr) {
  const age = calculateAgeInYears(dateStr);
  return age >= 0 && age >= 60;
}

function setPekerjaanBasedOnAge(pekerjaan, status_usia) {
  if (status_usia === "BALITA") {
    return "Belum/Tidak Bekerja";
  } else if (status_usia === "SEKOLAH") {
    return "Pelajar";
  }
  return pekerjaan;
}

// ==================== PEKERJAAN LABEL ====================
function getPekerjaanLabel(pekerjaan) {
  if (!pekerjaan || typeof pekerjaan !== "string") return "Lainnya";

  const listPekerjaan = [
    { label: "Belum/Tidak Bekerja", value: "belum-tidak-bekerja" },
    { label: "Pelajar", value: "pelajar" },
    { label: "Mahasiswa", value: "mahasiswa" },
    { label: "Ibu Rumah Tangga", value: "ibu-rumah-tangga" },
    { label: "TNI", value: "tni" },
    { label: "POLRI", value: "polri" },
    { label: "ASN (Kantor Pemerintah)", value: "asn-kantor-pemerintah" },
    { label: "Pegawai Swasta", value: "pegawai-swasta" },
    { label: "Wirausaha/Pekerja Mandiri", value: "wirausaha-pekerja-mandiri" },
    { label: "Pensiunan", value: "pensiunan" },
    {
      label: "Pejabat Negara / Pejabat Daerah",
      value: "pejabat-negara-pejabat-daerah",
    },
    { label: "Pengusaha", value: "pengusaha" },
    { label: "Dokter", value: "dokter" },
    { label: "Bidan", value: "bidan" },
    { label: "Perawat", value: "perawat" },
    { label: "Apoteker", value: "apoteker" },
    { label: "Psikolog", value: "psikolog" },
    { label: "Tenaga Kesehatan Lainnya", value: "tenaga-kesehatan-lainnya" },
    { label: "Dosen", value: "dosen" },
    { label: "Guru", value: "guru" },
    { label: "Peneliti", value: "peneliti" },
    { label: "Pengacara", value: "pengacara" },
    { label: "Notaris", value: "notaris" },
    {
      label: "Hakim/Jaksa/Tenaga Peradilan Lainnya",
      value: "hakim-jaksa-tenaga-peradilan-lainnya",
    },
    { label: "Akuntan", value: "akuntan" },
    { label: "Insinyur", value: "insinyur" },
    { label: "Arsitek", value: "arsitek" },
    { label: "Konsultan", value: "konsultan" },
    { label: "Wartawan", value: "wartawan" },
    { label: "Pedagang", value: "pedagang" },
    { label: "Petani / Pekebun", value: "petani-pekebun" },
    { label: "Nelayan / Perikanan", value: "nelayan-perikanan" },
    { label: "Peternak", value: "peternak" },
    { label: "Tokoh Agama", value: "tokoh-agama" },
    { label: "Juru Masak", value: "juru-masak" },
    { label: "Pelaut", value: "pelaut" },
    { label: "Sopir", value: "sopir" },
    { label: "Pilot", value: "pilot" },
    { label: "Masinis", value: "masinis" },
    { label: "Atlet", value: "atlet" },
    { label: "Pekerja Seni", value: "pekerja-seni" },
    {
      label: "Penjahit / Perancang Busana",
      value: "penjahit-perancang-busana",
    },
    {
      label: "Karyawan kantor / Pegawai Administratif",
      value: "karyawan-kantor-pegawai-administratif",
    },
    { label: "Teknisi / Mekanik", value: "teknisi-mekanik" },
    { label: "Pekerja Pabrik / Buruh", value: "pekerja-pabrik-buruh" },
    { label: "Pekerja Konstruksi", value: "pekerja-konstruksi" },
    { label: "Pekerja Pertukangan", value: "pekerja-pertukangan" },
    { label: "Pekerja Migran", value: "pekerja-migran" },
    { label: "Lainnya", value: "lainnya" },
  ];

  // Mapping sinonim diperluas
  const occupationMap = {
    "belum bekerja": "belum-tidak-bekerja",
    "belum/tidak bekerja": "belum-tidak-bekerja",
    "tidak bekerja": "belum-tidak-bekerja",
    "belum / tidak bekerja": "belum-tidak-bekerja",
    "tidak/belum bekerja": "belum-tidak-bekerja",
    pelajar: "pelajar",
    "pelajar/mahasiswa": "pelajar",
    mahasiswa: "mahasiswa",
    mahasiswi: "mahasiswa",
    "ibu rumah tangga": "ibu-rumah-tangga",
    "mengurus rumah tangga": "ibu-rumah-tangga",
    irt: "ibu-rumah-tangga",
    "karyawan / pegawai": "karyawan-kantor-pegawai-administratif",
    karyawan: "karyawan-kantor-pegawai-administratif",
    "karyawan swasta": "pegawai-swasta",
    swasta: "pegawai-swasta",
    "pegawai swasta": "pegawai-swasta",
    wiraswasta: "wirausaha-pekerja-mandiri",
    wirausaha: "wirausaha-pekerja-mandiri",
    "pedagang / wirausaha": "wirausaha-pekerja-mandiri",
    pedagang: "pedagang",
    pns: "asn-kantor-pemerintah",
    asn: "asn-kantor-pemerintah",
    "tni/polri": "tni",
    tni: "tni",
    polri: "polri",
    "dokter/bidan": "dokter",
    dokter: "dokter",
    bidan: "bidan",
    "dosen/guru": "dosen",
    dosen: "dosen",
    guru: "guru",
    pensiunan: "pensiunan",
    buruh: "pekerja-pabrik-buruh",
    "buruh harian lepas": "lainnya",
    "buruh tani": "petani-pekebun",
    petani: "petani-pekebun",
    pekebun: "petani-pekebun",
    nelayan: "nelayan-perikanan",
    perikanan: "nelayan-perikanan",
    peternak: "peternak",
    pengusaha: "pengusaha",
    lainnya: "lainnya",
    "-": "lainnya",
    "": "lainnya",
  };

  // Normalisasi input: lowercase, trim, hilangkan spasi berlebih
  const key = pekerjaan.toLowerCase().trim().replace(/\s+/g, " ");
  const value = occupationMap[key] || "lainnya";
  const findPekerjaan = listPekerjaan.find((it) => it.value === value);
  return findPekerjaan ? findPekerjaan.label : "Lainnya";
}

function toSnakeCase(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getAdminList(parentEl) {
  const buttons = parentEl.querySelectorAll("button div");
  return Array.from(buttons)
    .map((div) => div.textContent.trim())
    .filter((text) => text.length > 0);
}

function getAdminText(parentEl, text) {
  const listAdmin = getAdminList(parentEl);
  const find = listAdmin.find((it) => toSnakeCase(it) === toSnakeCase(text));
  return find;
}

async function selectWithRetry(
  parentXPath,
  childText,
  maxRetries = 5,
  delay = 500,
) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sleep(delay * attempt);
      const parentEl = await waitForElementAsync(parentXPath);
      if (!parentEl) {
        console.warn(`Parent not found (attempt ${attempt}/${maxRetries})`);
        continue;
      }
      const childXPath = `.//button[.//div[contains(normalize-space(.), '${childText}')]]`;
      const childEl = await waitForElementAsync(childXPath, parentEl);
      if (childEl) {
        clickElement(childEl);
        return true;
      } else {
        console.warn(`Child not found (attempt ${attempt}/${maxRetries})`);
      }
    } catch (err) {
      console.error(`Error on attempt ${attempt}:`, err);
    }
  }
  console.error(`Failed to find ${childText} after ${maxRetries} retries`);
  return false;
}

function waitForPageLoad(timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (document.readyState === "complete") {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for page load"));
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

async function waitForCondition(
  conditionFn,
  interval = 5000,
  timeout = 300000,
) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        if (conditionFn()) resolve(true);
        else if (Date.now() - start > timeout)
          reject(new Error("waitForCondition: timeout"));
        else setTimeout(check, interval);
      } catch (err) {
        reject(err);
      }
    };
    check();
  });
}

function getPendaftaranUrl(mode) {
  return (
    MAIN_URL.PENDAFTARAN[mode.toUpperCase()] || MAIN_URL.PENDAFTARAN.INDIVIDUAL
  );
}

function getPelayananUrl(mode) {
  return (
    MAIN_URL.PELAYANAN[mode.toUpperCase()] || MAIN_URL.PELAYANAN.INDIVIDUAL
  );
}

function getPelayananDetailPemeriksaanUrl(mode) {
  return (
    MAIN_URL.PELAYANAN_DETAIL_PEMERIKSAAN[mode.toUpperCase()] ||
    MAIN_URL.PELAYANAN_DETAIL_PEMERIKSAAN.INDIVIDUAL
  );
}

// ==================== X_PATH CONSTANTS ====================
const X_PATH = {
  BTN_DAFTAR_BARU_INDIVIDU:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[2]/div[2]/div[2]/div/button",
  BTN_DAFTAR_BARU_SEKOLAH:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[2]/div[2]/div[2]/div[2]/div/button",
  INPUT_NIK:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div/div[4]/div/form/div[1]/div[1]/div[2]/div[1]/label/input",
  CHECKBOX_NO_NIK:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div/div[4]/div/form/div[1]/div[1]/div[2]/div[2]/div/div/div[1]/div",

  INPUT_NAMA_LENGKAP: "//input[@name='Nama']",
  INPUT_JENIS_KELAMIN:
    "//span[contains(text(),'Pilih jenis kelamin')]/parent::div",
  SELECT_JK_LK:
    "//div[text()='Laki-laki']/ancestor::div[contains(@class,'cursor-pointer')]",
  SELECT_JK_PR:
    "//div[text()='Perempuan']/ancestor::div[contains(@class,'cursor-pointer')]",
  INPUT_WA:
    "//label[contains(., 'No. Whatsapp Aktif')]//input[@name='Nomor Whatsapp']",
  INPUT_ALAMAT: "//textarea[@id='detail-domisili']",
  INPUT_TGL_LAHIR:
    "//div[@id='Tanggal Lahir']//div[contains(@class,'mx-input-wrapper')]",
  INPUT_TGL_LAHIR_YEAR: "//button[contains(@class,'mx-btn-current-year')]",
  INPUT_TGL_LAHIR_YEAR_TABLE: "//table[contains(@class,'mx-table-year')]",
  INPUT_TGL_LAHIR_YEAR_BEFORE:
    "//button[contains(@class,'mx-btn-icon-double-left')]",
  INPUT_TGL_LAHIR_MONTH_TABLE: "//table[contains(@class,'mx-table-month')]",
  INPUT_TGL_LAHIR_DAY_TABLE: "//table[contains(@class,'mx-table-date')]",
  INPUT_PEKERJAAN:
    "//div[contains(@class,'cursor-pointer') and contains(text(),'Pilih pekerjaan')]",
  INPUT_PEKERJAAN_PARENT:
    "//div[contains(@class,'modal-content')][.//div[text()='Pilih Pekerjaan']]",
  INPUT_NAMA_SEKOLAH:
    "//div[contains(@class,'cursor-pointer') and contains(text(),'Pilih nama sekolah')]",
  INPUT_NAMA_SEKOLAH_PARENT:
    "//div[contains(@class,'modal-content')][.//div[text()='Pilih Sekolah']]",
  INPUT_JENJANG_PENDIDIKAN:
    "//div[contains(@class,'cursor-pointer') and contains(text(),'Pilih jenjang pendidikan')]",
  INPUT_JENJANG_PENDIDIKAN_PARENT:
    "//div[contains(@class,'modal-content')][.//div[text()='Pilih jenjang pendidikan']]",
  INPUT_ALAMAT_DOMISILI:
    "//div[contains(@class,'cursor-pointer') and contains(text(),'Pilih alamat domisili')]",
  INPUT_ALAMAT_DOMISILI_PROVINSI_PARENT:
    "//div[text()='Daftar Provinsi']/parent::div",
  INPUT_ALAMAT_DOMISILI_KAB_KOTA_PARENT:
    "//div[text()='Daftar Kabupaten/Kota']/parent::div",
  INPUT_ALAMAT_DOMISILI_KECAMATAN_PARENT:
    "//div[text()='Daftar Kecamatan']/parent::div",
  INPUT_ALAMAT_DOMISILI_KEL_DESA_PARENT:
    "//div[text()='Daftar Kelurahan']/parent::div",
  INPUT_TGL_PEMERIKSAAN_PARENT:
    "//div[text()='Tanggal Pemeriksaan']/following::div[contains(@class,'shadow-gmail')][1]",
  BTN_SELANJUTNYA: "//button[.//div[normalize-space()='Selanjutnya']]",
  BTN_LANJUT_KUOTA_HABIS: "//button[.//div[normalize-space()='Lanjut']]",
  BTN_PILIH_PESERTA: "//button[.//div[text()='Pilih']]",
  BTN_DAFTAR_TANPA_NIK:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div/div[3]/div[5]/div[2]/div[2]/button",
  BTN_DAFTAR_DENGAN_NIK:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div/div[3]/div[5]/div[2]/div[1]/button",
  MSG_POPUP_TERJADI_KESALAHAN:
    "//span[contains(., 'Terjadi kesalahan')]/ancestor::div[contains(@class,'p-2')]//div[contains(@class,'my-4')]//span",
  MSG_POPUP:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[6]/div[2]/div/div[1]/div",
  MSG_POPUP_SUCCESS:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div[1]/div[1]",
  MSG_DATA_BELUM_SESUAI_KTP:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[6]/div[2]/div/div[1]/div",
  MSG_KUOTA_HABIS:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[6]/div[2]/div/div[1]/div",
  BTN_TUTUP_SUCCESS_DAFTAR:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div[3]/div[2]/button",
  BTN_TUTUP_SUCCESS_DAFTAR_PESERTA:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[2]/div[6]/div[2]/div/div[3]/div/button",
  SELECT_SEARCH:
    "//div[contains(@class, 'cursor-pointer')]//span[text()='Nomor Tiket']",
  SELECT_SEARCH_NIK: "//div[contains(@style, 'transform')]//div[text()='NIK']",
  INPUT_SEARCH: "//input[@id='nik' and @placeholder='Masukkan NIK']",
  BTN_KONFIMASI_HADIR:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[3]/div/div/table/tbody/tr/td[6]/div/div[1]/div/button",
  CHECKBOX_BERSEDIA_CKG:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[4]/div[2]/div/div[4]/div[3]/div[1]/div/div[1]/div",
  BTN_HADIR_CKG:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[4]/div[2]/div/div[5]/div[2]/button",
  MSG_POPUP_BERHASIL_HADIR: "//div[contains(., 'Berhasil Hadir')]",

  CHECKBOX_TANPA_WALI: "//div[@class='check' and @id='noWali']",
  BTN_DAFTAR_TANPA_WALI:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[3]/div[5]/div[2]/div/div/div[4]/div/form/div[5]/div[2]/button",

  // PEMERIKSAAN
  SELECT_SEARCH_PELAYANAN:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[4]/div[2]/div[2]/div[1]/div/div[2]",
  SELECT_SEARCH_NAMA_PELAYANAN:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[4]/div[2]/div[2]/div[1]/div/div[3]/div/div[3]",
  SELECT_SEARCH_NIK_PELAYANAN:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[4]/div[2]/div[2]/div[1]/div/div[3]/div/div[3]",
  INPUT_SEARCH_PELAYANAN:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[4]/div[2]/div[2]/div[2]/label/div/input",
  INPUT_SEARCH_NIK_PELAYANAN:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[4]/div[2]/div/div[2]/label/div/input",
  BTN_MULAI_PELAYANAN:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[4]/div[3]/div/table/tbody/tr/td[9]/div/div/button",
  BTN_MULAI_PEMERIKSAAN: ".//button[normalize-space(.)='Mulai Pemeriksaan']",
  BTN_MULAI_PEMERIKSAAN_SIMPAN: "//button//div[contains(text(), 'Simpan')]",
  BTN_SELESAIKAN_LAYANAN: "//button[contains(., 'Selesaikan Layanan')]",

  BTN_INPUT_GIZI:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[5]/div[2]/div[3]/div/div/div/div[1]/div[4]/div/button",
  INPUT_GIZI_BB: "//input[@id='sq_100i']",
  INPUT_GIZI_TB: "//input[@id='sq_101i']",
  INPUT_GIZI_LP: "//input[@id='sq_102i']",
  BTN_INPUT_DATA_KIRIM: "//input[@type='button' and @value='Kirim']",

  BTN_INPUT_TEKANAN_DARAH: `/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[5]/div[2]/div[3]/div/div/div/div[3]/div[4]/div/button`,
  INPUT_DARAH_SISTOLIK: "//input[@id='sq_102i']",
  INPUT_DARAH_DIASTOLIK: "//input[@id='sq_103i']",

  BTN_INPUT_GULA_DARAH:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[5]/div[2]/div[3]/div/div/div/div[2]/div[4]/div/button",
  INPUT_GDS: "//input[@id='sq_102i']",
  INPUT_GDP: "//input[@id='sq_104i']",
  BTN_KIRIM_RAPOR: `/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div/div[5]/div[1]/div[2]/div[1]/div`,
  BTN_KIRIM_RAPOR_OK:
    "/html/body/div[1]/main/div/div[1]/section[2]/div/div/div/div[2]/div[2]/div[2]/div/div[4]/div[2]/button",

  // Version 2
  INPUT_NIK_PENDAFTARAN: "//input[@id='nik']",
  BTN_CEK_NIK_PENDAFTARAN: "//button[.//div[text()='Cek NIK']]",
  BTN_GUNAKAN_NIK: "//button[.//div[normalize-space()='Gunakan Data']]",
  POPUP_NIK_TIDAK_DITEMUKAN: "//div[contains(text(),'Data Tidak Ditemukan')]",
  POPUP_INDIVIDU_SUDAH_MENERIMA_LAYANAN:
    "//div[normalize-space()='Individu sudah menerima layanan']",
  POPUP_PESERTA_SUDAH_MENERIMA_LAYANAN:
    "//div[normalize-space()='Individu sudah menerima layanan']",
  POPUP_DATA_PESERTA_VALID: "//div[normalize-space()='Data peserta valid']",
  BTN_LANJUTKAN_DATA_VALID:
    "//div[contains(normalize-space(),'Data peserta valid')]/ancestor::div[contains(@class,'shadow-gmail')]//button[.//*[normalize-space()='Lanjutkan']]",
  BTN_SELANJUTNYA_FORMULIR_PENDAFTARAN:
    "//button[.//*[normalize-space()='Selanjutnya']]",
  BTN_PILIH_TABLE_DATA_PESERTA:
    "//table/tbody/tr[1]//button[contains(., 'Pilih')]",
  BTN_DAFTARKAN_DENGAN_NIK: "//button[contains(., 'Daftarkan dengan NIK')]",
  BTN_MULAI_PEMERIKSAAN_TABLE:
    "//table//tbody/tr[1]//button[.//div[normalize-space()='Mulai']]",

  // WALI
  INPUT_NIK_WALI: "//input[@id='nik wali']",
  INPUT_NAMA_LENGKAP_WALI: "//input[@name='Nama Lengkap Wali']",
  INPUT_JENIS_KELAMIN_WALI:
    "//span[contains(text(),'Pilih Jenis Kelamin')]/parent::div",
  INPUT_WA_WALI:
    "//label[contains(., 'No. Whatsapp Wali')]//input[@name='Nomor whatsapp']",
  INPUT_TGL_LAHIR_WALI:
    "(//div[@id='Tanggal Lahir']//div[contains(@class,'mx-input-wrapper')])[2]",
  POPUP_DATA_PESERTA_WALI_TIDAK_VALID:
    "//div[normalize-space()='Data peserta atau wali tidak valid']",
  POPUP_DATA_PESERTA_TIDAK_VALID:
    "//div[normalize-space()='Data peserta tidak valid']",

  // Formulir Pendaftaran
  INPUT_STATUS_PERNIKAHAN:
    "//span[contains(text(),'Pilih status pernikahan')]/parent::div",
  INPUT_STATUS_DISABILITAS:
    "//div[contains(text(), 'Penyandang disabilitas')]/following-sibling::div//span[contains(@class, 'line-clamp-2')]",
};