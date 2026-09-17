// ==================== ROBOT PEMERIKSAAN MANDIRI ====================

async function runPemeriksaanMandiri(iData, mode = REGISTRATION_MODES.INDIVIDUAL) {
  showPanelMessage(
    `📋 Mulai Pemeriksaan Mandiri untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );
  if (!iData.status_usia && iData.tgl_lahir) {
    try {
      if (typeof computeStatusUsia === "function") {
        iData.status_usia = computeStatusUsia(iData.tgl_lahir);
      } else if (typeof getAgeCategory === "function") {
        iData.status_usia = getAgeCategory(iData.tgl_lahir);
      }
    } catch (e) {
      console.warn("[Mandiri] Gagal hitung status_usia:", e);
    }
  }

  if (!iData.status_perkawinan && iData.tgl_lahir) {
    try {
      if (typeof computeStatusPerkawinan === "function") {
        iData.status_perkawinan = computeStatusPerkawinan(iData.tgl_lahir);
      } else if (typeof getDefaultStatusPerkawinan === "function") {
        iData.status_perkawinan = getDefaultStatusPerkawinan(iData.tgl_lahir);
      }
    } catch (e) {
      console.warn("[Mandiri] Gagal hitung status_perkawinan:", e);
    }
  }

  console.log("[Mandiri] iData status_usia:", iData.status_usia || "(kosong)");
  console.log("[Mandiri] iData status_perkawinan:", iData.status_perkawinan || "(kosong)");

  // ✅ FIX: Default PEMERIKSAAN, bukan default peserta
  const defData = getDefaultPemeriksaanData();

  // ✅ URL string (helper handle mode)
  const url = getPelayananDetailPemeriksaanUrl(mode);

  const tgl_pemeriksaan = localStorage.getItem(LOCAL_STORAGE.TGL_PEMERIKSAAN);

  let result;
  try {
    result = await runPemeriksaanMandiriAutofill({
      aktifData: iData,
      defData,
      schema: pemeriksaanDataSchema,
      url,
      tgl_pemeriksaan,
    });
  } catch (err) {
    console.error("Error di runPemeriksaanMandiriAutofill:", err);
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
      message: "Hasil tidak valid dari runPemeriksaanMandiriAutofill",
    };
  }

  appendPanelMessage(
    `Konfirmasi Mulai Pemeriksaan Mandiri. Status: ${result.status} - ${result.message}`,
  );

  if (result.success) {
    iData.pemeriksaan_mandiri = "OK";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  } else if (result.status === "SKIPPED") {
    iData.pemeriksaan_mandiri = "LEWATI";
    iData.keterangan = result.message;
  } else if (result.status === "ERROR" || result.status === "TIMEOUT") {
    iData.keterangan = result.message;
  } else {
    iData.pemeriksaan_mandiri = "GAGAL";
    iData.status_input = result.status;
    iData.keterangan = result.message;
  }

  await new Promise((r) => setTimeout(r, 1500));
  return iData;
}

async function runPemeriksaanMandiriAutofill({
  aktifData,
  defData,
  schema,
  url,
  tgl_pemeriksaan,
}) {
  // ✅ Pakai TAB AKTIF (asumsi user sudah di halaman detail)
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const targetTabId = tab.id;

  // ✅ Cek apakah tab aktif di URL pemeriksaan
  const scriptResult = await chrome.scripting.executeScript({
    target: { tabId: targetTabId },
    args: [url],
    func: (targetUrl) => {
      const currentUrl = window.location.href;
      return currentUrl.includes(targetUrl) || currentUrl === targetUrl;
    },
  });
  const isPageMatch = scriptResult[0]?.result;

  if (!isPageMatch) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Gagal: Halaman browser aktif tidak berada di URL pemeriksaan yang sesuai.",
    };
  }

  // ✅ Buat mapping label → key (dari schema)
  function createLabelToKeyMapping(schema) {
    const mapping = {};
    Object.values(schema).forEach((item) => {
      if (item.label && item.key) {
        mapping[item.label.trim()] = item.key;
      }
    });
    return mapping;
  }
  const LAYANAN_TO_SCHEMA_MAP = createLabelToKeyMapping(schema);

  // ✅ Pipeline pattern (background script handle navigasi)
  return new Promise((resolve) => {
    async function backgroundMessageListener(request, sender) {
      if (request.type === "ROBOT_STATUS") {
        appendPanelMessage(request.message);
      }

      if (request.type === "PIPELINE_COMPLETE") {
        chrome.runtime.onMessage.removeListener(backgroundMessageListener);

        // Tunggu tab kembali ke halaman detail
        async function waitForTab(tabId) {
          const tab = await chrome.tabs.get(tabId);
          if (
            tab.status === "complete" &&
            tab.url?.includes("pelayanan/detail")
          ) {
            return;
          }
          return new Promise((resolve) => {
            function listener(updatedTabId, changeInfo, updatedTab) {
              if (
                updatedTabId === tabId &&
                changeInfo.status === "complete" &&
                updatedTab.url?.includes("pelayanan/detail")
              ) {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            }
            chrome.tabs.onUpdated.addListener(listener);
          });
        }

        await waitForTab(targetTabId);

        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          func: async () => {
            await new Promise((r) => setTimeout(r, 2000));
            const rows = document.querySelectorAll(
              ".table-pemeriksaan-mandiri table tbody tr",
            );
            let allComplete = true;
            rows.forEach((row) => {
              const cells = row.querySelectorAll("td");
              if (cells.length < 3) return;
              const statusImg = cells[1].querySelector("img");
              if (statusImg) {
                const imgSrc = statusImg.getAttribute("src") || "";
                if (
                  imgSrc.includes("icon-success.svg") &&
                  !imgSrc.includes("icon-success-gray.svg")
                ) {
                  return;
                }
              }
              allComplete = false;
            });

            if (allComplete) {
              return {
                success: true,
                status: "-- ON PROGRESS --",
                message:
                  "Semua formulir mandiri yang tersedia berhasil di-autofill secara otomatis.",
              };
            } else {
              return {
                success: false,
                status: "ERROR",
                message: "Masih ada data yang belum terisi!",
              };
            }
          },
        });
        resolve(result);
      }
    }
    chrome.runtime.onMessage.addListener(backgroundMessageListener);

    // ✅ Suntikkan script scanning tabel
    chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      args: [aktifData, defData, schema, LAYANAN_TO_SCHEMA_MAP],
      func: async (inData, defaultData, globalSchema, mapping) => {
        const rows = document.querySelectorAll(
          ".table-pemeriksaan-mandiri table tbody tr",
        );
        const queue = [];

        rows.forEach((row) => {
          const cells = row.querySelectorAll("td");
          if (cells.length < 3) return;

          const statusImg = cells[1].querySelector("img");
          if (statusImg) {
            const imgSrc = statusImg.getAttribute("src") || "";
            if (
              imgSrc.includes("icon-success.svg") &&
              !imgSrc.includes("icon-success-gray.svg")
            ) {
              return; // sudah selesai
            }
          }

          const namaLayananHTML = cells[0].textContent.trim();
          const btnInput = cells[2].querySelector("button");
          const schemaKey = mapping[namaLayananHTML];

          if (
            btnInput &&
            btnInput.textContent.includes("Input Data") &&
            schemaKey
          ) {
            const parentContainer =
              btnInput.closest("div[id]") || btnInput.closest("tr");

            if (!parentContainer.id) {
              parentContainer.id =
                "robot_row_" + Math.random().toString(36).substr(2, 9);
            }

            queue.push({
              nama: namaLayananHTML,
              key: schemaKey,
              elementId: parentContainer.id,
            });
          }
        });

        if (queue.length === 0) {
          return chrome.runtime.sendMessage({ type: "PIPELINE_COMPLETE" });
        }

        // Kirim ke background untuk pipeline
        chrome.runtime.sendMessage({
          type: "START_PIPELINE_FLOW",
          queue: queue,
          inData,
          defData: defaultData,
          schema: globalSchema,
        });
      },
    });
  });
}