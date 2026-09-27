// ==================== BACKGROUND PIPELINE ====================

let currentPipeline = {
  queue: [],
  currentIndex: 0,
  inData: {},
  defData: {},
  schema: {},
  targetTabId: null,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const targetTabId = sender.tab ? sender.tab.id : null;

  if (msg.type === "START_PIPELINE_FLOW") {
    currentPipeline.queue = msg.queue;
    currentPipeline.currentIndex = 0;
    currentPipeline.inData = msg.inData;
    currentPipeline.defData = msg.defData;
    currentPipeline.schema = msg.schema;
    currentPipeline.targetTabId = targetTabId;

    chrome.runtime.sendMessage({
      type: "ROBOT_STATUS",
      message: `Terdeteksi ${msg.queue.length} pemeriksaan. Memulai pengisian...`,
    });

    executeNextForm(targetTabId);
  }

  if (msg.type === "FORM_SUBMIT_SUCCESS") {
    currentPipeline.currentIndex++;

    if (currentPipeline.currentIndex < currentPipeline.queue.length) {
      function returnListener(tabId, changeInfo, tab) {
        if (tabId === targetTabId && changeInfo.status === "complete") {
          if (tab.url && tab.url.includes("pelayanan/detail")) {
            chrome.tabs.onUpdated.removeListener(returnListener);
            executeNextForm(targetTabId);
          }
        }
      }
      chrome.tabs.onUpdated.addListener(returnListener);
    } else {
      chrome.runtime.sendMessage({ type: "PIPELINE_COMPLETE" });
    }
  }
});

async function executeNextForm(tabId) {
  const currentItem = currentPipeline.queue[currentPipeline.currentIndex];

  chrome.runtime.sendMessage({
    type: "ROBOT_STATUS",
    message: `Membuka form: ${currentItem.nama}`,
  });

  // ✅ Pasang listener DULU sebelum klik
  function formLoadListener(tId, changeInfo, tab) {
    if (tId === tabId && changeInfo.status === "complete") {
      if (tab.url && tab.url.includes("skrining-form")) {
        chrome.tabs.onUpdated.removeListener(formLoadListener);

        setTimeout(() => {
          chrome.scripting
            .executeScript({
              target: { tabId: tabId },
              args: [
                currentItem.key,
                currentPipeline.inData,
                currentPipeline.defData,
                currentPipeline.schema,
              ],
              func: runDynamicAutofillForm,
            })
            .catch((err) =>
              console.error("[Robot] Gagal injeksi autofill:", err),
            );
        }, 200);
      }
    }
  }
  chrome.tabs.onUpdated.addListener(formLoadListener);

  // ✅ Klik tombol "Input Data"
  chrome.scripting
    .executeScript({
      target: { tabId: tabId },
      args: [currentItem.elementId],
      func: (containerId) => {
        return new Promise((resolve) => {
          let attempts = 0;
          const maxAttempts = 10;

          const tryClick = () => {
            const container = document.getElementById(containerId);
            if (container) {
              const button = container.querySelector("button");
              if (button) {
                button.click();
                resolve(true);
                return;
              }
            }

            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(tryClick, 1500);
            } else {
              console.error(
                `[Robot] Gagal menemukan tombol di container ${containerId}`,
              );
              resolve(false);
            }
          };

          tryClick();
        });
      },
    })
    .catch((err) =>
      console.error("[Robot] Gagal klik tombol input:", err),
    );
}

