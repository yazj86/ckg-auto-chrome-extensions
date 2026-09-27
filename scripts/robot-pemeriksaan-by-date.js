// ==================== ROBOT PEMERIKSAAN BY DATE ====================
// 2 Mode: Excel / DateRange
// Support tab: "Belum Pemeriksaan" / "Sedang Pemeriksaan"
//
// ✅ Fix utama:
//   1. Badge "Belum lengkap" + tombol "Selesaikan Layanan" ada → tetap isi mandiri
//      (bukan skip). Karena pemeriksaan sudah dimulai tapi form mandiri belum diisi.
//   2. Track skipTickets supaya tidak loop.

// ============================================================
// Helper: Convert "10 Sep 2013" → "10-09-2013"
// ============================================================
function convertTglUItoExcelFormat(tglUI) {
  if (!tglUI) return "";
  const bulanMap = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", Mei: "05", Jun: "06",
    Jul: "07", Agt: "08", Sep: "09", Okt: "10", Nov: "11", Des: "12",
  };
  const parts = String(tglUI).trim().split(/\s+/);
  if (parts.length !== 3) return "";
  const [dd, mmStr, yyyy] = parts;
  const mm = bulanMap[mmStr];
  if (!mm) return "";
  return `${dd.padStart(2, "0")}-${mm}-${yyyy}`;
}

// ============================================================
// Helper: Compute status_usia
// ============================================================
function computeStatusUsia(tglLahirDDMMYYYY) {
  if (!tglLahirDDMMYYYY) return "";
  const age = calculateAgeInYears(tglLahirDDMMYYYY);
  if (age < 0) return "";
  if (age < 6) return "BALITA";
  if (age >= 6 && age < 18) return "SEKOLAH";
  if (age >= 60) return "LANSIA";
  return "";
}

// ============================================================
// Helper: format tanggal
// ============================================================
function pbdFormatISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pbdFormatDisplay(isoDate) {
  const BULAN = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
  ];
  const [y, m, d] = isoDate.split("-");
  return `${parseInt(d, 10)} ${BULAN[parseInt(m, 10) - 1]} ${y}`;
}

// ============================================================
// Helper: Split rentang jadi batch 7 hari
// ============================================================
function pbdSplitDateBatches(dariISO, sampaiISO, maxDays = 7) {
  const batches = [];
  const [dy, dm, dd] = dariISO.split("-").map(Number);
  const [sy, sm, sd] = sampaiISO.split("-").map(Number);

  let cursor = new Date(dy, dm - 1, dd);
  const end = new Date(sy, sm - 1, sd);
  if (cursor > end) return [];

  while (cursor <= end) {
    const batchStart = new Date(cursor);
    const batchEnd = new Date(cursor);
    batchEnd.setDate(batchEnd.getDate() + maxDays - 1);
    if (batchEnd > end) batchEnd.setTime(end.getTime());

    batches.push({
      dari: pbdFormatISO(batchStart),
      sampai: pbdFormatISO(batchEnd),
    });

    cursor = new Date(batchEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return batches;
}

// ============================================================
// Helper: stop flag & log
// ============================================================
function pbdIsStopped() {
  return !!window.__byDateStop;
}

function pbdLog(entry) {
  if (typeof window.appendByDateLog === "function") {
    try {
      window.appendByDateLog(entry);
    } catch (e) {
      console.warn("[BY-DATE] appendByDateLog error:", e);
    }
  }
}

// ============================================================
// Helper: executeScript
// ============================================================
function pbdExecScript(tabId, func, args = []) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId }, args, func },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!results || !results[0]) {
          reject(new Error("No result from executeScript"));
          return;
        }
        resolve(results[0].result);
      },
    );
  });
}

// ============================================================
// Helper: cek halaman list + filter
// ============================================================
async function pbdGetPageInfo(tabId) {
  try {
    return await pbdExecScript(tabId, () => {
      const isListPage = !!document.querySelector(".table-individu-terdaftar");
      const filterEl = document.querySelector(
        ".mx-datepicker-range .mx-input-wrapper > div",
      );
      const filterText = filterEl ? filterEl.textContent.trim() : "";
      return { isListPage, filterText };
    });
  } catch (e) {
    return { isListPage: false, filterText: "" };
  }
}

