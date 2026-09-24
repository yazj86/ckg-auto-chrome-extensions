// ==================== ROBOT KEHADIRAN INDIVIDU ====================

async function runKehadiranIndividu(iData, defData) {
  showPanelMessage(
    `Konfirmasi Kehadiran untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  // ✅ TAMBAHKAN: fallback tgl_pemeriksaan
  let tgl_pemeriksaan = localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN);
  if (!tgl_pemeriksaan) {
    tgl_pemeriksaan = String(new Date().getDate());
    localStorage.setItem(LOCAL_STORAGE.TGL_PEMERIKSAAN, tgl_pemeriksaan);
  }

  const result = await runKehadiranAutofill({
    aktifData: iData,
    defData,
    url: MAIN_URL.PENDAFTARAN.INDIVIDUAL, // ✅ FIXED
    tgl_pemeriksaan,
  });

  appendPanelMessage(
    `Konfirmasi Kehadiran selesai. Status: ${result.status} - ${result.message}`,
  );

  if (result.success) {
    iData.kehadiran = "OK";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  } else {
    if (result.status == "ERROR") {
      iData.keterangan = result.message;
    } else if (result.status == "TIMEOUT") {
      iData.keterangan = result.message;
    } else {
      iData.kehadiran = "GAGAL";
      iData.status_input = result.status;
      iData.keterangan = result.message;
    }
  }

  await new Promise((r) => setTimeout(r, 1500));
  return iData;
}

async function runKehadiranAutofill({
  aktifData,
  defData,
  url,
  tgl_pemeriksaan,
}) {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tab.id;

  // 1. Initial redirect
  await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    args: [url],
    func: (targetUrl) => {
      window.location.href = targetUrl;
    },
  });

  // 2. Wait for page load and execute steps pipeline
  return new Promise((resolve, reject) => {
    function panelMessageListener(request, sender, sendResponse) {
      if (request.type === "ROBOT_STATUS") {
        appendPanelMessage(request.message);
      }
    }

    function listener(tabId, changeInfo, updatedTab) {
      if (tabId === targetTabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.scripting.executeScript(
          {
            target: { tabId: targetTabId },
            args: [aktifData, defData, tgl_pemeriksaan],
            func: async (inData, defData, tgl_pemeriksaan) => {
              const logStatus = (msg) => {
                try {
                  chrome.runtime.sendMessage({
                    type: "ROBOT_STATUS",
                    message: msg,
                  });
                } catch (err) {
                  console.error("Failed to send status message:", err);
                }
              };

              logStatus("Data diterima, mulai proses konfirmasi kehadiran...");
              logStatus(`   → Tgl pemeriksaan: ${tgl_pemeriksaan}`);

              const state = { earlyExit: null };

              const steps = [
                // ============================================================
                // STEP 1 — Pilih pencarian by NIK
                // ============================================================
                {
                  name: "Select Search by NIK",
                  action: async () => {
                    logStatus("1. Memilih seleksi pencarian...");
                    const selectSearch = await waitForElementAsync(
                      X_PATH.SELECT_SEARCH,
                    );
                    clickElement(selectSearch);
                    const selectSearchNIK = await waitForElementAsync(
                      X_PATH.SELECT_SEARCH_NIK,
                    );
                    clickElement(selectSearchNIK);
                    await sleep(750);
                  },
                },

                // ============================================================
                // STEP 2 — Isi NIK dan cari
                // ============================================================
                {
                  name: "Search by NIK",
                  action: async () => {
                    logStatus("2. Mencari berdasarkan NIK...");
                    const inputSearchNIK = await waitForElementAsync(
                      X_PATH.INPUT_SEARCH,
                    );
                    inputSearchNIK.focus();
                    await sleep(100);
                    inputElementValue(inputSearchNIK, inData.nik);
                    clickElement(inputSearchNIK);
                    inputSearchNIK.focus();
                    await sleep(100);
                    enterKeyElement(inputSearchNIK);
                    await sleep(750);
                  },
                },

                // ============================================================
                // STEP 3 — Konfirmasi hadir
                // ============================================================
                {
                  name: "Konfirmasi hadir",
                  action: async () => {
                    logStatus("3. Klik konfirmasi hadir...");
                    const namaTarget = inData.nama.toLowerCase();
                    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                    const lowercase = "abcdefghijklmnopqrstuvwxyz";
                    const xpathKonfirm = `//tr[contains(translate(., '${uppercase}', '${lowercase}'), '${namaTarget}')]//button[contains(., 'Konfirmasi Hadir')]`;
                    const xpathSudahHadir = `//tr[contains(translate(., '${uppercase}', '${lowercase}'), '${namaTarget}')]//div[contains(., 'Sudah Hadir')]`;

                    const checkBtnKonfirmHadir = waitForElementAsync(
                      xpathKonfirm,
                    ).then(() => "CONFIRM_HADIR");
                    const checkSudahHadir = waitForElementAsync(
                      xpathSudahHadir,
                    ).then(() => "SUDAH_HADIR");

                    try {
                      const status = await Promise.race([
                        checkBtnKonfirmHadir,
                        checkSudahHadir,
                      ]);

                      if (status === "CONFIRM_HADIR") {
                        // ✅ FIXED: log yang benar
                        logStatus("3. Tombol Konfirmasi Hadir ditemukan");
                        const btnKonfirmHadir =
                          await waitForElementAsync(xpathKonfirm);
                        clickElement(btnKonfirmHadir);
                        // ✅ FIXED: tambahkan await
                        await sleepUntilLoaded(
                          750,
                          "Proses pencarian data",
                          20,
                        );
                      } else if (status === "SUDAH_HADIR") {
                        logStatus("4. Sudah terkonfirmasi hadir!");
                        state.earlyExit = {
                          success: true,
                          status: "-- ON PROGRESS --",
                          message: "Berhasil Konfirmasi Kehadiran",
                        };
                      }
                    } catch (err) {
                      logStatus(
                        "4. Timeout: Konfirmasi kehadiran tidak ditemukan!",
                      );
                      console.log(err);
                      state.earlyExit = {
                        success: false,
                        status: "TIMEOUT",
                        message:
                          "System timeout waiting for Konfirmasi kehadiran response",
                      };
                    }
                  },
                },

                // ============================================================
                // STEP 4 — Bersedia CKG
                // ============================================================
                {
                  name: "Bersedia CKG",
                  action: async () => {
                    logStatus("4. Bersedia di CKG...");
                    const checkboxBersediaCKG = await waitForElementAsync(
                      X_PATH.CHECKBOX_BERSEDIA_CKG,
                    );
                    clickElement(checkboxBersediaCKG);
                    await sleep(500);
                    const btnHadirOK = await waitForElementAsync(
                      X_PATH.BTN_HADIR_CKG,
                    );
                    clickElement(btnHadirOK);
                    // ✅ FIXED: tambahkan await
                    await sleepUntilLoaded(750, "Memproses data", 20);
                  },
                },

                // ============================================================
                // STEP 5 — Popup Success
                // ============================================================
                {
                  name: "Popup Success",
                  action: async () => {
                    logStatus("5. Berhasil Hadir...");
                    try {
                      await waitForElementAsync(
                        X_PATH.MSG_POPUP_BERHASIL_HADIR,
                        null,
                        15000,
                      );
                    } catch (err) {
                      logStatus("5. Timeout: Popup berhasil tidak muncul!");
                      state.earlyExit = {
                        success: false,
                        status: "TIMEOUT",
                        message:
                          "System timeout waiting for Popup Berhasil Hadir",
                      };
                    }
                  },
                },
              ];

              try {
                for (const step of steps) {
                  if (state.earlyExit) break;
                  if (step.shouldRun && !step.shouldRun()) {
                    console.log(`Skipping step: ${step.name}`);
                    continue;
                  }
                  console.log(`Executing step: ${step.name}`);
                  await step.action();
                }
              } catch (err) {
                return {
                  success: false,
                  status: "ERROR",
                  message: JSON.stringify(err),
                };
              }

              if (state.earlyExit) {
                return state.earlyExit;
              }
              return {
                success: true,
                status: "-- ON PROGRESS --",
                message: "Berhasil Konfirmasi Kehadiran",
              };
            },
          },
          (results) => {
            chrome.runtime.onMessage.removeListener(panelMessageListener);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!results || !results[0] || results[0].result === undefined) {
              reject(new Error("Hasil eksekusi skrip tidak valid"));
              return;
            }
            resolve(results[0].result);
          },
        );
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.runtime.onMessage.addListener(panelMessageListener);
  });
}
