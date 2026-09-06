// ==================== ROBOT KEHADIRAN SEKOLAH ====================

async function runKehadiranSekolah(iData, defData) {
  showPanelMessage(
    `🏫 Konfirmasi Kehadiran Sekolah untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  const url = MAIN_URL.PELAYANAN.SCHOOL;

  let result;
  try {
    result = await runKehadiranAutofillSekolah({
      aktifData: iData,
      defData,
      url,
    });
  } catch (err) {
    console.error("Error di runKehadiranAutofillSekolah:", err);
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
      message: "Hasil tidak valid dari runKehadiranAutofillSekolah",
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

async function runKehadiranAutofillSekolah({ aktifData, defData, url }) {
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

                // Helper klik elemen dengan XPath
                async function klikByXPath(xpath, timeout = 5000) {
                  const el = await waitForElementAsync(xpath, null, timeout);
                  if (el) clickElement(el);
                  return el;
                }

                // Helper pilih opsi berdasarkan teks (fleksibel: cari child div atau span)
                async function pilihOpsiByTeks(teks) {
                  const patterns = [
                    `//div[contains(@class,'cursor-pointer')][.//div[normalize-space()='${teks}']]`,
                    `//div[contains(@class,'cursor-pointer')][.//span[normalize-space()='${teks}']]`,
                    `//*[contains(@class,'cursor-pointer')][.//*[normalize-space()='${teks}']]`,
                  ];
                  for (const xpath of patterns) {
                    try {
                      const option = await waitForElementAsync(
                        xpath,
                        null,
                        3000,
                      );
                      if (option) {
                        clickElement(option);
                        return option;
                      }
                    } catch (e) {
                      /* lanjut */
                    }
                  }
                  return null;
                }

                // Fungsi pilih sekolah dan kelas
                async function selectSekolahDanJenjang() {
                  const namaSekolah = (
                    inData.nama_sekolah ||
                    defData.nama_sekolah ||
                    ""
                  ).trim();
                  const jenjang = (
                    inData.jenjang_pendidikan ||
                    defData.jenjang_pendidikan ||
                    "Kelas 1"
                  ).trim();

                  // Pilih sekolah
                  if (namaSekolah) {
                    logStatus("Memilih sekolah...");
                    const pemicuXPath = `//div[contains(@class,'cursor-pointer')][.//span[normalize-space()='Pilih sekolah']]`;
                    await klikByXPath(pemicuXPath);
                    await sleep(1500);

                    const option = await pilihOpsiByTeks(namaSekolah);
                    if (!option)
                      throw new Error("Opsi sekolah tidak ditemukan");
                    logStatus(`✅ Sekolah "${namaSekolah}" dipilih.`);
                    await sleep(500);
                  }

                  // Pilih kelas
                  logStatus("Memilih kelas...");
                  const pemicuKelasXPath = `//div[contains(@class,'cursor-pointer')][.//span[normalize-space()='Pilih kelas']]`;
                  await klikByXPath(pemicuKelasXPath);
                  await sleep(1500);

                  const optionKelas = await pilihOpsiByTeks(jenjang);
                  if (!optionKelas)
                    throw new Error("Opsi kelas tidak ditemukan");
                  logStatus(`✅ Kelas "${jenjang}" dipilih.`);
                  await sleep(500);
                }

                logStatus(
                  "Data diterima, mulai proses konfirmasi kehadiran...",
                );
                const state = { earlyExit: null };

                const steps = [
                  {
                    name: "Pilih Sekolah dan Kelas",
                    action: async () => {
                      logStatus("1. Memilih sekolah dan kelas...");
                      await selectSekolahDanJenjang();
                    },
                  },
                  {
                    name: "Tampilkan Pencarian",
                    action: async () => {
                      logStatus("2. Klik tombol Tampilkan Pencarian...");
                      const btnTampilkan = await waitForElementAsync(
                        "//button[contains(., 'Tampilkan Pencarian')]",
                        null,
                        5000,
                      );
                      if (!btnTampilkan)
                        throw new Error(
                          "Tombol Tampilkan Pencarian tidak ditemukan",
                        );
                      clickElement(btnTampilkan);
                      await sleep(2000);
                    },
                  },
                  {
                    name: "Pilih Tipe Pencarian NIK",
                    action: async () => {
                      logStatus("3. Memilih tipe pencarian NIK...");

                      // Klik dropdown "Nomor Tiket"
                      const pemicuDropdown = await waitForElementAsync(
                        "//div[contains(@class,'cursor-pointer')][.//span[normalize-space()='Nomor Tiket']]",
                        null,
                        5000,
                      );
                      if (!pemicuDropdown)
                        throw new Error("Dropdown Nomor Tiket tidak ditemukan");
                      clickElement(pemicuDropdown);
                      await sleep(1000);

                      // Pilih opsi NIK
                      const optionNIK = await pilihOpsiByTeks("NIK");
                      if (!optionNIK)
                        throw new Error("Opsi NIK tidak ditemukan");
                      logStatus("✅ Tipe pencarian NIK dipilih.");
                      await sleep(500);
                    },
                  },
                  {
                    name: "Cari NIK",
                    action: async () => {
                      logStatus("4. Mencari berdasarkan NIK...");
                      const inputPatterns = [
                        "//input[@id='nik' and @placeholder='Masukkan NIK']",
                        "//input[@id='nik']",
                        "//input[@placeholder='Masukkan NIK']",
                        "//input[contains(@placeholder, 'NIK')]",
                        "//input[@type='text']",
                      ];

                      let inputNIK = null;
                      for (let attempt = 0; attempt < 5; attempt++) {
                        for (const xpath of inputPatterns) {
                          try {
                            inputNIK = await waitForElementAsync(
                              xpath,
                              null,
                              4000,
                            );
                            if (inputNIK) break;
                          } catch (e) {
                            /* lanjut */
                          }
                        }
                        if (inputNIK) break;
                        logStatus(
                          `Percobaan ${attempt + 1}: input NIK belum muncul, menunggu...`,
                        );
                        await sleep(3000);
                      }

                      if (!inputNIK)
                        throw new Error(
                          "Input NIK tidak ditemukan setelah beberapa percobaan",
                        );

                      inputNIK.focus();
                      await sleep(100);
                      inputElementValue(inputNIK, inData.nik);
                      clickElement(inputNIK);
                      inputNIK.focus();
                      await sleep(100);
                      enterKeyElement(inputNIK);
                      await sleep(1000);
                    },
                  },
                  {
                    name: "Konfirmasi Hadir",
                    action: async () => {
                      logStatus("5. Klik konfirmasi hadir...");
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
                      logStatus("6. Bersedia di CKG...");
                      const checkboxBersediaCKG = await waitForElementAsync(
                        X_PATH.CHECKBOX_BERSEDIA_CKG,
                        null,
                        5000,
                      );
                      clickElement(checkboxBersediaCKG);
                      await sleep(500);
                      const btnHadirOK = await waitForElementAsync(
                        X_PATH.BTN_HADIR_CKG,
                        null,
                        5000,
                      );
                      clickElement(btnHadirOK);
                      await sleepUntilLoaded(750, "Memproses data", 20);
                    },
                  },
                  {
                    name: "Popup Success",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("7. Menunggu popup berhasil...");
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