// ============================================================
// Helper: Pastikan tab sumber aktif
// ============================================================
async function pbdEnsureTabActive(tabId, sourceTab) {
  try {
    return await pbdExecScript(
      tabId,
      async (targetTabLabel) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        const findAllTabs = () =>
          [...document.querySelectorAll(".cursor-pointer")];

        const isTabActive = (el) => {
          const cls = el.className || "";
          return (
            cls.includes("border-b-[#16B3AC]") || cls.includes("text-teal-500")
          );
        };

        const findTargetTab = () =>
          findAllTabs().find((el) =>
            (el.textContent || "").trim().includes(targetTabLabel),
          );

        let target = findTargetTab();
        if (!target) {
          return {
            ok: false,
            message: `Tab "${targetTabLabel}" tidak ditemukan di halaman`,
          };
        }

        if (isTabActive(target)) {
          return { ok: true, alreadyActive: true };
        }

        target.click();
        await sleep(2000);

        target = findTargetTab();
        const ok = target && isTabActive(target);

        return {
          ok: ok === true,
          alreadyActive: false,
          message: ok ? "Tab switched" : "Gagal switch tab",
        };
      },
      [sourceTab],
    );
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

// ============================================================
// Helper: Set filter tanggal
// ============================================================
async function pbdApplyDateFilter(tabId, dariISO, sampaiISO) {
  return await pbdExecScript(
    tabId,
    async (dari, sampai) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const BULAN = [
        "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
      ];
      const fmtDisplay = (iso) => {
        const [y, m, d] = iso.split("-");
        return `${parseInt(d, 10)} ${BULAN[parseInt(m, 10) - 1]} ${y}`;
      };
      const targetText = `${fmtDisplay(dari)} - ${fmtDisplay(sampai)}`;

      const displayEl = document.querySelector(
        ".mx-datepicker-range .mx-input-wrapper > div",
      );
      if (!displayEl) {
        return { success: false, message: "Datepicker range tidak ditemukan." };
      }

      const currentText = displayEl.textContent.trim();
      if (currentText === targetText) {
        return { success: true, alreadySet: true, filterText: currentText };
      }

      const wrapper =
        displayEl.closest(".mx-input-wrapper") || displayEl.parentElement;
      wrapper.click();
      ["mousedown", "mouseup", "click"].forEach((ev) =>
        wrapper.dispatchEvent(
          new MouseEvent(ev, {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        ),
      );
      await sleep(700);

      let popup = document.querySelector(".mx-datepicker-main");
      if (!popup) {
        await sleep(800);
        popup = document.querySelector(".mx-datepicker-main");
      }
      if (!popup)
        return { success: false, message: "Popup datepicker tidak muncul." };

      const readPanelMonth = () => {
        const firstPanel = popup.querySelector(".mx-calendar-panel-date");
        if (!firstPanel) return null;
        const monthBtn = firstPanel.querySelector(".mx-btn-current-month");
        const yearBtn = firstPanel.querySelector(".mx-btn-current-year");
        if (!monthBtn || !yearBtn) return null;
        const monthText = monthBtn.textContent.trim();
        const yearText = yearBtn.textContent.trim();
        const monthIdx = BULAN.findIndex((b) => b === monthText) + 1;
        return {
          year: parseInt(yearText, 10),
          month: monthIdx,
          monthText,
          yearText,
        };
      };

      const navigateToMonth = async (targetYear, targetMonth) => {
        let guard = 0;
        const MAX_GUARD = 80;
        const log = [];

        while (guard < MAX_GUARD) {
          guard++;
          const cur = readPanelMonth();
          if (!cur) {
            log.push("panel-read-fail");
            return { success: false, log };
          }
          const diffMonths =
            (cur.year - targetYear) * 12 + (cur.month - targetMonth);
          if (diffMonths === 0) {
            log.push(`reached: ${cur.monthText} ${cur.yearText}`);
            return { success: true, log };
          }
          const firstPanel = popup.querySelector(".mx-calendar-panel-date");
          if (!firstPanel) return { success: false, log };

          let btn = null;
          if (diffMonths >= 12) {
            btn = firstPanel.querySelector(".mx-btn-icon-double-left");
          } else if (diffMonths > 0) {
            btn = firstPanel.querySelector(".mx-btn-icon-left");
          } else if (diffMonths <= -12) {
            btn = firstPanel.querySelector(".mx-btn-icon-double-right");
          } else {
            btn = firstPanel.querySelector(".mx-btn-icon-right");
          }
          if (!btn) {
            log.push("btn-not-found");
            return { success: false, log };
          }
          btn.click();
          await sleep(280);
        }
        log.push("max-guard-reached");
        return { success: false, log };
      };

      const clickCell = async (iso) => {
        const cell = popup.querySelector(`td.cell[title="${iso}"]`);
        if (!cell) return { ok: false, reason: "not-found" };
        if (cell.classList.contains("disabled"))
          return { ok: false, reason: "disabled" };
        cell.click();
        return { ok: true };
      };

      const [dariYear, dariMonth] = dari.split("-").map(Number);
      const navDari = await navigateToMonth(dariYear, dariMonth);
      if (!navDari.success) {
        document.body.click();
        return {
          success: false,
          message: `Gagal navigasi ke "${fmtDisplay(dari)}": ${navDari.log.join(" > ")}`,
        };
      }
      await sleep(200);

      const rDari = await clickCell(dari);
      if (!rDari.ok) {
        document.body.click();
        return {
          success: false,
          message: `Tanggal "${dari}" ${rDari.reason} setelah navigasi.`,
        };
      }
      await sleep(600);

      let rSampai = await clickCell(sampai);
      if (!rSampai.ok) {
        const [sampaiYear, sampaiMonth] = sampai.split("-").map(Number);
        const navSampai = await navigateToMonth(sampaiYear, sampaiMonth);
        if (!navSampai.success) {
          document.body.click();
          return {
            success: false,
            message: `Gagal navigasi ke "${fmtDisplay(sampai)}": ${navSampai.log.join(" > ")}`,
          };
        }
        await sleep(300);
        rSampai = await clickCell(sampai);
      }
      if (!rSampai.ok) {
        document.body.click();
        return {
          success: false,
          message: `Tanggal "${sampai}" ${rSampai.reason}.`,
        };
      }
      await sleep(500);

      document.body.click();
      await sleep(700);

      const afterText = displayEl.textContent.trim();
      const expected =
        afterText.includes(fmtDisplay(dari)) &&
        afterText.includes(fmtDisplay(sampai));

      return {
        success: expected,
        filterText: afterText,
        expected: targetText,
        message: expected
          ? "Filter berhasil diset."
          : `Filter tidak cocok (dapat: "${afterText}", ekspektasi: "${targetText}").`,
      };
    },
    [dariISO, sampaiISO],
  );
}

// ============================================================
// Helper: cek filter match
// ============================================================
async function pbdIsFilterMatch(tabId, dariISO, sampaiISO) {
  const pageInfo = await pbdGetPageInfo(tabId);
  if (!pageInfo.isListPage) {
    return { match: false, pageInfo, filterText: "" };
  }
  const displayDari = pbdFormatDisplay(dariISO);
  const displaySampai = pbdFormatDisplay(sampaiISO);
  const filterText = pageInfo.filterText || "";
  const match =
    filterText.includes(displayDari) && filterText.includes(displaySampai);
  return { match, pageInfo, filterText };
}

// ============================================================
// Helper: tunggu tabel stabil
// ============================================================
async function pbdWaitForTableReady(tabId, timeout = 10000) {
  try {
    return await pbdExecScript(
      tabId,
      async (t) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const start = Date.now();

        const isActionLabel = (text) => {
          const tx = (text || "").trim().toLowerCase();
          return (
            tx.includes("mulai") ||
            tx.includes("lanjut") ||
            tx.includes("detail") ||
            tx.includes("buka") ||
            tx.includes("periksa")
          );
        };

        while (Date.now() - start < t) {
          const rows = document.querySelectorAll(
            ".table-individu-terdaftar table tbody tr",
          );
          if (rows.length > 0) {
            for (const row of rows) {
              const cells = row.querySelectorAll("td");
              if (cells.length < 9) continue;
              const btn = cells[8]?.querySelector("button");
              if (btn && isActionLabel(btn.textContent)) {
                return { ready: true, rows: rows.length };
              }
            }
            await sleep(300);
            continue;
          }
          await sleep(300);
        }
        return { ready: false, rows: 0 };
      },
      [timeout],
    );
  } catch (e) {
    return { ready: false, error: e.message };
  }
}

// ============================================================
// Helper: klik tombol back
// ============================================================
async function pbdGoBackToList(tabId) {
  try {
    return await pbdExecScript(tabId, () => {
      const backImg = document.querySelector('img[src*="icon-arrow-left"]');
      if (backImg) {
        (backImg.closest(".cursor-pointer") || backImg).click();
        return true;
      }
      const btns = [...document.querySelectorAll("button, .cursor-pointer")];
      const backBtn = btns.find((el) => el.textContent.includes("Kembali"));
      if (backBtn) {
        backBtn.click();
        return true;
      }
      window.history.back();
      return true;
    });
  } catch (e) {
    return false;
  }
}

// ============================================================
// Helper: tunggu list page ready
// ============================================================
async function pbdWaitForListPage(tabId, timeout = 15000) {
  try {
    return await pbdExecScript(
      tabId,
      async (t) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const start = Date.now();
        while (Date.now() - start < t) {
          if (document.querySelector(".table-individu-terdaftar")) return true;
          await sleep(300);
        }
        return false;
      },
      [timeout],
    );
  } catch (e) {
    return false;
  }
}

