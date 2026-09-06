// ==================== ROBOT PENDAFTARAN SEKOLAH ====================

async function runPendaftaranSekolah(iData, defData) {
  showPanelMessage(
    `🏫 Pengisian Data Sekolah untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  let result;
  try {
    result = await runPendaftaranAutofillSekolah({
      aktifData: iData,
      defData,
      url: MAIN_URL.PENDAFTARAN.SCHOOL,
    });
  } catch (err) {
    console.error("Error di runPendaftaranAutofillSekolah:", err);
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
      message: "Hasil tidak valid dari runPendaftaranAutofillSekolah",
    };
  }

  appendPanelMessage(
    `Pendaftaran selesai. Status: ${result.status} - ${result.message}`,
  );

  if (result.success) {
    iData.pendaftaran = "OK";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  } else {
    if (result.status === "ERROR" || result.status === "TIMEOUT") {
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

async function runPendaftaranAutofillSekolah({ aktifData, defData, url }) {
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

                // Helper: pilih tanggal lahir
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

                // Helper: isi data sekolah (nama sekolah + jenjang)
                async function fillSchoolData() {
                  logStatus("Mengisi data sekolah...");

                  // --- Nama Sekolah ---
                  try {
                    async function selectNamaSekolah() {
                      const inputSekolah = await waitForElementAsync(
                        X_PATH.INPUT_NAMA_SEKOLAH,
                      );
                      if (!inputSekolah) return;
                      clickElement(inputSekolah);

                      const inputSekolahParent = await waitForElementAsync(
                        X_PATH.INPUT_NAMA_SEKOLAH_PARENT,
                      );
                      if (!inputSekolahParent) return;

                      const namaSekolah =
                        inData.nama_sekolah || defData.nama_sekolah;
                      const xpath = `.//button[.//div[contains(normalize-space(text()), '${namaSekolah}')]]`;
                      const sekolahEl = document.evaluate(
                        xpath,
                        inputSekolahParent,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                      ).singleNodeValue;

                      if (sekolahEl) {
                        clickElement(sekolahEl);
                        logStatus(`✅ Nama sekolah "${namaSekolah}" dipilih.`);
                        await sleep(500);
                      } else {
                        throw new Error("Opsi nama sekolah tidak ditemukan");
                      }
                    }
                    await selectNamaSekolah();
                  } catch (err) {
                    console.warn("Gagal memilih nama sekolah:", err);
                    logStatus("❌ Gagal memilih nama sekolah: " + err.message);
                    throw err;
                  }

                  // --- Jenjang Pendidikan ---
                  try {
                    async function selectJenjangPendidikan() {
                      const inputJenjang = await waitForElementAsync(
                        X_PATH.INPUT_JENJANG_PENDIDIKAN,
                      );
                      if (!inputJenjang) return;
                      clickElement(inputJenjang);

                      const inputJenjangParent = await waitForElementAsync(
                        X_PATH.INPUT_JENJANG_PENDIDIKAN_PARENT,
                      );
                      if (!inputJenjangParent) return;

                      const jenjangValue =
                        inData.jenjang_pendidikan ||
                        defData.jenjang_pendidikan ||
                        "Kelas 1";
                      const xpath = `.//button[.//div[contains(normalize-space(text()), '${jenjangValue}')]]`;
                      const jenjangEl = document.evaluate(
                        xpath,
                        inputJenjangParent,
                        null,
                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                        null,
                      ).singleNodeValue;

                      if (jenjangEl) {
                        clickElement(jenjangEl);
                        logStatus(`✅ Jenjang "${jenjangValue}" dipilih.`);
                        await sleep(500);
                      } else {
                        throw new Error("Opsi jenjang tidak ditemukan");
                      }
                    }
                    await selectJenjangPendidikan();
                  } catch (err) {
                    console.warn("Gagal memilih jenjang:", err);
                    logStatus("❌ Gagal memilih jenjang: " + err.message);
                    throw err;
                  }
                }

                logStatus("Data sekolah diterima, mulai proses pendaftaran...");
                const state = { nikFound: true, earlyExit: null };

                const steps = [
                  {
                    name: "Click Daftar Baru",
                    action: async () => {
                      logStatus("1. Membuka form pendaftaran...");
                      const btnXPath =
                        X_PATH.BTN_DAFTAR_BARU_SEKOLAH ||
                        X_PATH.BTN_DAFTAR_BARU;
                      const btn = await waitForElementAsync(btnXPath);
                      await sleep(3000);
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
                    name: "Handle Manual Form Fill",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("2. Mengisi data manual...");

                      // NIK
                      try {
                        const inputNIK = await waitForElementAsync(
                          X_PATH.INPUT_NIK_PENDAFTARAN,
                        );
                        inputElementValue(inputNIK, inData.nik);
                      } catch (e) {
                        logStatus("⚠️ Field NIK tidak ditemukan");
                      }

                      // Nama
                      try {
                        const nameInput = await waitForElementAsync(
                          X_PATH.INPUT_NAMA_LENGKAP,
                        );
                        inputElementValue(nameInput, inData.nama);
                      } catch (e) {
                        logStatus("⚠️ Field Nama tidak ditemukan");
                      }

                      // Tanggal lahir
                      try {
                        await selectBirthYear(
                          inData.tgl_lahir,
                          X_PATH.INPUT_TGL_LAHIR,
                        );
                      } catch (e) {
                        logStatus("⚠️ Gagal mengisi tanggal lahir");
                      }

                      // Jenis kelamin
                      try {
                        const jkInput = await waitForElementAsync(
                          X_PATH.INPUT_JENIS_KELAMIN,
                        );
                        clickElement(jkInput);
                        const isPerempuan =
                          String(inData.jenis_kelamin).toLowerCase() === "p";
                        const genderEl = await waitForElementAsync(
                          isPerempuan
                            ? X_PATH.SELECT_JK_PR
                            : X_PATH.SELECT_JK_LK,
                        );
                        clickElement(genderEl);
                      } catch (e) {
                        logStatus("⚠️ Gagal mengisi jenis kelamin");
                      }

                      // No HP
                      try {
                        const waInput = await waitForElementAsync(
                          X_PATH.INPUT_WA,
                        );
                        inputElementValue(
                          waInput,
                          inData.no_hp || defData.no_hp,
                        );
                      } catch (e) {
                        logStatus("⚠️ Gagal mengisi No HP");
                      }
                    },
                  },
                  {
                    name: "Handle Guardian (Wali) Rules based on Age",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      if (isOver60Years(inData.tgl_lahir)) {
                        try {
                          logStatus("3. Checkbox tanpa wali...");
                          const cb = await waitForElementAsync(
                            X_PATH.CHECKBOX_TANPA_WALI,
                          );
                          clickElement(cb);
                        } catch (e) {
                          logStatus("⚠️ Checkbox tanpa wali tidak ditemukan");
                        }
                      } else if (isUnder6Years(inData.tgl_lahir)) {
                        logStatus("3. Mengisi data wali...");
                        try {
                          const inputNIKWali = await waitForElementAsync(
                            X_PATH.INPUT_NIK_WALI,
                          );
                          inputElementValue(
                            inputNIKWali,
                            inData.nik_wali || defData.nik_wali,
                          );
                        } catch (e) {
                          logStatus("⚠️ Field NIK wali tidak ditemukan");
                        }
                        try {
                          const inputNamaWali = await waitForElementAsync(
                            X_PATH.INPUT_NAMA_LENGKAP_WALI,
                          );
                          inputElementValue(
                            inputNamaWali,
                            inData.nama_wali || defData.nama_wali,
                          );
                        } catch (e) {
                          logStatus("⚠️ Field Nama wali tidak ditemukan");
                        }
                        try {
                          await selectBirthYear(
                            inData.tgl_lahir_wali || defData.tgl_lahir_wali,
                            X_PATH.INPUT_TGL_LAHIR_WALI,
                          );
                        } catch (e) {
                          logStatus("⚠️ Gagal mengisi tanggal lahir wali");
                        }
                        try {
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
                        } catch (e) {
                          logStatus("⚠️ Gagal mengisi jenis kelamin wali");
                        }
                        try {
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
                        } catch (e) {
                          logStatus("⚠️ Gagal mengisi No HP wali");
                        }
                      }
                    },
                  },
                  {
                    name: "Click Next & Handle Multi-Stage Validation",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("4. Menekan tombol selanjutnya...");
                      const btnSelanjutnyaXPath =
                        X_PATH.BTN_SELANJUTNYA ||
                        "//button[contains(., 'Selanjutnya')]";
                      let btnSelanjutnya = null;
                      for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                          btnSelanjutnya = await waitForElementAsync(
                            btnSelanjutnyaXPath,
                            null,
                            5000,
                          );
                          if (btnSelanjutnya) break;
                        } catch (e) {
                          /* lanjut */
                        }
                        await sleep(3000);
                      }
                      if (!btnSelanjutnya) {
                        state.earlyExit = {
                          success: false,
                          status: "ERROR",
                          message: "Tombol Selanjutnya tidak ditemukan",
                        };
                        return;
                      }
                      clickElement(btnSelanjutnya);
                      logStatus("Menunggu respons validasi sistem...");

                      const baseValidationChecks = [
                        waitForElementAsync(
                          X_PATH.POPUP_INDIVIDU_SUDAH_MENERIMA_LAYANAN,
                        ).then(() => "SUDAH_LAYANAN"),
                        waitForElementAsync(
                          X_PATH.POPUP_DATA_PESERTA_WALI_TIDAK_VALID,
                        ).then(() => "INVALID_WALI"),
                        waitForElementAsync(
                          X_PATH.POPUP_DATA_PESERTA_TIDAK_VALID,
                        ).then(() => "INVALID_PESERTA"),
                        waitForElementAsync(
                          X_PATH.BTN_LANJUTKAN_DATA_VALID,
                        ).then(() => "SUCCESS_ROUTE"),
                      ];

                      try {
                        let status = await Promise.race([
                          waitForElementAsync(
                            X_PATH.BTN_LANJUT_KUOTA_HABIS,
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
                          logStatus("❌ Gagal: Siswa sudah menerima layanan.");
                          state.earlyExit = {
                            success: false,
                            status: "LAINNYA",
                            message: "Siswa sudah menerima layanan",
                          };
                        } else if (status === "INVALID_WALI") {
                          logStatus(
                            "❌ Gagal: Data siswa atau wali tidak valid.",
                          );
                          state.earlyExit = {
                            success: false,
                            status: "LAINNYA",
                            message: "Data siswa atau wali tidak valid",
                          };
                        } else if (status === "INVALID_PESERTA") {
                          logStatus("❌ Gagal: Data siswa tidak valid.");
                          state.earlyExit = {
                            success: false,
                            status: "LAINNYA",
                            message: "Data siswa tidak valid",
                          };
                        } else if (status === "SUCCESS_ROUTE") {
                          logStatus(
                            "✅ Data valid! Melanjutkan pendaftaran...",
                          );
                        }
                      } catch (err) {
                        logStatus(
                          "❌ Error: Validasi sistem tidak merespons (Timeout).",
                        );
                        state.earlyExit = {
                          success: false,
                          status: "TIMEOUT",
                          message:
                            "System timeout waiting for validation response",
                        };
                      }
                    },
                  },
                  {
                    name: "Continue Registration Submission",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("5. Lanjutkan ke pengisian berikutnya...");
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
                      logStatus("6. Pengisian formulir pendaftaran...");

                      // Alamat
                      try {
                        const inputAlamat = await waitForElementAsync(
                          X_PATH.INPUT_ALAMAT,
                        );
                        inputElementValue(
                          inputAlamat,
                          inData.alamat || defData.alamat,
                        );
                      } catch (e) {
                        logStatus("⚠️ Field Alamat tidak ditemukan");
                      }

                      // Status pernikahan
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
                      } catch (e) {
                        logStatus("⚠️ Gagal memilih status pernikahan");
                      }

                      // Status disabilitas
                      try {
                        const statusDisablitas = await waitForElementAsync(
                          X_PATH.INPUT_STATUS_DISABILITAS,
                        );
                        clickElement(statusDisablitas);
                        const statusDisabilitasOption =
                          await waitForElementAsync(
                            `//div[text()='${(inData.status_perkawinan || defData.status_perkawinan) == "YA" ? "Memiliki disabilitas" : "Tidak memiliki disabilitas"}']/ancestor::div[contains(@class,'cursor-pointer')]`,
                          );
                        clickElement(statusDisabilitasOption);
                      } catch (e) {
                        logStatus("⚠️ Gagal memilih status disabilitas");
                      }

                      // Isi data sekolah
                      await fillSchoolData();

                      // Alamat domisili
                      try {
                        async function selectAlamatDomisili() {
                          const inputDomisili = await waitForElementAsync(
                            X_PATH.INPUT_ALAMAT_DOMISILI,
                          );
                          if (!inputDomisili) return;
                          clickElement(inputDomisili);

                          async function getKelDesa() {
                            await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_KEL_DESA_PARENT,
                              inData.kel_desa || defData.kel_desa,
                            );
                          }
                          async function getKecamatan() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_KECAMATAN_PARENT,
                              inData.kecamatan || defData.kecamatan,
                            );
                            if (success) await getKelDesa();
                          }
                          async function getKabKota() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_KAB_KOTA_PARENT,
                              inData.kab_kota || defData.kab_kota,
                            );
                            if (success) await getKecamatan();
                          }
                          async function getProvinsi() {
                            const success = await selectWithRetry(
                              X_PATH.INPUT_ALAMAT_DOMISILI_PROVINSI_PARENT,
                              inData.provinsi || defData.provinsi,
                            );
                            if (success) await getKabKota();
                          }
                          await getProvinsi();
                        }
                        await selectAlamatDomisili();
                      } catch (e) {
                        logStatus("⚠️ Gagal mengisi alamat domisili");
                      }

                      // RT/RW
                      try {
                        const inputRT = await waitForElementAsync(
                          "//input[@id='rt']",
                          null,
                          3000,
                        );
                        if (inputRT)
                          inputElementValue(inputRT, inData.rt || "");
                      } catch (e) {}
                      try {
                        const inputRW = await waitForElementAsync(
                          "//input[@id='rw']",
                          null,
                          3000,
                        );
                        if (inputRW)
                          inputElementValue(inputRW, inData.rw || "");
                      } catch (e) {}
                    },
                  },
                  {
                    name: "Finalize Registration Submission",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("7. Finalisasi formulir pendaftaran...");
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
                      setTimeout(clickFinalSelanjutnya, 1000);
                    },
                  },
                  {
                    name: "Tunggu Popup Berhasil",
                    shouldRun: () => !state.earlyExit,
                    action: async () => {
                      logStatus("8. Menunggu popup berhasil...");
                      try {
                        await waitForElementAsync(
                          "//div[contains(., 'Berhasil Daftar')]",
                          null,
                          15000,
                        );
                        const tiketEl = document.evaluate(
                          "//div[contains(., 'No. Tiket:')]",
                          document,
                          null,
                          XPathResult.FIRST_ORDERED_NODE_TYPE,
                          null,
                        ).singleNodeValue;
                        const noTiket = tiketEl
                          ? tiketEl.textContent.trim()
                          : "";
                        logStatus(`✅ Pendaftaran berhasil. ${noTiket}`);
                        state.earlyExit = {
                          success: true,
                          status: "SUCCESS",
                          message: "Pendaftaran berhasil",
                        };
                      } catch (err) {
                        logStatus("❌ Timeout menunggu popup berhasil.");
                        state.earlyExit = {
                          success: false,
                          status: "TIMEOUT",
                          message: "Timeout menunggu popup berhasil",
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
            console.log("Hasil executeScript:", results);
            if (results && results[0]) {
              console.log("Result object:", JSON.stringify(results[0].result));
              console.log("Result error:", JSON.stringify(results[0].error));
            }
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
            if (
              !results ||
              !results[0] ||
              results[0].result === undefined ||
              results[0].result === null
            ) {
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
