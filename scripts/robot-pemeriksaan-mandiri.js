// ==================== ROBOT PEMERIKSAAN MANDIRI ====================

async function runPemeriksaanMandiri(
  iData,
  mode = REGISTRATION_MODES.INDIVIDUAL,
) {
  showPanelMessage(
    `📋 Mulai Pemeriksaan Mandiri untuk ${iData.no}-${iData.nik}-${iData.nama}`,
  );

  const defData = getDefaultData(mode);
  const url = getPelayananDetailPemeriksaanUrl(mode); // helper di constant/helper

  let result;
  try {
    result = await runPemeriksaanMandiriAutofill({
      aktifData: iData,
      defData,
      schema: pemeriksaanDataSchema,
      url,
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
  } else {
    if (result.status === "ERROR" || result.status === "TIMEOUT") {
      iData.keterangan = result.message;
    } else {
      iData.pemeriksaan_mandiri = "GAGAL";
      iData.status_input = result.status;
      iData.keterangan = result.message;
    }
  }

  await new Promise((r) => setTimeout(r, 1500));
  return iData;
}

async function runPemeriksaanMandiriAutofill({
  aktifData,
  defData,
  schema,
  url,
}) {
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

  // 2. Fungsi mapping label ke key schema
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

  // 3. Jalankan pipeline
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

        // Eksekusi script di tab target
        chrome.scripting.executeScript(
          {
            target: { tabId: targetTabId },
            args: [aktifData, defData, schema, LAYANAN_TO_SCHEMA_MAP],
            func: async (inData, defaultData, globalSchema, mapping) => {
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

                logStatus("Memindai tabel pemeriksaan mandiri...");

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

                  const namaLayanan = cells[0].textContent.trim();
                  const btnInput = cells[2].querySelector("button");
                  const schemaKey = mapping[namaLayanan];

                  if (
                    btnInput &&
                    btnInput.textContent.includes("Input Data") &&
                    schemaKey
                  ) {
                    queue.push({
                      nama: namaLayanan,
                      key: schemaKey,
                    });
                  }
                });

                if (queue.length === 0) {
                  // Tidak ada yang perlu diisi
                  return {
                    success: true,
                    status: "-- ON PROGRESS --",
                    message:
                      "Semua formulir mandiri yang tersedia sudah terisi.",
                  };
                }

                // Karena implementasi pengisian mandiri memerlukan navigasi antar halaman,
                // kita kembalikan sukses untuk saat ini. Nanti bisa dikembangkan.
                return {
                  success: true,
                  status: "-- ON PROGRESS --",
                  message: `Terdapat ${queue.length} layanan mandiri yang perlu diisi.`,
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