// ============================================================
// Helper: Bersihkan search box
// ============================================================
async function pbdClearSearch(tabId) {
  try {
    return await pbdExecScript(tabId, async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      if (typeof X_PATH !== "undefined" && typeof clickElement === "function") {
        try {
          const selectSearch = await waitForElementAsync(
            X_PATH.SELECT_SEARCH_PELAYANAN,
            null,
            3000,
          );
          if (selectSearch) {
            clickElement(selectSearch);
            await sleep(600);

            const findOpt = (text) =>
              [...document.querySelectorAll("div.cursor-pointer")].find(
                (el) => {
                  const cls = el.className || "";
                  return (
                    cls.includes("py-2") &&
                    cls.includes("px-4") &&
                    el.textContent.trim() === text
                  );
                },
              );

            const optNama = findOpt("Nama");
            if (optNama) {
              optNama.click();
              await sleep(500);
            }

            const input = await waitForElementAsync(
              X_PATH.INPUT_SEARCH_NIK_PELAYANAN,
              null,
              3000,
            );
            if (input) {
              if (typeof forceInput === "function") {
                forceInput(input, "");
              } else {
                input.value = "";
                ["input", "change"].forEach((e) =>
                  input.dispatchEvent(new Event(e, { bubbles: true })),
                );
              }
              await sleep(400);
              if (typeof enterKeyElement === "function") {
                enterKeyElement(input);
              }
              await sleep(1200);
            }
          }
        } catch (e) {
          console.warn("[PBD-CLEAR] error:", e);
        }
      }
      return true;
    });
  } catch (e) {
    return false;
  }
}