// ============================================================
// FORM AUTOFILL (dijalankan di halaman /skrining-form)
// ============================================================
async function runDynamicAutofillForm(
  schemaKey,
  inData,
  defData,
  globalSchema,
) {
  const sectionSchema = globalSchema[schemaKey];
  if (!sectionSchema || !sectionSchema.input) {
    console.error("Skema tidak ditemukan untuk kunci:", schemaKey);
    return;
  }

  console.log(`[Robot] Memulai autofill untuk: ${sectionSchema.label}`);
  await new Promise((r) => setTimeout(r, 1500));

  async function fillQuestion() {
    for (const field of sectionSchema.input) {
      const defKey = sectionSchema.key + "_" + field.key;
      const valueToFill = defData[defKey] || field.default;

      if (valueToFill === undefined || valueToFill === null || valueToFill === "")
        continue;

      // Cari container pertanyaan
      const questions = document.querySelectorAll(".sd-question");
      let targetQuestionEl = null;

      for (const q of questions) {
        const titleEl = q.querySelector(
          ".sd-question__title .sv-string-viewer",
        );
        if (titleEl) {
          // ✅ Normalisasi nbsp + spasi berlebih
          const normalizedDOMTitle = titleEl.textContent
            .replace(/\s+/g, " ")
            .trim();
          const normalizedSchemaLabel = field.label
            .replace(/\s+/g, " ")
            .trim();

          if (normalizedDOMTitle.includes(normalizedSchemaLabel)) {
            targetQuestionEl = q;
            break;
          }
        }
      }

      if (!targetQuestionEl) {
        console.warn(
          `[Robot] Elemen pertanyaan "${field.label}" tidak ditemukan`,
        );
        continue;
      }

      let optionFound = false;

      // ===== ENUM-SELECT (dropdown) =====
      if (field.type === "enum-select") {
        const dropdownEl = targetQuestionEl.querySelector(".sd-dropdown");
        if (dropdownEl) {
          dropdownEl.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true }),
          );
          dropdownEl.click();
          await new Promise((r) => setTimeout(r, 200));

          const normalizedSchemaText = valueToFill
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

          const listContainer =
            targetQuestionEl.querySelector(".sv-list__container") ||
            document.body.querySelector(".sv-list__container");

          if (listContainer) {
            const items = listContainer.querySelectorAll(
              ".sv-list__item, [role='option'], .sd-list__item",
            );

            for (const item of items) {
              const normalizedItemText = item.textContent
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

              if (
                normalizedItemText === normalizedSchemaText ||
                normalizedItemText.includes(normalizedSchemaText)
              ) {
                item.dispatchEvent(
                  new MouseEvent("mousedown", { bubbles: true }),
                );
                item.click();
                console.log(
                  `[Robot] Dropdown "${valueToFill}" untuk "${field.label}"`,
                );
                optionFound = true;
                break;
              }
            }

            if (!optionFound) {
              console.warn(
                `[Robot] Opsi "${valueToFill}" tidak ditemukan di dropdown`,
              );
              document.body.click();
            }
          }
        }
      }

      // ===== TEXT / NUMBER =====
      else if (field.type === "text" || field.type === "number") {
        const inputEl = targetQuestionEl.querySelector(
          "input.sd-input, textarea.sd-input",
        );
        if (inputEl) {
          forceInput(inputEl, valueToFill);
          await new Promise((r) => setTimeout(r, 100));
          console.log(
            `[Robot] Isi "${field.label}" = "${valueToFill}"`,
          );
          optionFound = true;
        }
      }

      // ===== ENUM (radio) =====
      else {
        const radioItems = targetQuestionEl.querySelectorAll(".sd-item");

        for (const item of radioItems) {
          const labelTextEl = item.querySelector(
            ".sd-item__control-label .sv-string-viewer",
          );

          if (labelTextEl) {
            const normalizedDOMText = labelTextEl.textContent
              .replace(/\s+/g, " ")
              .trim();
            const normalizedSchemaText = valueToFill
              .replace(/\s+/g, " ")
              .trim();

            if (normalizedDOMText === normalizedSchemaText) {
              const radioInput = item.querySelector("input[type='radio']");
              if (radioInput) {
                radioInput.click();
                radioInput.dispatchEvent(
                  new Event("change", { bubbles: true }),
                );
                console.log(
                  `[Robot] Radio "${valueToFill}" untuk "${field.label}"`,
                );
                optionFound = true;
              }
              break;
            }
          }
        }
      }

      if (!optionFound) {
        console.warn(
          `[Robot] Opsi "${valueToFill}" tidak ditemukan pada "${field.label}"`,
        );
      }

      await new Promise((r) => setTimeout(r, 300));
    }
  }

  // ===== Retry submit sampai validasi lolos =====
  let hasValidationError = true;
  const MAX_RETRY = 4;

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    console.log(`[Robot] Isi form (percobaan ${attempt}/${MAX_RETRY})...`);
    await fillQuestion();
    await new Promise((r) => setTimeout(r, 500));

    // Cari tombol submit
    const buttons = document.querySelectorAll(
      "button, input[type='button']",
    );
    let submitButton = null;
    for (const btn of buttons) {
      const btnText = (btn.textContent || btn.value || "").trim();
      if (
        btnText.includes("Simpan") ||
        btnText.includes("Selesai") ||
        btnText.includes("Kirim") ||
        btn.classList.contains("sd-navigation__complete-btn")
      ) {
        submitButton = btn;
        break;
      }
    }

    if (!submitButton) {
      console.error("[Robot] Tombol submit tidak ditemukan");
      return;
    }

    // Kirim sinyal ke background: 1 form selesai
    if (attempt === 1) {
      try {
        chrome.runtime.sendMessage({ type: "FORM_SUBMIT_SUCCESS" });
      } catch (e) {
        console.warn("[Robot] Gagal kirim FORM_SUBMIT_SUCCESS:", e);
      }
    }

    submitButton.click();
    await new Promise((r) => setTimeout(r, 1500));

    hasValidationError =
      document.querySelector(".sd-question--error") !== null;

    if (!hasValidationError) {
      console.log("[Robot] ✅ Form berhasil dikirim");
      break;
    }

    console.warn(`[Robot] Validasi gagal, coba lagi...`);
  }

  if (hasValidationError) {
    console.error("[Robot] Gagal setelah beberapa percobaan");
    const homeButton = [...document.querySelectorAll("button")].find(
      (btn) => btn.textContent?.trim() === "Kembali ke Halaman Utama",
    );
    homeButton?.click();
  }
}