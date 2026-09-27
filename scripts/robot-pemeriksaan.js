// ==================== ROBOT PEMERIKSAAN ====================

async function runPemeriksaan(iData, mode = REGISTRATION_MODES.INDIVIDUAL) {
  showPanelMessage(
    `🩺 Mulai Pemeriksaan untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  // ✅ Ambil default peserta (bukan default pemeriksaan)
  const defData = getDefaultData(mode);

  // ✅ URL sebagai STRING (helper sudah handle mode)
  const url = getPelayananUrl(mode);

  // ✅ Tanggal pemeriksaan dari localStorage panel
  const tgl_pemeriksaan = localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN);

  let result;
  try {
    result = await runPemeriksaanAutofill({
      aktifData: iData,
      defData,
      url,
      tgl_pemeriksaan,
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

async function runPemeriksaanAutofill({
  aktifData,
  defData,
  url,
  tgl_pemeriksaan,
}) {
  // ✅ Pakai TAB AKTIF (bukan query by origin)
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tab.id;

  // ✅ Redirect ke URL target (url sudah string)
  await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    args: [url],
    func: (targetUrl) => {
      window.location.href = targetUrl;
    },
  });

  // Tunggu page load & jalankan steps
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

              logStatus("Data diterima, mulai pemeriksaan...");

              const state = { earlyExit: null };

              const steps = [
                {
                  name: "Select Search by NIK",
                  action: async () => {
                    logStatus("1. Pencarian by NIK...");
                    const selectSearch = await waitForElementAsync(
                      X_PATH.SELECT_SEARCH_PELAYANAN,
                    );
                    clickElement(selectSearch);
                    await sleep(500);

                    const selectSearchNik = await waitForElementAsync(
                      X_PATH.SELECT_SEARCH_NIK_PELAYANAN,
                    );
                    clickElement(selectSearchNik);
                    await sleep(750);

                    const inputSearchNik = await waitForElementAsync(
                      X_PATH.INPUT_SEARCH_NIK_PELAYANAN,
                    );
                    forceInput(inputSearchNik, String(inData.nik));
                    await sleep(500);
                    enterKeyElement(inputSearchNik);
                    await sleepUntilLoaded();
                  },
                },
                {
                  name: "Check which tab table",
                  action: async () => {
                    logStatus("2. Mencari berdasarkan tab table...");

                    const belum = document.evaluate(
                      "//div[contains(text(),'Belum Pemeriksaan')]//span",
                      document,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null,
                    ).singleNodeValue;

                    const count = belum
                      ? parseInt(belum.textContent.trim())
                      : null;
                    if (count === 0) {
                      const belumTab = belum.closest("div.cursor-pointer");
                      const sedang = belumTab?.nextElementSibling;
                      if (sedang) {
                        clickElement(sedang);
                        await sleep(500);
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
                    );
                    clickElement(btnMulai);

                    await sleepUntilLoaded();
                    try {
                      const btnSelesaikanExist = document.evaluate(
                        X_PATH.BTN_SELESAIKAN_LAYANAN,
                        document,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                      ).singleNodeValue;

                      if (btnSelesaikanExist) {
                        logStatus("4. Pemeriksaan telah dimulai...");
                      } else {
                        logStatus("4. Memulai pemeriksaan CKG...");
                        const btnMulaiPemeriksaan = await waitForElementAsync(
                          X_PATH.BTN_MULAI_PEMERIKSAAN,
                        );
                        clickElement(btnMulaiPemeriksaan);

                        const btnMulaiPemeriksaanSimpan =
                          await waitForElementAsync(
                            X_PATH.BTN_MULAI_PEMERIKSAAN_SIMPAN,
                          );
                        clickElement(btnMulaiPemeriksaanSimpan);

                        await waitForElementAsync(
                          X_PATH.BTN_SELESAIKAN_LAYANAN,
                          null,
                          30000,
                        );
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

              if (state.earlyExit) return state.earlyExit;
              return {
                success: true,
                status: "-- ON PROGRESS --",
                message: "Berhasil Memulai Pemeriksaan",
              };
            },
          },
          (results) => {
            console.log("results");
            console.log(results);
            chrome.runtime.onMessage.removeListener(panelMessageListener);
            if (chrome.runtime.lastError) {
              console.log("[ERROR]");
              console.log(chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve(results[0].result);
            }
          },
        );
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}