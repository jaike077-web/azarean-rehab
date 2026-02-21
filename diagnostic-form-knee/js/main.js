const form = document.getElementById("diagnosticForm");
const validationMessage = document.getElementById("validationMessage");

const conditionalRules = [
  {
    trigger: "imaging",
    type: "radio",
    value: "Есть",
    target: "imaging_details",
  },
  {
    trigger: "scars",
    type: "radio",
    value: "Есть",
    target: "scars_details",
  },
  {
    trigger: "edema",
    type: "select",
    notValue: "Нет",
    target: "edema_location",
  },
  {
    trigger: "leg_length_diff",
    type: "radio",
    value: "Есть",
    target: "leg_length_diff_value",
  },
  {
    trigger: "duration",
    type: "select",
    value: "Другое",
    target: "duration_other",
  },
  {
    trigger: "daily_activity",
    type: "select",
    value: "Другое",
    target: "daily_activity_other",
  },
  {
    trigger: "romberg",
    type: "select",
    value: "Другое",
    target: "romberg_other",
  },
  {
    trigger: "recommended_program",
    type: "select",
    value: "Другое",
    target: "recommended_program_other",
  },
];

const rangeInputs = Array.from(document.querySelectorAll("input[type='range']"));
const accentButtons = Array.from(document.querySelectorAll(".accent-swatch"));

const updateRange = (input) => {
  const value = Number(input.value);
  const label = document.querySelector(`[data-range-value='${input.id}']`);
  if (label) {
    label.textContent = value;
  }
  input.style.background = `linear-gradient(90deg, #16a34a 0%, #facc15 50%, #dc2626 100%)`;
};

const updateConditionalFields = () => {
  conditionalRules.forEach((rule) => {
    const target = document.getElementById(rule.target);
    if (!target) {
      return;
    }
    let shouldShow = false;
    if (rule.type === "radio") {
      const selected = form.querySelector(`input[name='${rule.trigger}']:checked`);
      shouldShow = selected?.value === rule.value;
    } else if (rule.type === "select") {
      const select = document.getElementById(rule.trigger);
      if (rule.notValue) {
        shouldShow = select?.value && select.value !== rule.notValue;
      } else {
        shouldShow = select?.value === rule.value;
      }
    }
    target.classList.toggle("is-visible", Boolean(shouldShow));
  });

  const toggles = form.querySelectorAll("input[data-toggle-text]");
  toggles.forEach((toggle) => {
    const targetId = toggle.getAttribute("data-toggle-text");
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }
    target.classList.toggle("is-visible", toggle.checked);
  });
};

const setupAccordion = () => {
  document.querySelectorAll(".accordion").forEach((accordion, index) => {
    const header = accordion.querySelector(".accordion-header");
    const body = accordion.querySelector(".accordion-body");
    if (index === 0) {
      header.setAttribute("aria-expanded", "true");
      body.classList.add("is-open");
    }
    header.addEventListener("click", () => {
      const isOpen = header.getAttribute("aria-expanded") === "true";
      header.setAttribute("aria-expanded", String(!isOpen));
      body.classList.toggle("is-open", !isOpen);
    });
  });
};

const updateBlockStatuses = () => {
  document.querySelectorAll(".accordion[data-required]").forEach((accordion) => {
    const required = accordion.dataset.required
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const allValid = required.every((id) => {
      if (id === "localization") {
        return Array.from(form.querySelectorAll("input[name='localization']")).some(
          (input) => input.checked
        );
      }
      const field = form.querySelector(`#${id}`);
      if (!field) {
        return true;
      }
      const value = field.value?.trim();
      return value || value === "0";
    });

    const status = accordion.querySelector(".block-status");
    if (status) {
      status.classList.toggle("is-complete", allValid);
    }
  });
};

const autoResizeTextarea = (textarea) => {
  textarea.style.height = "auto";
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  const maxHeight = lineHeight * 10 + 20;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
};

const applyStoredData = (data) => {
  if (!data) {
    return;
  }

  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) {
      return;
    }
    if (field instanceof RadioNodeList || Array.isArray(value)) {
      const inputs = form.querySelectorAll(`[name='${key}']`);
      inputs.forEach((input) => {
        if (Array.isArray(value)) {
          input.checked = value.includes(input.value);
        } else if (input.type === "radio") {
          input.checked = input.value === value;
        }
      });
    } else {
      field.value = value;
    }
  });

  updateConditionalFields();
  updateBlockStatuses();
  rangeInputs.forEach((input) => updateRange(input));
};

const handleGenerate = async () => {
  const errors = Validation.validate(form);
  updateBlockStatuses();
  if (errors.length) {
    validationMessage.textContent = "Заполните обязательные поля перед генерацией отчёта.";
    const firstError = errors[0].field || form.querySelector(`#${errors[0].id}`);
    if (firstError) {
      firstError.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }
  validationMessage.textContent = "";
  await PdfGenerator.generate(form);
};

const handleClear = () => {
  const confirmClear = window.confirm("Очистить форму? Все данные будут удалены.");
  if (!confirmClear) {
    return;
  }
  form.reset();
  StorageManager.clear();
  setToday();
  updateConditionalFields();
  updateBlockStatuses();
  rangeInputs.forEach((input) => updateRange(input));
};

const setToday = () => {
  const today = new Date().toISOString().split("T")[0];
  const diagnosisDate = document.getElementById("diagnosis_date");
  if (diagnosisDate) {
    diagnosisDate.value = today;
  }
};

const setAccent = (accent) => {
  const accentMap = {
    blue: "#2563eb",
    teal: "#0d9488",
    green: "#059669",
  };
  const value = accentMap[accent] || accentMap.blue;
  document.documentElement.style.setProperty("--accent", value);
  document.documentElement.style.setProperty("--accent-soft", `${value}1f`);
};

setupAccordion();
setToday();
updateConditionalFields();
updateBlockStatuses();

rangeInputs.forEach((input) => {
  updateRange(input);
  input.addEventListener("input", () => updateRange(input));
});

form.addEventListener("input", () => {
  updateConditionalFields();
  updateBlockStatuses();
});

form.addEventListener("change", () => {
  updateConditionalFields();
  updateBlockStatuses();
});

form.querySelectorAll("textarea").forEach((textarea) => {
  autoResizeTextarea(textarea);
  textarea.addEventListener("input", () => autoResizeTextarea(textarea));
});

accentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    accentButtons.forEach((btn) => btn.classList.remove("is-active"));
    button.classList.add("is-active");
    setAccent(button.dataset.accent);
  });
});

const storedData = StorageManager.load();
if (storedData) {
  const shouldRestore = window.confirm("Найдено сохранённое обследование. Восстановить данные?");
  if (shouldRestore) {
    applyStoredData(storedData);
  } else {
    StorageManager.clear();
  }
}

setInterval(() => {
  StorageManager.save(form);
}, 30000);

const generateButton = document.getElementById("generatePdf");
const clearButton = document.getElementById("clearForm");

generateButton.addEventListener("click", handleGenerate);
clearButton.addEventListener("click", handleClear);
