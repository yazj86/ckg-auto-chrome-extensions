// ==================== ROBOT PEMERIKSAAN ====================

async function runPemeriksaan(iData, mode = REGISTRATION_MODES.INDIVIDUAL) {
  showPanelMessage(
    `🩺 Mulai Pemeriksaan untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  const defData = getDefaultData(mode);
  const url = getPelayananUrl(mode);

  let result;
  try {
    result = await runPemeriksaanAutofill({
      aktifData: iData,
      defData,
      url,
    });
  } catch (err) {
    console.error("Error di runPemeriksaanAutofill:", err);
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
      message: "Hasil tidak valid dari runPemeriksaanAutofill",
    };
  }

  appendPanelMessage(
    `Konfirmasi Mulai Pemeriksaan. Status: ${result.status} - ${result.message}`,
  );

  if (result.success) {
    iData.pemeriksaan = "OK";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  } else {
    if (result.status === "ERROR" || result.status === "TIMEOUT") {
      iData.keterangan = result.message;
    } else {
      iData.pemeriksaan = "GAGAL";
      iData.status_input = result.status;
      iData.keterangan = result.message;
    }
  }

  await new Promise((r) => setTimeout(r, 1500));
  return iData;
}

async function runPemeriksaanAutofill({ aktifData, defData, url }) {
  // 1. Cari atau buat tab target
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

                logStatus("Data diterima, mulai pemeriksaan...");

                const state = { earlyExit: null };

                const steps = [
                  {
                    name: "Select Search by NIK",
                    action: async () => {
                      logStatus("1. Pencarian by NIK...");

                      // Buka dropdown pencarian
                      const selectSearch = await waitForElementAsync(
                        X_PATH.SELECT_SEARCH_PELAYANAN,
                        null,
                        5000,
                      );
                      clickElement(selectSearch);
                      await sleep(500);

                      // Pilih opsi NIK
                      const selectSearchNik = await waitForElementAsync(
                        X_PATH.SELECT_SEARCH_NIK_PELAYANAN,
                        null,
                        5000,
                      );
                      clickElement(selectSearchNik);
                      await sleep(750);

                      // Isi input NIK
                      const inputSearchNik = await waitForElementAsync(
                        X_PATH.INPUT_SEARCH_NIK_PELAYANAN,
                        null,
                        5000,
                      );
                      inputElementValue(inputSearchNik, String(inData.nik));
                      await sleep(500);
                      enterKeyElement(inputSearchNik);
                      await sleepUntilLoaded(750, "Proses pencarian data", 20);
                    },
                  },
                  {
                    name: "Check which tab table",
                    action: async () => {
                      logStatus("2. Mencari berdasarkan tab table...");

                      const belumEl = document.evaluate(
                        "//div[contains(text(),'Belum Pemeriksaan')]//span",
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                      ).singleNodeValue;

                      if (belumEl) {
                        const count = parseInt(belumEl.textContent.trim());
                        if (count === 0) {
                          const belumTab =
                            belumEl.closest("div.cursor-pointer");
                          const sedangTab = belumTab?.nextElementSibling;
                          if (sedangTab) {
                            clickElement(sedangTab);
                            await sleep(500);
                          }
                        }
                      }
                    },
                  },
                  {
                    name: "Start Pemeriksaan",
                    action: async () => {
                      logStatus("3. Memulai pemeriksaan...");
                      const btnMulai = await waitForElementAsync(
                        X_PATH.BTN_MULAI_PEMERIKSAAN_TABLE,
                        null,
                        5000,
                      );
                      clickElement(btnMulai);
                      await sleep(1000);

                      try {
                        const btnSelesaikanExist = await waitForElementAsync(
                          X_PATH.BTN_SELESAIKAN_LAYANAN,
                          null,
                          3000,
                        );
                        if (btnSelesaikanExist) {
                          logStatus("4. Pemeriksaan telah dimulai...");
                        } else {
                          logStatus("4. Memulai pemeriksaan CKG...");
                          const btnMulaiPemeriksaan = await waitForElementAsync(
                            X_PATH.BTN_MULAI_PEMERIKSAAN,
                            null,
                            5000,
                          );
                          clickElement(btnMulaiPemeriksaan);
                          await sleep(500);

                          const btnMulaiPemeriksaanSimpan =
                            await waitForElementAsync(
                              X_PATH.BTN_MULAI_PEMERIKSAAN_SIMPAN,
                              null,
                              5000,
                            );
                          clickElement(btnMulaiPemeriksaanSimpan);
                          await sleep(1000);

                          await waitForElementAsync(
                            X_PATH.BTN_SELESAIKAN_LAYANAN,
                            null,
                            10000,
                          );
                          logStatus("✅ Pemeriksaan berhasil dimulai.");
                        }
                      } catch (err) {
                        logStatus(
                          "4. Timeout: Button Selesaikan Layanan tidak ditemukan!",
                        );
                        state.earlyExit = {
                          success: false,
                          status: "TIMEOUT",
                          message:
                            "System timeout waiting for Button Selesaikan Layanan response",
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
                  message: "Berhasil Memulai Pemeriksaan",
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
