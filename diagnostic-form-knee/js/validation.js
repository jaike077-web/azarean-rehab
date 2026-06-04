const Validation = {
  requiredFields: [
    "patient_name",
    "patient_dob",
    "diagnosis_date",
    "main_complaint",
    "vas_rest",
    "vas_load",
    "patient_goal",
    "hypothesis",
    "main_findings",
    "recommendations",
  ],
  requiredCheckboxGroups: ["localization"],
  validate(form) {
    const errors = [];
    this.clearErrors(form);

    this.requiredFields.forEach((id) => {
      const field = form.querySelector(`#${id}`);
      if (!field) {
        return;
      }
      const value = field.value?.trim();
      if (!value && value !== "0") {
        errors.push({ field, id });
        field.classList.add("field-error");
      }
    });

    this.requiredCheckboxGroups.forEach((name) => {
      const group = form.querySelectorAll(`input[name='${name}']`);
      const isChecked = Array.from(group).some((input) => input.checked);
      if (!isChecked) {
        const wrapper = form.querySelector(`[data-required-group='${name}']`);
        if (wrapper) {
          wrapper.classList.add("field-error");
        }
        errors.push({ field: wrapper, id: name });
      }
    });

    return errors;
  },
  clearErrors(form) {
    form.querySelectorAll(".field-error").forEach((el) => {
      el.classList.remove("field-error");
    });
  },
};
