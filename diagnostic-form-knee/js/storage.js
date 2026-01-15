const STORAGE_KEY = "azarean_diagnostic_form_knee";

const StorageManager = {
  save(form) {
    const data = {};
    const formData = new FormData(form);

    for (const [key, value] of formData.entries()) {
      if (data[key]) {
        if (Array.isArray(data[key])) {
          data[key].push(value);
        } else {
          data[key] = [data[key], value];
        }
      } else {
        data[key] = value;
      }
    }

    const checkboxGroups = form.querySelectorAll("input[type='checkbox']");
    checkboxGroups.forEach((checkbox) => {
      if (!data[checkbox.name]) {
        data[checkbox.name] = [];
      }
      if (checkbox.checked) {
        data[checkbox.name].push(checkbox.value);
      }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