// ============================================================
// SEARCH & START
// ✅ Fix: badge "Belum lengkap" + ada "Selesaikan Layanan" → alreadyStarted
// ============================================================
async function pbdSearchAndStart(tabId, target, options = {}) {
  const {
    sourceTab = "Belum Pemeriksaan",
    mulai = true,
    requireIncomplete = false,
  } = options;

  try {
    return await pbdExecScript(
      tabId,
      async (opts) => {
        const {
          targetNIK,
          targetNama,
          sourceTab,
          mulai,
          requireIncomplete,
        } = opts;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        if (typeof X_PATH === "undefined") {
          return {
            success: false,
            message:
              "X_PATH tidak tersedia di halaman. Pastikan helper.js dimuat sebagai content script.",
          };
        }
        if (typeof waitForElementAsync !== "function") {
          return {
            success: false,
            message: "helper.js tidak dimuat di halaman.",
          };
        }

        const log = (msg) => console.log(`[PBD-SEARCH] ${msg}`);

        const findDropdownOption = (text) => {
          return [...document.querySelectorAll("div.cursor-pointer")].find(
            (el) => {
              const cls = el.className || "";
              return (
                cls.includes("py-2") &&
                cls.includes("px-4") &&
                el.textContent.trim() === text
              );
            },
          );
        };

        const waitForDropdownOption = async (text, timeout = 5000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            const found = findDropdownOption(text);
            if (found) return found;
            await sleep(200);
          }
          return null;
        };

        const isOnListPage = () =>
          !!document.querySelector(".table-individu-terdaftar");
        const isOnDetailPage = () =>
          window.location.href.includes("/detail-pemeriksaan") ||
          !!document.querySelector('img[src*="icon-arrow-left"]');

        const waitUntil = async (fn, timeout = 15000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            if (fn()) return true;
            await sleep(300);
          }
          return false;
        };

        const waitForXPath = (xpath, parentEl = document, timeout = 5000) => {
          return new Promise((resolve, reject) => {
            let settled = false;
            const start = Date.now();
            function check() {
              if (settled) return;
              let el = null;
              try {
                el = document.evaluate(
                  xpath,
                  parentEl,
                  null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE,
                  null,
                ).singleNodeValue;
              } catch (e) {}
              if (el) {
                settled = true;
                resolve(el);
              } else if (Date.now() - start > timeout) {
                settled = true;
                reject(new Error(`Timeout: ${xpath}`));
              } else {
                setTimeout(check, 200);
              }
            }
            check();
          });
        };

        const isActionLabel = (text) => {
          const tx = (text || "").trim().toLowerCase();
          return (
            tx.includes("mulai") ||
            tx.includes("lanjut") ||
            tx.includes("detail") ||
            tx.includes("buka") ||
            tx.includes("periksa")
          );
        };

        if (!isOnListPage()) {
          return { success: false, message: "Bukan di list page" };
        }

        // Pastikan tab sumber aktif
        const tabs = [...document.querySelectorAll(".cursor-pointer")];
        const targetTab = tabs.find((el) =>
          (el.textContent || "").trim().includes(sourceTab),
        );

        if (targetTab) {
          const cls = targetTab.className || "";
          const isActive =
            cls.includes("border-b-[#16B3AC]") || cls.includes("text-teal-500");

          if (!isActive) {
            log(`Switch ke tab "${sourceTab}"...`);
            targetTab.click();
            await sleep(2200);
          }
        }
        await sleep(400);

        // STEP 1: Cari by NAMA
        log("1. Coba pencarian by Nama...");

        const selectSearch = await waitForElementAsync(
          X_PATH.SELECT_SEARCH_PELAYANAN,
        );
        clickElement(selectSearch);
        await sleep(800);

        log("   → Pilih opsi 'Nama'...");
        const optNama = await waitForDropdownOption("Nama");
        if (!optNama) {
          return {
            success: false,
            message: "Opsi 'Nama' tidak ditemukan di dropdown",
          };
        }
        clickElement(optNama);
        await sleep(800);

        const inputSearch = await waitForElementAsync(
          X_PATH.INPUT_SEARCH_NIK_PELAYANAN,
          null,
          5000,
        );
        if (!inputSearch) {
          return { success: false, message: "Input search tidak ditemukan" };
        }

        const namaBersih = String(targetNama || "").split(",")[0].trim();
        log(`   → Cari nama: "${namaBersih}"`);
        forceInput(inputSearch, namaBersih);
        await sleep(800);
        enterKeyElement(inputSearch);
        await sleepUntilLoaded(750, "Proses pencarian data", 20);

        await sleep(1000);
        const hasilRows = document.querySelectorAll("table tbody tr");
        const jumlahHasil = hasilRows.length;
        log(`   → Hasil Nama: ${jumlahHasil} peserta`);

        if (jumlahHasil === 1) {
          log("   ✅ Nama unik ditemukan. Pakai peserta ini.");
        } else {
          if (jumlahHasil === 0) {
            log("   ⚠️ Nama tidak ditemukan. Fallback ke NIK...");
          } else {
            log(
              `   ⚠️ Nama duplikat (${jumlahHasil} hasil). Fallback ke NIK...`,
            );
          }

          forceInput(inputSearch, "");
          await sleep(500);

          clickElement(selectSearch);
          await sleep(800);

          const optNik = await waitForDropdownOption("NIK");
          if (!optNik) {
            return {
              success: false,
              message: "Opsi 'NIK' tidak ditemukan di dropdown",
            };
          }
          clickElement(optNik);
          await sleep(800);

          log(`   → Cari NIK: ${targetNIK}`);
          forceInput(inputSearch, String(targetNIK || ""));
          await sleep(800);
          enterKeyElement(inputSearch);
          await sleepUntilLoaded(750, "Proses pencarian data", 20);

          await sleep(1000);
          const hasilNik = document.querySelectorAll("table tbody tr");
          log(`   → Hasil NIK: ${hasilNik.length} peserta`);

          if (hasilNik.length >= 1) {
            log(`   ✅ NIK ditemukan: ${hasilNik.length} peserta.`);
          } else {
            log("   ⚠️ NIK juga tidak ditemukan. Peserta di-skip.");
            return {
              success: false,
              status: "SKIP",
              notFound: true,
              message: `Peserta tidak ditemukan. Nama="${namaBersih}", NIK=${targetNIK}`,
            };
          }
        }

        // STEP 3: Cari baris target
        log("2. Cari baris target...");

        const rows = document.querySelectorAll(
          ".table-individu-terdaftar table tbody tr",
        );
        let targetRow = null;
        let btnText = "";
        let skippedDueToComplete = false;

        for (const row of rows) {
          const cells = row.querySelectorAll("td");
          if (cells.length < 9) continue;
          const btn = cells[8]?.querySelector("button");
          if (!btn || !isActionLabel(btn.textContent)) continue;

          if (requireIncomplete) {
            const mandiriBadge = (cells[6]?.textContent || "")
              .trim()
              .toLowerCase();
            if (!mandiriBadge.includes("belum lengkap")) {
              log(
                `   → Skip baris — badge "${mandiriBadge}" (sudah lengkap)`,
              );
              skippedDueToComplete = true;
              continue;
            }
          }

          targetRow = row;
          btnText = (btn.textContent || "").trim();
          break;
        }

        if (!targetRow) {
          return {
            success: false,
            message: skippedDueToComplete
              ? "Form mandiri sudah lengkap (skip)"
              : "Baris dengan tombol aksi tidak ditemukan",
            notFound: true,
            alreadyComplete: skippedDueToComplete,
          };
        }

        const cells = targetRow.querySelectorAll("td");
        const itemInfo = {
          nama: cells[1]?.textContent.trim() || "",
          tglLahir: cells[2]?.textContent.trim() || "",
          noTiket: cells[3]?.textContent.trim() || "",
        };

        log(`   → Klik "${btnText}" untuk ${itemInfo.nama}`);
        targetRow.querySelectorAll("td")[8]?.querySelector("button").click();

        // Tunggu detail page
        const detailOk = await waitUntil(isOnDetailPage, 15000);
        if (!detailOk) {
          return {
            success: false,
            message: "Halaman detail tidak muncul",
            item: itemInfo,
          };
        }
        await sleep(1500);

        // Cek "Selesaikan Layanan"
        let btnSelesaikan = null;
        try {
          btnSelesaikan = await waitForXPath(
            "//button[contains(., 'Selesaikan Layanan')]",
            document,
            3000,
          );
        } catch (e) {}

        if (btnSelesaikan) {
          // ✅ FIX: kalau requireIncomplete (badge "Belum lengkap"),
          // tetap lanjut isi mandiri meskipun sudah ada Selesaikan
          if (requireIncomplete) {
            return {
              success: true,
              item: itemInfo,
              skipped: false,
              alreadyStarted: true,
              needMandiri: true,
            };
          }
          return { success: true, item: itemInfo, skipped: true };
        }

        if (!mulai) {
          return {
            success: true,
            item: itemInfo,
            skipped: false,
            onlyNavigated: true,
          };
        }

        // Klik Mulai Pemeriksaan (kalau ada)
        let btnMulai = null;
        try {
          btnMulai = await waitForXPath(
            "//button[normalize-space(.)='Mulai Pemeriksaan']",
            document,
            5000,
          );
        } catch (e) {}

        if (btnMulai) {
          log("3. Klik Mulai Pemeriksaan → Simpan...");
          btnMulai.click();
          await sleep(800);

          let btnSimpan = null;
          try {
            btnSimpan = await waitForXPath(
              "//button//div[contains(text(), 'Simpan')]",
              document,
              10000,
            );
          } catch (e) {}

          if (btnSimpan) {
            btnSimpan.click();
            await sleep(2000);
          }
        } else {
          log("3. Tombol Mulai Pemeriksaan tidak ada");
        }

        await waitForXPath(
          "//button[contains(., 'Selesaikan Layanan')]",
          document,
          60000,
        );

        return { success: true, item: itemInfo, skipped: false };
      },
      [
        {
          targetNIK: target.nik || "",
          targetNama: target.nama || "",
          sourceTab,
          mulai,
          requireIncomplete,
        },
      ],
    );
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ============================================================
// MODE DATE RANGE: pbdStartFirstRow
// ✅ Fix: badge "Belum lengkap" + "Selesaikan Layanan" → alreadyStarted
// ============================================================
async function pbdStartFirstRow(tabId, options = {}) {
  const {
    sourceTab = "Belum Pemeriksaan",
    mulai = true,
    skipTickets = [],
    requireIncomplete = false,
  } = options;

  try {
    return await pbdExecScript(
      tabId,
      async (opts) => {
        const { sourceTab, mulai, skipTickets, requireIncomplete } = opts;
        const skipSet = new Set(skipTickets || []);
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        const waitForXPath = (xpath, parentEl = document, timeout = 5000) => {
          return new Promise((resolve, reject) => {
            let settled = false;
            const start = Date.now();
            function check() {
              if (settled) return;
              let el = null;
              try {
                el = document.evaluate(
                  xpath,
                  parentEl,
                  null,
                  XPathResult.FIRST_ORDERED_NODE_TYPE,
                  null,
                ).singleNodeValue;
              } catch (e) {}
              if (el) {
                settled = true;
                resolve(el);
              } else if (Date.now() - start > timeout) {
                settled = true;
                reject(new Error(`Timeout: ${xpath}`));
              } else {
                setTimeout(check, 200);
              }
            }
            check();
          });
        };

        const waitUntil = async (fn, timeout = 15000) => {
          const start = Date.now();
          while (Date.now() - start < timeout) {
            if (fn()) return true;
            await sleep(300);
          }
          return false;
        };

        const isOnListPage = () =>
          !!document.querySelector(".table-individu-terdaftar");
        const isOnDetailPage = () =>
          window.location.href.includes("/detail-pemeriksaan") ||
          !!document.querySelector('img[src*="icon-arrow-left"]');

        const isActionLabel = (text) => {
          const tx = (text || "").trim().toLowerCase();
          return (
            tx.includes("mulai") ||
            tx.includes("lanjut") ||
            tx.includes("detail") ||
            tx.includes("buka") ||
            tx.includes("periksa")
          );
        };

        if (!isOnListPage())
          return { success: false, message: "Bukan di list page" };

        const tabs = [...document.querySelectorAll(".cursor-pointer")];
        const targetTab = tabs.find((el) =>
          (el.textContent || "").trim().includes(sourceTab),
        );

        if (targetTab) {
          const cls = targetTab.className || "";
          const isActive =
            cls.includes("border-b-[#16B3AC]") || cls.includes("text-teal-500");

          if (!isActive) {
            console.log(`[PBD] Switch ke tab "${sourceTab}"...`);
            targetTab.click();
            await sleep(2200);
          }
        }
        await sleep(400);

        const rows = document.querySelectorAll(
          ".table-individu-terdaftar table tbody tr",
        );
        let targetRow = null;
        let itemInfo = null;
        let skippedCount = 0;

        for (const row of rows) {
          const cells = row.querySelectorAll("td");
          if (cells.length < 9) continue;
          const btn = cells[8]?.querySelector("button");
          if (!btn || !isActionLabel(btn.textContent)) continue;

          const rowTiket = (cells[3]?.textContent || "").trim();

          if (skipSet.has(rowTiket)) {
            skippedCount++;
            console.log(`[PBD] Skip tiket "${rowTiket}" (sudah diproses)`);
            continue;
          }

          if (requireIncomplete) {
            const mandiriBadge = (cells[6]?.textContent || "")
              .trim()
              .toLowerCase();
            if (!mandiriBadge.includes("belum lengkap")) {
              console.log(
                `[PBD] Skip "${rowTiket}" — badge: "${mandiriBadge}" (bukan Belum lengkap)`,
              );
              skippedCount++;
              continue;
            }
          }

          targetRow = row;
          itemInfo = {
            nama: cells[1]?.textContent.trim() || "",
            tglLahir: cells[2]?.textContent.trim() || "",
            noTiket: rowTiket,
          };
          break;
        }

        if (!targetRow) {
          return {
            success: true,
            noRows: true,
            skippedCount,
            message:
              skippedCount > 0
                ? `Semua baris (${skippedCount}) sudah diproses / lengkap`
                : "Tidak ada baris dengan tombol aksi",
          };
        }

        targetRow.querySelectorAll("td")[8]?.querySelector("button").click();

        const detailOk = await waitUntil(isOnDetailPage, 15000);
        if (!detailOk) {
          return {
            success: false,
            message: "Halaman detail tidak muncul",
            item: itemInfo,
          };
        }
        await sleep(1500);

        let btnSelesaikan = null;
        try {
          btnSelesaikan = await waitForXPath(
            "//button[contains(., 'Selesaikan Layanan')]",
            document,
            3000,
          );
        } catch (e) {}

        if (btnSelesaikan) {
          // ✅ FIX: badge "Belum lengkap" → tetap lanjut isi mandiri
          if (requireIncomplete) {
            return {
              success: true,
              item: itemInfo,
              skipped: false,
              alreadyStarted: true,
              needMandiri: true,
            };
          }
          return { success: true, item: itemInfo, skipped: true };
        }

        if (!mulai) {
          return {
            success: true,
            item: itemInfo,
            skipped: false,
            onlyNavigated: true,
          };
        }

        let btnMulai = null;
        try {
          btnMulai = await waitForXPath(
            "//button[normalize-space(.)='Mulai Pemeriksaan']",
            document,
            5000,
          );
        } catch (e) {}

        if (btnMulai) {
          btnMulai.click();
          await sleep(800);

          let btnSimpan = null;
          try {
            btnSimpan = await waitForXPath(
              "//button//div[contains(text(), 'Simpan')]",
              document,
              10000,
            );
          } catch (e) {}

          if (btnSimpan) {
            btnSimpan.click();
            await sleep(2000);
          }
        }

        await waitForXPath(
          "//button[contains(., 'Selesaikan Layanan')]",
          document,
          60000,
        );

        return { success: true, item: itemInfo, skipped: false };
      },
      [{ sourceTab, mulai, skipTickets, requireIncomplete }],
    );
  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ============================================================
// Retry single
// ============================================================
async function retryByDateSingle(item, mode, options = {}) {
  const { mandiri = true, sourceTab = "Belum Pemeriksaan" } = options;

  const url = getPelayananUrl(mode);
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const targetTabId = tab.id;
  const targetOrigin = new URL(url).origin;

  if (!tab.url || !tab.url.startsWith(targetOrigin)) {
    return { success: false, message: "Tab aktif bukan di halaman pelayanan." };
  }

  const pageInfo = await pbdGetPageInfo(targetTabId);
  if (!pageInfo.isListPage) {
    await pbdGoBackToList(targetTabId);
    await pbdWaitForListPage(targetTabId, 8000);
  }

  await pbdClearSearch(targetTabId);

  const step1 = await pbdSearchAndStart(
    targetTabId,
    { nik: item.tiket, nama: item.nama },
    { sourceTab, mulai: true, requireIncomplete: false },
  );

  if (!step1?.success) {
    return {
      success: false,
      notFound: step1?.notFound || false,
      message: step1?.message || "Gagal buka peserta.",
    };
  }

  if (step1.skipped) {
    await pbdGoBackToList(targetTabId);
    await pbdWaitForListPage(targetTabId, 15000);
    await pbdClearSearch(targetTabId);
    return { success: true, message: "Sudah diproses sebelumnya (skip)" };
  }

  if (step1.onlyNavigated) {
    await pbdGoBackToList(targetTabId);
    await pbdWaitForListPage(targetTabId, 15000);
    await pbdClearSearch(targetTabId);
    return { success: true, message: "Hanya navigasi (mulai nonaktif)" };
  }

  if (mandiri && typeof runPemeriksaanMandiri === "function") {
    const tglLahirDDMMYYYY = convertTglUItoExcelFormat(item.tglLahir);
    const statusUsia = computeStatusUsia(tglLahirDDMMYYYY);

    const syntheticIData = {
      no: 0,
      nik: item.tiket,
      nama: item.nama,
      tgl_lahir: tglLahirDDMMYYYY,
      status_usia: statusUsia,
    };

    try {
      const mandiriResult = await runPemeriksaanMandiri(
        syntheticIData,
        mode,
      );

      await pbdGoBackToList(targetTabId);
      await pbdWaitForListPage(targetTabId, 15000);
      await pbdClearSearch(targetTabId);

      if (mandiriResult?.pemeriksaan_mandiri === "OK") {
        return { success: true, message: "Retry berhasil" };
      }
      return {
        success: false,
        message:
          mandiriResult?.keterangan || "Form mandiri masih belum lengkap",
      };
    } catch (err) {
      try {
        await pbdGoBackToList(targetTabId);
        await pbdWaitForListPage(targetTabId, 15000);
        await pbdClearSearch(targetTabId);
      } catch (e) {}

      return { success: false, message: err.message };
    }
  }

  await pbdGoBackToList(targetTabId);
  await pbdWaitForListPage(targetTabId, 15000);
  await pbdClearSearch(targetTabId);
  return { success: true, message: "Selesai (tanpa mandiri)" };
}

// ============================================================
// Proses mandiri untuk 1 peserta
// ============================================================
async function pbdProcessMandiri(item, mode, shouldFillMandiri, indexLabel) {
  let status = "WARN";
  let keterangan = "";

  if (!shouldFillMandiri) {
    return {
      status: "OK",
      keterangan: "Pemeriksaan dimulai (tanpa mandiri)",
    };
  }

  try {
    const tglLahirDDMMYYYY = convertTglUItoExcelFormat(item.tglLahir);
    const statusUsia = computeStatusUsia(tglLahirDDMMYYYY);

    appendPanelMessage(
      `      → Tgl: ${item.tglLahir} → ${tglLahirDDMMYYYY} | Usia: ${statusUsia || "(dewasa)"}`,
    );

    const defaultCheck = getDefaultPemeriksaanData();
    appendPanelMessage(
      `      → Inject ${Object.keys(defaultCheck).length} field default`,
    );

    const syntheticIData = {
      no: indexLabel || 1,
      nik: item.noTiket || item.tiket || "",
      nama: item.nama || "",
      tgl_lahir: tglLahirDDMMYYYY,
      status_usia: statusUsia,
    };

    const mandiriResult = await runPemeriksaanMandiri(syntheticIData, mode);

    if (mandiriResult?.pemeriksaan_mandiri === "OK") {
      status = "OK";
      keterangan = "Form mandiri berhasil di-autofill";
    } else if (mandiriResult?.pemeriksaan_mandiri === "LEWATI") {
      status = "SKIP";
      keterangan = "Tidak ada form mandiri";
    } else {
      status = "WARN";
      keterangan =
        mandiriResult?.keterangan || "Masih ada data yang belum terisi!";
    }
  } catch (err) {
    status = "GAGAL";
    keterangan = err.message;
  }

  return { status, keterangan };
}

// ============================================================
// MODE EXCEL
// ✅ Fix: handle alreadyStarted
// ============================================================
async function pbdRunExcelMode({
  mode,
  targetTabId,
  excelTargets,
  sourceTab,
  optMulai,
  optMandiri,
  stats,
}) {
  appendPanelMessage(
    `\n📄 ===== MODE EXCEL: ${excelTargets.length} target =====`,
  );

  const shouldFillMandiri =
    optMandiri && typeof runPemeriksaanMandiri === "function";

  const skipTickets = new Set();
  const requireIncomplete = sourceTab === "Sedang Pemeriksaan";

  if (requireIncomplete) {
    appendPanelMessage(
      `   ℹ️ Hanya proses badge "Belum lengkap" (tab Sedang Pemeriksaan)`,
    );
  }

  const targetStatus = excelTargets.map((t) => ({
    ...t,
    done: false,
    result: null,
  }));

  for (let i = 0; i < targetStatus.length; i++) {
    if (pbdIsStopped()) {
      appendPanelMessage("\n⏹️ Stop diminta user.");
      break;
    }

    const target = targetStatus[i];
    const label = target.nik || target.nama || `target-${i + 1}`;

    if (target.nik && skipTickets.has(target.nik)) {
      appendPanelMessage(
        `\n📄 [${i + 1}/${targetStatus.length}] ${target.nama} — ⏭️ sudah diproses`,
      );
      stats.skipped++;
      target.result = "SKIP";
      target.done = true;
      continue;
    }

    appendPanelMessage(
      `\n📄 [${i + 1}/${targetStatus.length}] Target: ${target.nama || "(no nama)"} | NIK: ${target.nik || "-"}`,
    );

    let pageInfo = await pbdGetPageInfo(targetTabId);
    if (!pageInfo.isListPage) {
      await pbdGoBackToList(targetTabId);
      await pbdWaitForListPage(targetTabId, 10000);
    }

    await pbdEnsureTabActive(targetTabId, sourceTab);
    await pbdClearSearch(targetTabId);

    const step1 = await pbdSearchAndStart(
      targetTabId,
      { nik: target.nik, nama: target.nama },
      { sourceTab, mulai: optMulai, requireIncomplete },
    );

    if (!step1 || !step1.success) {
      if (step1 && step1.alreadyComplete) {
        stats.skipped++;
        target.result = "SKIP";
        target.done = true;
        appendPanelMessage(`   ✅ Form mandiri sudah lengkap (skip).`);

        if (target.nik) skipTickets.add(target.nik);

        pbdLog({
          nama: target.nama || "-",
          tglLahir: target.tgl_lahir || "-",
          tiket: target.nik || "-",
          status: "SKIP",
          keterangan: "Form mandiri sudah lengkap",
        });

        await pbdGoBackToList(targetTabId);
        await pbdWaitForListPage(targetTabId, 10000);
        await pbdEnsureTabActive(targetTabId, sourceTab);
        await pbdClearSearch(targetTabId);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      if (step1 && step1.notFound) {
        appendPanelMessage(`   ⚠️ Tidak ditemukan di halaman.`);
        stats.failed++;
        target.result = "NOT_FOUND";
        target.done = true;

        pbdLog({
          nama: target.nama || "-",
          tglLahir: target.tgl_lahir || "-",
          tiket: target.nik || "-",
          status: "WARN",
          keterangan: "Target tidak ditemukan di halaman",
        });

        continue;
      }

      stats.failed++;
      target.result = "ERROR";
      target.done = true;
      const errMsg = step1?.message || "Unknown error";
      stats.errors.push(`Target ${label}: ${errMsg}`);
      appendPanelMessage(`   ❌ Gagal: ${errMsg}`);

      pbdLog({
        nama: target.nama || "-",
        tglLahir: target.tgl_lahir || "-",
        tiket: target.nik || "-",
        status: "GAGAL",
        keterangan: errMsg,
      });

      await pbdGoBackToList(targetTabId);
      await pbdWaitForListPage(targetTabId, 10000);
      await pbdEnsureTabActive(targetTabId, sourceTab);
      await pbdClearSearch(targetTabId);
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    const item = step1.item || {
      nama: target.nama,
      tglLahir: target.tgl_lahir,
      noTiket: target.nik,
    };

    if (step1.skipped) {
      stats.skipped++;
      target.result = "SKIP";
      target.done = true;
      appendPanelMessage(`   ⏭️ Sudah diproses sebelumnya.`);

      if (item.noTiket) skipTickets.add(item.noTiket);

      pbdLog({
        nama: item.nama || "-",
        tglLahir: item.tglLahir || "-",
        tiket: item.noTiket || "-",
        status: "SKIP",
        keterangan: "Sudah diproses sebelumnya",
      });
    } else if (step1.onlyNavigated) {
      stats.processed++;
      target.result = "WARN";
      target.done = true;
      appendPanelMessage(`   ✅ Dibuka tanpa mulai pemeriksaan.`);

      if (item.noTiket) skipTickets.add(item.noTiket);

      pbdLog({
        nama: item.nama || "-",
        tglLahir: item.tglLahir || "-",
        tiket: item.noTiket || "-",
        status: "WARN",
        keterangan: "Hanya navigasi (mulai nonaktif)",
      });
    } else {
      // ✅ FIX: handle alreadyStarted
      if (step1.alreadyStarted) {
        appendPanelMessage(
          `   🔄 Sudah dimulai, tetap isi form mandiri...`,
        );
      } else {
        appendPanelMessage(`   ✅ Pemeriksaan dimulai.`);
      }

      stats.processed++;

      if (shouldFillMandiri) {
        appendPanelMessage(`   📝 Mengisi form mandiri...`);
      }

      const mandiri = await pbdProcessMandiri(
        item,
        mode,
        shouldFillMandiri,
        i + 1,
      );

      if (mandiri.status === "OK") {
        appendPanelMessage(`   ✅ Form mandiri selesai.`);
        stats.successMandiri++;
      } else if (mandiri.status === "SKIP") {
        appendPanelMessage(`   ⏭️ Tidak ada form mandiri.`);
      } else {
        appendPanelMessage(`   ⚠️ ${mandiri.keterangan}`);
        if (mandiri.status === "GAGAL") {
          stats.errors.push(`${item.nama}: ${mandiri.keterangan}`);
        }
      }

      target.result = mandiri.status;
      target.done = true;

      if (item.noTiket) skipTickets.add(item.noTiket);

      pbdLog({
        nama: item.nama || "-",
        tglLahir: item.tglLahir || "-",
        tiket: item.noTiket || "-",
        status: mandiri.status,
        keterangan: mandiri.keterangan,
      });
    }

    appendPanelMessage(`   ⬅️ Balik ke list...`);
    await pbdGoBackToList(targetTabId);
    const backOk = await pbdWaitForListPage(targetTabId, 15000);
    if (!backOk) {
      appendPanelMessage(`   ⚠️ Tidak bisa balik ke list, stop mode Excel.`);
      break;
    }

    await pbdEnsureTabActive(targetTabId, sourceTab);
    await pbdClearSearch(targetTabId);
    await new Promise((r) => setTimeout(r, 1200));
  }

  const done = targetStatus.filter((t) => t.done).length;
  const notFound = targetStatus.filter((t) => t.result === "NOT_FOUND").length;
  const skipped = targetStatus.filter((t) => t.result === "SKIP").length;

  appendPanelMessage(
    `\n📊 Mode Excel selesai — Selesai: ${done}/${targetStatus.length}, NotFound: ${notFound}, Skip: ${skipped}`,
  );
}

// ============================================================
// MODE DATE RANGE
// ✅ Fix: handle alreadyStarted
// ============================================================
async function pbdRunDateRangeMode({
  mode,
  targetTabId,
  tglDari,
  tglSampai,
  sourceTab,
  optMulai,
  optMandiri,
  stats,
}) {
  const batches = pbdSplitDateBatches(tglDari, tglSampai, 7);
  if (batches.length === 0) {
    throw new Error("Rentang tanggal tidak valid.");
  }

  appendPanelMessage(
    `\n📅 ===== MODE DATE RANGE: ${batches.length} batch =====`,
  );

  const shouldFillMandiri =
    optMandiri && typeof runPemeriksaanMandiri === "function";

  const MAX_LOOP_PER_BATCH = 500;
  const MAX_EMPTY_STREAK = 3;

  const skipTickets = new Set();
  const requireIncomplete = sourceTab === "Sedang Pemeriksaan";

  if (requireIncomplete) {
    appendPanelMessage(
      `   ℹ️ Hanya proses badge "Belum lengkap" (tab Sedang Pemeriksaan)`,
    );
  }

  for (let b = 0; b < batches.length; b++) {
    if (pbdIsStopped()) {
      appendPanelMessage("\n⏹️ Stop diminta user.");
      break;
    }

    const batch = batches[b];
    const batchLabel = `${pbdFormatDisplay(batch.dari)} — ${pbdFormatDisplay(batch.sampai)}`;

    appendPanelMessage(
      `\n📦 ===== Batch ${b + 1}/${batches.length}: ${batchLabel} =====`,
    );

    await pbdEnsureTabActive(targetTabId, sourceTab);

    appendPanelMessage(`   🎯 Set filter batch...`);
    const filterRes = await pbdApplyDateFilter(
      targetTabId,
      batch.dari,
      batch.sampai,
    );

    if (!filterRes?.success) {
      appendPanelMessage(
        `   ❌ Gagal set filter: ${filterRes?.message || "unknown"}`,
      );
      stats.errors.push(`Batch ${b + 1}: gagal set filter`);
      continue;
    }
    appendPanelMessage(
      `   ✅ Filter aktif: ${filterRes.filterText}${filterRes.alreadySet ? " (sudah sesuai)" : ""}`,
    );
    await new Promise((r) => setTimeout(r, 1500));

    const readyRes = await pbdWaitForTableReady(targetTabId, 10000);
    if (readyRes?.ready) {
      appendPanelMessage(`   📊 Tabel siap (${readyRes.rows} baris)`);
    }

    let emptyStreak = 0;

    for (let i = 0; i < MAX_LOOP_PER_BATCH; i++) {
      if (pbdIsStopped()) break;

      const filterCheck = await pbdIsFilterMatch(
        targetTabId,
        batch.dari,
        batch.sampai,
      );

      if (!filterCheck.match) {
        appendPanelMessage(`   🔁 Filter ter-reset, re-apply...`);
        const reApply = await pbdApplyDateFilter(
          targetTabId,
          batch.dari,
          batch.sampai,
        );
        if (!reApply?.success) {
          appendPanelMessage(`   ⚠️ Re-apply gagal`);
          stats.errors.push(`Batch ${b + 1}: re-apply gagal`);
          break;
        }
        appendPanelMessage(`   ✅ Filter re-applied`);
        await new Promise((r) => setTimeout(r, 1200));
        await pbdWaitForTableReady(targetTabId, 8000);
      }

      if (!filterCheck.pageInfo?.isListPage) {
        appendPanelMessage(`   ⚠️ Bukan di list page, stop batch`);
        break;
      }

      appendPanelMessage(
        `   🔄 [B${b + 1}] Iterasi ${i + 1} — cek peserta...`,
      );

      const step1 = await pbdStartFirstRow(targetTabId, {
        sourceTab,
        mulai: optMulai,
        skipTickets: Array.from(skipTickets),
        requireIncomplete,
      });

      if (!step1 || !step1.success) {
        if (step1 && step1.noRows) {
          emptyStreak++;
          appendPanelMessage(
            `   ⏸️ Tidak ada peserta target (${emptyStreak}/${MAX_EMPTY_STREAK})${step1.skippedCount > 0 ? `, ${step1.skippedCount} baris di-skip` : ""}`,
          );

          if (emptyStreak >= MAX_EMPTY_STREAK) {
            appendPanelMessage(`   ✅ Batch ${b + 1} selesai!`);
            break;
          }

          await pbdApplyDateFilter(targetTabId, batch.dari, batch.sampai);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        stats.failed++;
        emptyStreak = 0;
        const errMsg = step1?.message || "Unknown error";
        stats.errors.push(`B${b + 1} it${i + 1}: ${errMsg}`);
        appendPanelMessage(`   ❌ Gagal: ${errMsg}`);

        if (step1?.item) {
          pbdLog({
            nama: step1.item.nama || "-",
            tglLahir: step1.item.tglLahir || "-",
            tiket: step1.item.noTiket || "-",
            status: "GAGAL",
            keterangan: errMsg,
          });
        }

        await pbdGoBackToList(targetTabId);
        await pbdWaitForListPage(targetTabId, 10000);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      emptyStreak = 0;
      const item = step1.item;

      appendPanelMessage(
        `   📋 [B${b + 1}] ${item.nama} (${item.tglLahir}) | Tiket: ${item.noTiket}`,
      );

      if (step1.skipped) {
        stats.skipped++;
        appendPanelMessage(`      ⏭️ Sudah diproses (skip)`);

        if (item.noTiket) skipTickets.add(item.noTiket);

        pbdLog({
          nama: item.nama,
          tglLahir: item.tglLahir,
          tiket: item.noTiket,
          status: "SKIP",
          keterangan: "Sudah diproses sebelumnya",
        });
      } else if (step1.onlyNavigated) {
        stats.processed++;
        appendPanelMessage(`      ✅ Dibuka tanpa mulai pemeriksaan`);

        if (item.noTiket) skipTickets.add(item.noTiket);

        pbdLog({
          nama: item.nama,
          tglLahir: item.tglLahir,
          tiket: item.noTiket,
          status: "WARN",
          keterangan: "Hanya navigasi (mulai nonaktif)",
        });
      } else {
        // ✅ FIX: handle alreadyStarted
        if (step1.alreadyStarted) {
          appendPanelMessage(
            `      🔄 Sudah dimulai, tetap isi form mandiri...`,
          );
        } else {
          appendPanelMessage(`      ✅ Pemeriksaan dimulai`);
        }

        stats.processed++;

        if (shouldFillMandiri) {
          appendPanelMessage(`      📝 Mengisi form mandiri...`);
        }

        const mandiri = await pbdProcessMandiri(
          item,
          mode,
          shouldFillMandiri,
          i + 1,
        );

        if (mandiri.status === "OK") {
          appendPanelMessage(`      ✅ Form mandiri selesai.`);
          stats.successMandiri++;
        } else if (mandiri.status === "SKIP") {
          appendPanelMessage(`      ⏭️ Tidak ada form mandiri.`);
        } else {
          appendPanelMessage(`      ⚠️ ${mandiri.keterangan}`);
          if (mandiri.status === "GAGAL") {
            stats.errors.push(`${item.nama}: ${mandiri.keterangan}`);
          }
        }

        if (item.noTiket) skipTickets.add(item.noTiket);

        pbdLog({
          nama: item.nama,
          tglLahir: item.tglLahir,
          tiket: item.noTiket,
          status: mandiri.status,
          keterangan: mandiri.keterangan,
        });
      }

      appendPanelMessage(`      ⬅️ Balik ke list...`);
      await pbdGoBackToList(targetTabId);
      const backOk = await pbdWaitForListPage(targetTabId, 15000);
      if (!backOk) {
        appendPanelMessage(`   ⚠️ Tidak bisa balik ke list, stop batch`);
        break;
      }

      await pbdEnsureTabActive(targetTabId, sourceTab);
      await new Promise((r) => setTimeout(r, 1200));
    }

    appendPanelMessage(`   📊 Batch ${b + 1} selesai.`);
  }
}

// ============================================================
// MAIN: runPemeriksaanByDate
// ============================================================
async function runPemeriksaanByDate(
  mode = REGISTRATION_MODES.INDIVIDUAL,
  filter = {},
) {
  const tglDari =
    filter.dari || localStorage.getItem(LOCAL_STORAGE.BY_DATE_DARI) || "";
  const tglSampai =
    filter.sampai || localStorage.getItem(LOCAL_STORAGE.BY_DATE_SAMPAI) || "";
  const sourceTab = filter.sourceTab || "Belum Pemeriksaan";
  const optMulai = filter.mulai !== undefined ? !!filter.mulai : true;
  const optMandiri = filter.mandiri !== undefined ? !!filter.mandiri : true;

  let excelTargets = Array.isArray(filter.excelTargets)
    ? filter.excelTargets
    : [];

  if (excelTargets.length === 0) {
    try {
      excelTargets = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE.BY_DATE_EXCEL_TARGETS) || "[]",
      );
    } catch (e) {
      excelTargets = [];
    }
  }

  const targetModeActive =
    localStorage.getItem("by-date-target-toggle") !== "false";
  const useExcelMode = targetModeActive && excelTargets.length > 0;

  if (typeof getDefaultPemeriksaanData !== "function") {
    throw new Error("getDefaultPemeriksaanData tidak tersedia.");
  }
  const defPemeriksaan = getDefaultPemeriksaanData();
  const jumlahField = Object.keys(defPemeriksaan).length;
  if (jumlahField === 0) {
    throw new Error(
      "Default pemeriksaan KOSONG. Buka Persiapan Data dulu, isi & simpan.",
    );
  }

  const url = getPelayananUrl(mode);
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const targetTabId = tab.id;
  const targetOrigin = new URL(url).origin;

  if (!tab.url || !tab.url.startsWith(targetOrigin)) {
    throw new Error(
      "Tab aktif bukan di halaman pelayanan. Buka ckg-pelayanan dulu.",
    );
  }

  const pageInfo = await pbdGetPageInfo(targetTabId);
  if (!pageInfo.isListPage) {
    throw new Error("Tidak di halaman list pelayanan.");
  }

  const tabEnsure = await pbdEnsureTabActive(targetTabId, sourceTab);
  if (!tabEnsure?.ok) {
    console.warn("[BY-DATE] Gagal ensure tab aktif:", tabEnsure?.message);
  } else {
    console.log(
      `[BY-DATE] Tab "${sourceTab}" ${tabEnsure.alreadyActive ? "sudah aktif" : "berhasil dipindah"}`,
    );
  }

  console.log(
    `%c[BY-DATE]%c Mode: ${mode} | ${useExcelMode ? `EXCEL (${excelTargets.length} target)` : `DATE RANGE ${tglDari} s/d ${tglSampai}`} | Tab: ${sourceTab} | Default: ${jumlahField}`,
    "background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:4px;font-weight:700",
    "color:#7c3aed;font-weight:600",
  );

  showPanelMessage("📅 Memulai Pemeriksaan by Date...");

  if (useExcelMode) {
    appendPanelMessage(
      `   📄 MODE: Excel (${excelTargets.length} target peserta)`,
    );
    appendPanelMessage(`   🔍 Flow: Nama dulu → fallback NIK`);
  } else {
    appendPanelMessage(
      `   📅 MODE: Date Range (${tglDari} s/d ${tglSampai})`,
    );
  }

  appendPanelMessage(`   📋 Sumber tab: ${sourceTab}`);

  if (sourceTab === "Sedang Pemeriksaan") {
    appendPanelMessage(
      `   ℹ️ Hanya proses peserta dengan badge "Belum lengkap"`,
    );
  }

  appendPanelMessage(`   🩺 Mulai Pemeriksaan: ${optMulai ? "AKTIF" : "nonaktif"}`);
  appendPanelMessage(`   📝 Isi Form Mandiri: ${optMandiri ? "AKTIF" : "nonaktif"}`);
  appendPanelMessage(`   📦 Default: ${jumlahField} field siap`);

  const stats = {
    processed: 0,
    skipped: 0,
    failed: 0,
    successMandiri: 0,
    errors: [],
    mode: useExcelMode ? "EXCEL" : "DATE_RANGE",
  };

  try {
    if (useExcelMode) {
      await pbdRunExcelMode({
        mode,
        targetTabId,
        excelTargets,
        sourceTab,
        optMulai,
        optMandiri,
        stats,
      });
    } else {
      await pbdRunDateRangeMode({
        mode,
        targetTabId,
        tglDari,
        tglSampai,
        sourceTab,
        optMulai,
        optMandiri,
        stats,
      });
    }

    const stopped = pbdIsStopped();
    let finalMsg = `${stopped ? "Dihentikan user. " : "Selesai. "}`;
    finalMsg += `Mode: ${stats.mode} | Diproses: ${stats.processed}, Skip: ${stats.skipped}, Gagal: ${stats.failed}`;
    if (stats.successMandiri > 0) {
      finalMsg += ` | Mandiri OK: ${stats.successMandiri}`;
    }

    return {
      success: true,
      status: stopped ? "STOPPED" : "DONE",
      message: finalMsg,
      stats,
    };
  } catch (err) {
    return {
      success: false,
      status: "ERROR",
      message: err.message || String(err),
      stats,
    };
  }
}