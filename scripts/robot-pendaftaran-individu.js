// ==================== ROBOT PENDAFTARAN INDIVIDU ====================
async function runPendaftaranIndividu(iData, defData) {
  showPanelMessage(
    `👤 Pengisian Data untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );
  let tgl_pemeriksaan = localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN);
  if (!tgl_pemeriksaan) {
    tgl_pemeriksaan = String(new Date().getDate());
    localStorage.setItem(LOCAL_STORAGE.TGL_PEMERIKSAAN, tgl_pemeriksaan);
  }

  const result = await runPendaftaranAutofillIndividu({
    aktifData: iData,
    defData,
    url: MAIN_URL.PENDAFTARAN.INDIVIDUAL,
    tgl_pemeriksaan,
  });

  appendPanelMessage(
    `Pendaftaran selesai. Status: ${result.status} - ${result.message}`,
  );
  if (result.success) {
    iData.pendaftaran = "OK";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  } else {
    if (result.status === "ERROR" || result.status === "TIMEOUT") {
      iData.pendaftaran = "GAGAL";
      iData.status_input = result.status;
      iData.keterangan = result.message;
    } else {
      iData.pendaftaran = "GAGAL";
      iData.status_input = result.status;
      iData.keterangan = result.message;
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
  return iData;
}

async function runPendaftaranAutofillIndividu({
  aktifData,
  defData,
  url,
  tgl_pemeriksaan,
}) {
  let targetTabId = null;
  const targetUrl = url;
  const targetOrigin = new URL(targetUrl).origin;

  // Cari tab yang sudah terbuka dengan domain target
  const tabs = await chrome.tabs.query({});
  const existingTab = tabs.find((t) => t.url && t.url.startsWith(targetOrigin));

  if (existingTab) {
    targetTabId = existingTab.id;
    if (!existingTab.url.includes(targetUrl)) {
      await chrome.tabs.update(targetTabId, { url: targetUrl, active: true });
    } else {
      await chrome.tabs.reload(targetTabId);
    }
  } else {
    const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
    targetTabId = newTab.id;
  }

  // 2. Wait for page load and execute steps pipeline
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

                async function selectBirthYear(dateStr, xPathInput) {
                  const tglLahir = parseDateString(dateStr);
                  if (!tglLahir) return;
                  const tglInput = await waitForElementAsync(xPathInput);
                  clickElement(tglInput);
                  const yearBtn = await waitForElementAsync(
                    X_PATH.INPUT_TGL_LAHIR_YEAR,
                  );
                  clickElement(yearBtn);

                  async function findDay() {
                    const dayTable = await waitForElementAsync(
                      X_PATH.INPUT_TGL_LAHIR_DAY_TABLE,
                    );
                    const xpath = `.//td[@title="${tglLahir.date}"]`;
                    const dayEl = document.evaluate(
                      xpath,
                      dayTable,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null,
                    ).singleNodeValue;
                    if (dayEl) clickElement(dayEl);
                  }
                  async function findMonth() {
                    const monthTable = await waitForElementAsync(
                      X_PATH.INPUT_TGL_LAHIR_MONTH_TABLE,
                    );
                    const xpath = `.//td[@data-month="${tglLahir.month - 1}"]`;
                    const monthEl = document.evaluate(
                      xpath,
                      monthTable,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null,
                    ).singleNodeValue;
                    if (monthEl) {
                      clickElement(monthEl);
                      await sleep(350);
                      await findDay();
                    }
                  }
                  async function findYear() {
                    const yearTable = await waitForElementAsync(
                      X_PATH.INPUT_TGL_LAHIR_YEAR_TABLE,
                    );
                    const xpath = `.//td[@data-year="${tglLahir.year}"]`;
                    const yearEl = document.evaluate(
                      xpath,
                      yearTable,
                      null,
                      XPathResult.FIRST_ORDERED_NODE_TYPE,
                      null,
                    ).singleNodeValue;
                    if (yearEl) {
                      clickElement(yearEl);
                      await sleep(350);
                      await findMonth();
                    } else {
                      const prevBtn = await waitForElementAsync(
                        X_PATH.INPUT_TGL_LAHIR_YEAR_BEFORE,
                      );
                      clickElement(prevBtn);
                      await sleep(350);
                      await findYear();
                    }
                  }
                  await sleep(350);
                  await findYear();
                }

                logStatus("Data diterima, mulai proses pendaftaran...");
                const state = { earlyExit: null };

                const steps = [
                  {
                    name: "Click Daftar Baru",
                    action: async () => {
                      logStatus("1. Membuka form pendaftaran...");
                      const btnXPath =
                        X_PATH.BTN_DAFTAR_BARU_INDIVIDU ||
                        X_PATH.BTN_DAFTAR_BARU;
                      const btn = await waitForElementAsync(btnXPath);
                      await sleep(1000);
                      clickElement(btn);
                    },
                  },
                  {
                    name: "Validate NIK Presence",
                    action: async () => {
                      if (!inData.nik) {
                        state.earlyExit = {
                          success: false,
                          status: "NO_NIK",
                          message: "Tidak Ada NIK",
                        };
                      }
                    },
                  },
                  {
                    name: "Input & Check NIK",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("2. Pengecekan NIK...");
                      const input = await waitForElementAsync(
                        X_PATH.INPUT_NIK_PENDAFTARAN,
                      );
                      inputElementValue(input, inData.nik);
                    },
                  },
                  {
                    name: "Handle Missing NIK (Manual Form Fill)",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("3.1. Mengisi data manual...");
                      const nameInput = await waitForElementAsync(
                        X_PATH.INPUT_NAMA_LENGKAP,
                      );
                      inputElementValue(nameInput, inData.nama);
                      await selectBirthYear(
                        inData.tgl_lahir,
                        X_PATH.INPUT_TGL_LAHIR,
                      );
                      const jkInput = await waitForElementAsync(
                        X_PATH.INPUT_JENIS_KELAMIN,
                      );
                      clickElement(jkInput);
                      const isPerempuan =
                        String(inData.jenis_kelamin).toLowerCase() === "p";
                      const genderEl = await waitForElementAsync(
                        isPerempuan ? X_PATH.SELECT_JK_PR : X_PATH.SELECT_JK_LK,
                      );
                      clickElement(genderEl);
                      const waInput = await waitForElementAsync(
                        X_PATH.INPUT_WA,
                      );
                      inputElementValue(waInput, inData.no_hp || defData.no_hp);
                    },
                  },
                  {
                    name: "Handle Guardian (Wali) Rules based on Age",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      if (isOver60Years(inData.tgl_lahir)) {
                        logStatus("3.2. Checkbox tanpa wali...");
                        const cb = await waitForElementAsync(
                          X_PATH.CHECKBOX_TANPA_WALI,
                        );
                        clickElement(cb);
                      } else if (isUnder6Years(inData.tgl_lahir)) {
                        logStatus("3.2. Mengisi data wali...");
                        const inputNIKWali = await waitForElementAsync(
                          X_PATH.INPUT_NIK_WALI,
                        );
                        inputElementValue(
                          inputNIKWali,
                          inData.nik_wali || defData.nik_wali,
                        );
                        const inputNamaWali = await waitForElementAsync(
                          X_PATH.INPUT_NAMA_LENGKAP_WALI,
                        );
                        inputElementValue(
                          inputNamaWali,
                          inData.nama_wali || defData.nama_wali,
                        );
                        await selectBirthYear(
                          inData.tgl_lahir_wali || defData.tgl_lahir_wali,
                          X_PATH.INPUT_TGL_LAHIR_WALI,
                        );
                        const jkWali = await waitForElementAsync(
                          X_PATH.INPUT_JENIS_KELAMIN_WALI,
                        );
                        clickElement(jkWali);
                        const isPerempuan =
                          String(
                            inData.jenis_kelamin_wali ||
                              defData.jenis_kelamin_wali,
                          ).toLowerCase() === "p";
                        const genderEl = await waitForElementAsync(
                          isPerempuan
                            ? X_PATH.SELECT_JK_PR
                            : X_PATH.SELECT_JK_LK,
                        );
                        clickElement(genderEl);
                        const waWali = await waitForElementAsync(
                          X_PATH.INPUT_WA_WALI,
                        );
                        inputElementValue(
                          waWali,
                          cleanPhoneNumber(
                            inData.no_hp_wali,
                            defData.no_hp_wali,
                          ),
                        );
                      }
                    },
                  },
                  {
                    name: "Select Examination Date",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("4. Memilih tanggal pemeriksaan...");
                      if (!tgl_pemeriksaan) {
                        state.earlyExit = {
                          success: false,
                          status: "NO_DATE",
                          message: "Tanggal pemeriksaan kosong",
                        };
                        return;
                      }
                      const tglParent = await waitForElementAsync(
                        X_PATH.INPUT_TGL_PEMERIKSAAN_PARENT,
                      );
                      const xpath = `.//button[.//span[text()='${tgl_pemeriksaan}'] and not(contains(@class,'cursor-not-allowed'))]`;
                      const tglEl = document.evaluate(
                        xpath,
                        tglParent,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                      ).singleNodeValue;
                      if (tglEl) clickElement(tglEl);
                    },
                  },

                  // ============================================================
                  // ✅ FIXED: Timeout bertingkat (adaptif server cepat/lemot)
                  // Percobaan 1: 5s → server normal langsung sukses
                  // Percobaan 2: 15s → server agak lambat
                  // Percobaan 3: 30s → server lemot
                  // ============================================================
                  {
                    name: "Click Next & Handle Multi-Stage Validation",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("5. Menekan tombol selanjutnya...");
                      const btnSelanjutnya = await waitForElementAsync(
                        X_PATH.BTN_SELANJUTNYA ||
                          "//button[contains(., 'Selanjutnya')]",
                        null,
                        1000,
                      );
                      clickElement(btnSelanjutnya);

                      // ✅ Tunggu shimmer hilang
                      logStatus("   Menunggu server selesai memproses...");
                      await waitUntilLoadingDone(1000);
                      await sleep(500);

                      logStatus("Menunggu respons validasi sistem...");

                      // ✅ TIMEOUT BERTINGKAT
                      const RETRY_TIMEOUTS = [1000, 5000, 10000];
                      const MAX_RETRY = RETRY_TIMEOUTS.length;

                      for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                        if (state.earlyExit) return;

                        const timeout = RETRY_TIMEOUTS[attempt - 1];
                        logStatus(
                          `   Percobaan ${attempt}/${MAX_RETRY} (timeout ${
                            timeout / 1000
                          }s)...`,
                        );

                        // Setiap retry, tunggu loading dulu
                        await waitUntilLoadingDone(timeout);

                        const baseValidationChecks = [
                          waitForElementAsync(
                            X_PATH.POPUP_INDIVIDU_SUDAH_MENERIMA_LAYANAN,
                            null,
                            timeout,
                          ).then(() => "SUDAH_LAYANAN"),
                          waitForElementAsync(
                            X_PATH.POPUP_DATA_PESERTA_WALI_TIDAK_VALID,
                            null,
                            timeout,
                          ).then(() => "INVALID_WALI"),
                          waitForElementAsync(
                            X_PATH.POPUP_DATA_PESERTA_TIDAK_VALID,
                            null,
                            timeout,
                          ).then(() => "INVALID_PESERTA"),
                          waitForElementAsync(
                            X_PATH.BTN_LANJUTKAN_DATA_VALID,
                            null,
                            timeout,
                          ).then(() => "SUCCESS_ROUTE"),
                        ];

                        try {
                          let status = await Promise.race([
                            waitForElementAsync(
                              X_PATH.BTN_LANJUT_KUOTA_HABIS,
                              null,
                              timeout,
                            ).then(() => "QUOTA_HABIS"),
                            ...baseValidationChecks,
                          ]);

                          if (status === "QUOTA_HABIS") {
                            logStatus(
                              "⚠️ Kuota habis terdeteksi, melewati pembatasan...",
                            );
                            const btnKuota = await waitForElementAsync(
                              X_PATH.BTN_LANJUT_KUOTA_HABIS,
                            );
                            clickElement(btnKuota);
                            logStatus(
                              "Memeriksa validasi data setelah bypass kuota...",
                            );
                            status = await Promise.race(baseValidationChecks);
                          }

                          if (status === "SUDAH_LAYANAN") {
                            logStatus(
                              "❌ Gagal: Individu sudah menerima layanan.",
                            );
                            state.earlyExit = {
                              success: false,
                              status: "LAINNYA",
                              message: "Individu sudah menerima layanan",
                            };
                            return;
                          } else if (status === "INVALID_WALI") {
                            logStatus(
                              "❌ Gagal: Data peserta atau wali tidak valid.",
                            );
                            state.earlyExit = {
                              success: false,
                              status: "LAINNYA",
                              message: "Data peserta atau wali tidak valid",
                            };
                            return;
                          } else if (status === "INVALID_PESERTA") {
                            logStatus("❌ Gagal: Data peserta tidak valid.");
                            state.earlyExit = {
                              success: false,
                              status: "LAINNYA",
                              message: "Data peserta tidak valid",
                            };
                            return;
                          } else if (status === "SUCCESS_ROUTE") {
                            logStatus(
                              "✅ Data valid! Melanjutkan pendaftaran...",
                            );
                            return; // ✅ keluar dari retry loop, lanjut step berikutnya
                          }
                        } catch (err) {
                          // Semua check timeout → retry
                          logStatus(
                            `   ⏱️ Timeout percobaan ${attempt}/${MAX_RETRY} (${
                              timeout / 1000
                            }s)`,
                          );

                          if (attempt < MAX_RETRY) {
                            logStatus(
                              "   🔄 Tunggu 2 detik, klik 'Selanjutnya' ulang...",
                            );
                            await sleep(2000);

                            // Coba klik "Selanjutnya" lagi (trigger ulang server)
                            try {
                              const btnRetry = await waitForElementAsync(
                                X_PATH.BTN_SELANJUTNYA ||
                                  "//button[contains(., 'Selanjutnya')]",
                                null,
                                3000,
                              );
                              if (btnRetry) {
                                clickElement(btnRetry);
                                logStatus("   → Klik 'Selanjutnya' ulang");
                              }
                            } catch (e) {
                              logStatus(
                                "   → Tombol tidak muncul, lanjut tunggu",
                              );
                            }
                          } else {
                            // Habis retry
                            logStatus(
                              "❌ Gagal: Server tidak responsif setelah semua percobaan",
                            );
                            state.earlyExit = {
                              success: false,
                              status: "TIMEOUT",
                              message:
                                "Server slow - timeout setelah 3 percobaan",
                            };
                            return;
                          }
                        }
                      }
                    },
                  },

                  {
                    name: "Continue Registration Submission",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("6. Lanjutkan ke pengisian berikutnya...");
                      const btnLanjut = await waitForElementAsync(
                        X_PATH.BTN_LANJUTKAN_DATA_VALID,
                      );
                      clickElement(btnLanjut);
                    },
                  },
                  {
                    name: "Filling Registration Submission",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("7. Pengisian formulir pendaftaran...");
                      const inputAlamat = await waitForElementAsync(
                        X_PATH.INPUT_ALAMAT,
                      );
                      inputElementValue(
                        inputAlamat,
                        inData.alamat || defData.alamat,
                      );

                      try {
                        const statusPernikahan = await waitForElementAsync(
                          X_PATH.INPUT_STATUS_PERNIKAHAN,
                        );
                        clickElement(statusPernikahan);
                        const statusPernikahanOption =
                          await waitForElementAsync(
                            `//div[text()='${inData.status_perkawinan || defData.status_perkawinan}']/ancestor::div[contains(@class,'cursor-pointer')]`,
                          );
                        clickElement(statusPernikahanOption);
                      } catch (err) {
                        console.warn("Ignore existing status pernikahan");
                      }

                      const statusDisablitas = await waitForElementAsync(
                        X_PATH.INPUT_STATUS_DISABILITAS,
                      );
                      clickElement(statusDisablitas);
                      const statusDisabilitasOption = await waitForElementAsync(
                        `//div[text()='${(inData.status_disabilitas || defData.status_disabilitas) == "YA" ? "Memiliki disabilitas" : "Tidak memiliki disabilitas"}']/ancestor::div[contains(@class,'cursor-pointer')]`,
                      );
                      clickElement(statusDisabilitasOption);

                      try {
                        async function selectPekerjaan() {
                          const inputPekerjaan = await waitForElementAsync(
                            X_PATH.INPUT_PEKERJAAN,
                          );
                          if (!inputPekerjaan) return;
                          clickElement(inputPekerjaan);

                          const inputPekerjaanParent =
                            await waitForElementAsync(
                              X_PATH.INPUT_PEKERJAAN_PARENT,
                            );
                          if (!inputPekerjaanParent) return;
                          const xpath = `.//button[.//div[contains(normalize-space(text()), '${setPekerjaanBasedOnAge(inData.pekerjaan || defData.pekerjaan, inData.status_usia)}')]]`;
                          const pekerjaanEl = document.evaluate(
                            xpath,
                            inputPekerjaanParent,
                            null,
                            XPathResult.FIRST_ORDERED_NODE_TYPE,
                            null,
                          ).singleNodeValue;
                          if (pekerjaanEl) {
                            clickElement(pekerjaanEl);
                          }
                        }
                        await selectPekerjaan();
                      } catch (err) {
                        console.warn("Ignore existing pekerjaan");
                      }
                      try {
                        async function selectAlamatDomisili() {
                          const inputDomisili = await waitForElementAsync(
                            X_PATH.INPUT_ALAMAT_DOMISILI,
                          );
                          if (!inputDomisili) return;
                          clickElement(inputDomisili);
                          async function getKelDesa() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_KEL_DESA_PARENT,
                              inData.kel_desa || defData.kel_desa,
                            );
                          }
                          async function getKecamatan() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_KECAMATAN_PARENT,
                              inData.kecamatan || defData.kecamatan,
                            );
                            if (success) {
                              await getKelDesa();
                            }
                          }
                          async function getKabKota() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_KAB_KOTA_PARENT,
                              inData.kab_kota || defData.kab_kota,
                            );
                            if (success) {
                              await getKecamatan();
                            }
                          }
                          async function getProvinsi() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_PROVINSI_PARENT,
                              inData.provinsi || defData.provinsi,
                            );
                            if (success) {
                              await getKabKota();
                            }
                          }
                          await getProvinsi();
                        }
                        await selectAlamatDomisili();
                      } catch (err) {
                        console.warn("Ignore existing alamat domisili!");
                      }
                    },
                  },
                  {
                    name: "Finalize Registration Submission",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("8. Finalisasi formulir pendaftaran...");
                      async function clickFinalSelanjutnya() {
                        const btn = document.evaluate(
                          X_PATH.BTN_SELANJUTNYA_FORMULIR_PENDAFTARAN,
                          document,
                          null,
                          XPathResult.FIRST_ORDERED_NODE_TYPE,
                          null,
                        ).singleNodeValue;
                        if (btn) btn.click();
                      }

                      await clickFinalSelanjutnya();
                      setTimeout(clickFinalSelanjutnya, 2000);
                    },
                  },
                  {
                    name: "Choose the data",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("9. Pilih dan next data peserta...");
                      const btnPilihPeserta = await waitForElementAsync(
                        X_PATH.BTN_PILIH_TABLE_DATA_PESERTA,
                      );
                      clickElement(btnPilihPeserta);
                      const btnDaftarDenganNIK = await waitForElementAsync(
                        X_PATH.BTN_DAFTARKAN_DENGAN_NIK,
                      );
                      clickElement(btnDaftarDenganNIK);
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
                  message: "Pendaftaran Berhasil!",
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
            } else {
              resolve(results[0].result);
            }
          },
        );
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.runtime.onMessage.addListener(panelMessageListener);
  });
}
