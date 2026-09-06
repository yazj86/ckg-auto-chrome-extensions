// ==================== ROBOT KEHADIRAN INDIVIDU ====================

async function runKehadiranIndividu(iData, defData) {
  showPanelMessage(
    `✅ Konfirmasi Kehadiran Individu untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  const url = MAIN_URL.PELAYANAN.INDIVIDUAL; // pastikan constant.js punya ini

  let result;
  try {
    result = await runKehadiranAutofillIndividu({
      aktifData: iData,
      defData,
      url,
    });
  } catch (err) {
    console.error("Error di runKehadiranAutofillIndividu:", err);
    result = {
      success: false,
      status: "ERROR",
      message: err.message || String(err),
    };
  }

  if (!result || typeof result !== "object") {
    result = {
      success: false,
      status: "ERROR",
      message: "Hasil tidak valid dari runKehadiranAutofillIndividu",
    };
  }

  appendPanelMessage(
    `Konfirmasi Kehadiran selesai. Status: ${result.status} - ${result.message}`,
  );

  if (result.success) {
    iData.kehadiran = "OK";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  } else {
    if (result.status === "ERROR" || result.status === "TIMEOUT") {
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

async function runKehadiranAutofillIndividu({ aktifData, defData, url }) {
  let targetTabId = null;
  try {
    const targetOrigin = new URL(url).origin;
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find(
      (t) => t.url && t.url.startsWith(targetOrigin),
    );

    if (existingTab) {
      targetTabId = existingTab.id;
      if (!existingTab.url.includes(url)) {
        await chrome.tabs.update(targetTabId, { url, active: true });
      } else {
        await chrome.tabs.reload(targetTabId);
      }
    } else {
      const newTab = await chrome.tabs.create({ url, active: true });
      targetTabId = newTab.id;
    }
  } catch (err) {
    console.error("Gagal membuat/menemukan tab target:", err);
    throw err;
  }

  return new Promise((resolve, reject) => {
    function panelMessageListener(request) {
      if (request.type === "ROBOT_STATUS") {
        appendPanelMessage(request.message);
      }
    }
    chrome.runtime.onMessage.addListener(panelMessageListener);

    function listener(tabId, changeInfo) {
      if (tabId === targetTabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);

        chrome.scripting.executeScript(
          {
            target: { tabId: targetTabId },
            args: [aktifData, defData],
            func: async (inData, defData) => {
              try {
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

                logStatus(
                  "Data diterima, mulai proses konfirmasi kehadiran...",
                );

                const state = { earlyExit: null };

                const steps = [
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
                          logStatus("Tombol Konfirmasi Hadir ditemukan.");
                          const btnKonfirmHadir =
                            await waitForElementAsync(xpathKonfirm);
                          clickElement(btnKonfirmHadir);
                          await sleepUntilLoaded(
                            750,
                            "Proses pencarian data",
                            20,
                          );
                        } else if (status === "SUDAH_HADIR") {
                          logStatus("Sudah terkonfirmasi hadir!");
                          state.earlyExit = {
                            success: true,
                            status: "-- ON PROGRESS --",
                            message: "Berhasil Konfirmasi Kehadiran",
                          };
                        }
                      } catch (err) {
                        logStatus(
                          "Timeout: Konfirmasi kehadiran tidak ditemukan!",
                        );
                        state.earlyExit = {
                          success: false,
                          status: "TIMEOUT",
                          message:
                            "System timeout waiting for Konfirmasi kehadiran response",
                        };
                      }
                    },
                  },
                  {
                    name: "Bersedia CKG",
                    shouldRun: () => !state.earlyExit,
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
                      await sleepUntilLoaded(750, "Memproses data", 20);
                    },
                  },
                  {
                    name: "Popup Success",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("5. Menunggu popup berhasil...");
                      try {
                        await waitForElementAsync(
                          X_PATH.MSG_POPUP_BERHASIL_HADIR,
                          null,
                          15000,
                        );
                        logStatus("✅ Popup berhasil muncul.");
                      } catch (err) {
                        logStatus("Timeout: Popup berhasil tidak muncul!");
                        state.earlyExit = {
                          success: false,
                          status: "TIMEOUT",
                          message:
                            "System timeout waiting for Konfirmasi hadir response",
                        };
                      }
                    },
                  },
                ];

                for (const step of steps) {
                  if (state.earlyExit) break;
                  if (step.shouldRun && !step.shouldRun()) continue;
                  console.log(`Executing step: ${step.name}`);
                  await step.action();
                }

                if (state.earlyExit) return state.earlyExit;
                return {
                  success: true,
                  status: "-- ON PROGRESS --",
                  message: "Berhasil Konfirmasi Kehadiran",
                };
              } catch (err) {
                return {
                  success: false,
                  status: "ERROR",
                  message: err.message || String(err),
                };
              }
            },
          },
          (results) => {
            chrome.runtime.onMessage.removeListener(panelMessageListener);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (results && results[0] && results[0].error) {
              reject(
                new Error(results[0].error.message || String(results[0].error)),
              );
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
  });
}
