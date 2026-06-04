const PdfGenerator = {
  async generate(form) {
    const data = this.collectData(form);
    const reportElement = this.buildReport(data);

    const container = document.getElementById("reportContainer");
    container.innerHTML = "";
    container.appendChild(reportElement);
    container.classList.add("is-visible");
    container.style.cssText = "position: fixed; left: -9999px; top: 0; width: 794px;";

    const canvas = await html2canvas(reportElement, { scale: 2, backgroundColor: "#ffffff" });
    container.classList.remove("is-visible");
    container.innerHTML = "";

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = { top: 20, bottom: 20, left: 14, right: 14 };

    const imgWidth = pageWidth - margin.left - margin.right;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    const availableHeight = pageHeight - margin.top - margin.bottom;
    const totalPages = Math.ceil(imgHeight / availableHeight);

    let position = 0;

    for (let page = 1; page <= totalPages; page += 1) {
      if (page > 1) {
        pdf.addPage();
      }
      pdf.addImage(imgData, "PNG", margin.left, margin.top - position, imgWidth, imgHeight);
      this.drawHeaderFooter(pdf, page, totalPages, margin, pageWidth, pageHeight, data);
      position += availableHeight;
    }

    pdf.save(`diagnostic-report-${data.patientName || "patient"}.pdf`);
  },
  drawHeaderFooter(pdf, page, totalPages, margin, pageWidth, pageHeight, data) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("AZAREAN NETWORK", margin.left, 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text("Студия физической реабилитации", margin.left, 15);

    pdf.setFontSize(8);
    const footerText = "Azarean Network | Екатеринбург | Тел: +7 (XXX) XXX-XX-XX | azarean.ru";
    pdf.text(footerText, margin.left, pageHeight - 8);
    pdf.text(`Страница ${page} из ${totalPages}`, pageWidth - margin.right - 35, pageHeight - 8);

    if (page === 1) {
      pdf.setFontSize(9);
      pdf.text(`Дата обследования: ${data.diagnosisDate || "—"}`, pageWidth - 80, 10);
      pdf.text(`Пациент: ${data.patientName || "—"}`, pageWidth - 80, 15);
    }
  },
  collectData(form) {
    const getValue = (id) => {
      const field = form.querySelector(`#${id}`);
      if (!field) {
        return "";
      }
      return field.value.trim();
    };

    const getRadio = (name) => {
      const selected = form.querySelector(`input[name='${name}']:checked`);
      return selected ? selected.value : "";
    };

    const getCheckboxes = (name, otherId) => {
      const values = Array.from(form.querySelectorAll(`input[name='${name}']:checked`)).map(
        (input) => input.value
      );
      if (otherId && values.includes("Другое")) {
        const otherValue = getValue(otherId);
        if (otherValue) {
          return values.map((value) => (value === "Другое" ? `Другое: ${otherValue}` : value));
        }
      }
      return values;
    };

    const getSelectWithOther = (id, otherId) => {
      const value = getValue(id);
      if (value === "Другое") {
        const otherValue = getValue(otherId);
        return otherValue ? `Другое: ${otherValue}` : "";
      }
      return value;
    };

    return {
      patientName: getValue("patient_name"),
      patientDob: getValue("patient_dob"),
      diagnosisDate: getValue("diagnosis_date"),
      mainComplaint: getValue("main_complaint"),
      localization: getCheckboxes("localization"),
      vasRest: getValue("vas_rest"),
      vasLoad: getValue("vas_load"),
      duration: getSelectWithOther("duration", "duration_other"),
      worseWhen: getCheckboxes("worse_when", "worse_when_other"),
      betterWhen: getCheckboxes("better_when", "better_when_other"),
      previousTreatment: getCheckboxes("previous_treatment", "previous_treatment_other"),
      doctors: getCheckboxes("doctors", "doctors_other"),
      diagnosis: getValue("diagnosis"),
      imaging: getRadio("imaging"),
      imagingDetails: getValue("imaging_details"),
      dailyActivity: getSelectWithOther("daily_activity", "daily_activity_other"),
      sportActivity: getValue("sport_activity"),
      patientGoal: getValue("patient_goal"),
      scars: getRadio("scars"),
      scarsDetails: getValue("scars_details"),
      edema: getValue("edema"),
      edemaLocation: getValue("edema_location"),
      temperature: getValue("temperature"),
      legLengthDiff: getRadio("leg_length_diff"),
      legLengthDiffValue: getValue("leg_length_diff_value"),
      thighAbovePatellaR: getValue("thigh_above_patella_r"),
      thighAbovePatellaL: getValue("thigh_above_patella_l"),
      thigh15cmR: getValue("thigh_15cm_r"),
      thigh15cmL: getValue("thigh_15cm_l"),
      calfR: getValue("calf_r"),
      calfL: getValue("calf_l"),
      palpationPain: getValue("palpation_pain"),
      palpationTone: getValue("palpation_tone"),
      statics: getValue("statics"),
      gait: getCheckboxes("gait", "gait_other"),
      romberg: getSelectWithOther("romberg", "romberg_other"),
      forwardBend: getValue("forward_bend"),
      stepTest: getValue("step_test"),
      movementPatterns: getValue("movement_patterns"),
      romKnee: getValue("rom_knee"),
      romHip: getValue("rom_hip"),
      romAnkle: getValue("rom_ankle"),
      mmtComment: getValue("mmt_comment"),
      orthoOther: getValue("ortho_other"),
      neuroTests: getValue("neuro_tests"),
      functionalExercises: getValue("functional_exercises"),
      functionalObservations: getValue("functional_observations"),
      vasBefore: getValue("vas_before"),
      vasDuring: getValue("vas_during"),
      vasAfter: getValue("vas_after"),
      romBefore: getValue("rom_before"),
      romAfter: getValue("rom_after"),
      wellbeingBefore: getValue("wellbeing_before"),
      wellbeingAfter: getValue("wellbeing_after"),
      hypothesis: getValue("hypothesis"),
      mainFindings: getValue("main_findings"),
      recommendations: getValue("recommendations"),
      workPlan: getValue("work_plan"),
      recommendedProgram: getSelectWithOther("recommended_program", "recommended_program_other"),
      mmtTable: this.collectTable(form, [
        { label: "Квадрицепс", right: "mmt_quad_r", left: "mmt_quad_l" },
        { label: "Хамстринги", right: "mmt_ham_r", left: "mmt_ham_l" },
        { label: "Аддукторы", right: "mmt_add_r", left: "mmt_add_l" },
        { label: "Абдукторы", right: "mmt_abd_r", left: "mmt_abd_l" },
        { label: "Икроножная", right: "mmt_calf_r", left: "mmt_calf_l" },
      ]),
      orthoTables: this.collectOrthoTables(form),
    };
  },
  collectTable(form, rows) {
    return rows
      .map((row) => {
        const rightValue = form.querySelector(`#${row.right}`)?.value || "";
        const leftValue = form.querySelector(`#${row.left}`)?.value || "";
        const cleanedRight = rightValue === "Не тестировалось" ? "" : rightValue;
        const cleanedLeft = leftValue === "Не тестировалось" ? "" : leftValue;
        if (!cleanedRight && !cleanedLeft) {
          return null;
        }
        return { label: row.label, right: cleanedRight || "—", left: cleanedLeft || "—" };
      })
      .filter(Boolean);
  },
  collectOrthoTables(form) {
    const groups = [
      {
        title: "Тесты ПКС",
        rows: [
          { label: "Lachman", right: "lachman_r", left: "lachman_l" },
          { label: "Передний выдвижной ящик", right: "ant_drawer_r", left: "ant_drawer_l" },
          { label: "Pivot shift", right: "pivot_shift_r", left: "pivot_shift_l" },
        ],
      },
      {
        title: "Тесты ЗКС",
        rows: [{ label: "Задний выдвижной ящик", right: "post_drawer_r", left: "post_drawer_l" }],
      },
      {
        title: "Тесты коллатеральных связок",
        rows: [
          { label: "Valgus stress 0°", right: "valgus_0_r", left: "valgus_0_l" },
          { label: "Valgus stress 30°", right: "valgus_30_r", left: "valgus_30_l" },
          { label: "Varus stress 0°", right: "varus_0_r", left: "varus_0_l" },
          { label: "Varus stress 30°", right: "varus_30_r", left: "varus_30_l" },
        ],
      },
      {
        title: "Тесты менисков",
        rows: [
          { label: "McMurray", right: "mcmurray_r", left: "mcmurray_l" },
          { label: "Thessaly", right: "thessaly_r", left: "thessaly_l" },
          { label: "Apley compression", right: "apley_comp_r", left: "apley_comp_l" },
          { label: "Apley distraction", right: "apley_dist_r", left: "apley_dist_l" },
        ],
      },
      {
        title: "Тесты пателлофеморального сустава",
        rows: [
          { label: "Patella grind (Clarke's)", right: "patella_grind_r", left: "patella_grind_l" },
          { label: "Patella apprehension", right: "patella_appr_r", left: "patella_appr_l" },
        ],
      },
    ];

    return groups
      .map((group) => ({
        title: group.title,
        rows: this.collectTable(form, group.rows),
      }))
      .filter((group) => group.rows.length > 0);
  },
  buildReport(data) {
    const report = document.createElement("div");
    report.className = "report-sheet";

    const header = document.createElement("div");
    header.className = "report-header";
    header.innerHTML = `
      <div>
        <h2>Отчёт о диагностическом обследовании</h2>
        <p>Регион: Коленный сустав</p>
      </div>
      <div>
        <p>Пациент: ${data.patientName || "—"}</p>
        <p>Дата рождения: ${data.patientDob || "—"}</p>
        <p>Дата обследования: ${data.diagnosisDate || "—"}</p>
      </div>
    `;
    report.appendChild(header);

    const sections = [];

    sections.push(this.createSection("Субъективное обследование", [
      this.row("Основная жалоба", data.mainComplaint),
      this.row("Локализация", data.localization.join(", ")),
      this.createVasRow("VAS в покое", data.vasRest),
      this.createVasRow("VAS при нагрузке", data.vasLoad),
      this.row("Длительность проблемы", data.duration),
      this.row("Когда хуже", data.worseWhen.join(", ")),
      this.row("Когда легче", data.betterWhen.join(", ")),
      this.row("Предыдущее лечение", data.previousTreatment.join(", ")),
      this.row("Консультации врачей", data.doctors.join(", ")),
      this.row("Диагноз", data.diagnosis),
      this.row("МРТ / Рентген", data.imaging === "Есть" ? "Есть" : "Нет"),
      this.row("Дата и заключение", data.imaging === "Есть" ? data.imagingDetails : ""),
      this.row("Бытовая активность", data.dailyActivity),
      this.row("Спортивная активность", data.sportActivity),
      this.row("Цель пациента", data.patientGoal),
    ]));

    sections.push(this.createSection("Визуальный осмотр", [
      this.row("Рубцы", data.scars === "Есть" ? "Есть" : "Нет"),
      this.row("Локализация рубцов", data.scars === "Есть" ? data.scarsDetails : ""),
      this.row("Отёк", data.edema),
      this.row("Локализация отёка", data.edema !== "Нет" ? data.edemaLocation : ""),
      this.row("Изменение температуры", data.temperature),
      this.row("Разница длины н/к", data.legLengthDiff === "Есть" ? `${data.legLengthDiffValue} см` : "Нет"),
      this.row("Обхват бедра над надколенником — Правое", this.withUnit(data.thighAbovePatellaR)),
      this.row("Обхват бедра над надколенником — Левое", this.withUnit(data.thighAbovePatellaL)),
      this.row("Обхват бедра 15 см выше надколенника — Правое", this.withUnit(data.thigh15cmR)),
      this.row("Обхват бедра 15 см выше надколенника — Левое", this.withUnit(data.thigh15cmL)),
      this.row("Обхват голени — Правое", this.withUnit(data.calfR)),
      this.row("Обхват голени — Левое", this.withUnit(data.calfL)),
      this.row("Пальпация — болезненность", data.palpationPain),
      this.row("Пальпация — тонус", data.palpationTone),
    ]));

    sections.push(this.createSection("Постуральная оценка и базовые тесты", [
      this.row("Статика", data.statics),
      this.row("Походка", data.gait.join(", ")),
      this.row("Проба Ромберга", data.romberg),
      this.row("Наклон вперёд", data.forwardBend),
      this.row("Step up / Step down", data.stepTest),
      this.row("Паттерны движения", data.movementPatterns),
    ]));

    sections.push(this.createSection("ROM", [
      this.row("ROM коленного сустава", data.romKnee),
      this.row("ROM тазобедренного сустава", data.romHip),
      this.row("ROM голеностопного сустава", data.romAnkle),
    ]));

    const mmtSection = this.createSection("ММТ коленного сустава", [], true);
    if (data.mmtTable.length) {
      mmtSection.appendChild(this.createTable(data.mmtTable));
    }
    if (data.mmtComment) {
      mmtSection.appendChild(this.createItem("Комментарий", data.mmtComment));
    }
    sections.push(mmtSection);

    const orthoSection = this.createSection("Ортопедические тесты", [], true);
    data.orthoTables.forEach((group) => {
      const groupTitle = document.createElement("p");
      groupTitle.className = "report-item";
      groupTitle.textContent = group.title;
      orthoSection.appendChild(groupTitle);
      orthoSection.appendChild(this.createTable(group.rows));
    });
    if (data.orthoOther) {
      orthoSection.appendChild(this.createItem("Другие тесты", data.orthoOther));
    }
    sections.push(orthoSection);

    sections.push(this.createSection("Неврологические тесты", [this.row("Неврологические тесты", data.neuroTests)]));

    sections.push(this.createSection("Функциональное тестирование", [
      this.row("Выполненные упражнения/тесты", data.functionalExercises),
      this.row("Наблюдения", data.functionalObservations),
    ]));

    sections.push(this.createSection("Динамика во время занятия", [
      this.createVasRow("VAS до", data.vasBefore),
      this.createVasRow("VAS в процессе", data.vasDuring),
      this.createVasRow("VAS после", data.vasAfter),
      this.row("ROM до", data.romBefore),
      this.row("ROM после", data.romAfter),
      this.row("Самочувствие до", data.wellbeingBefore),
      this.row("Самочувствие после", data.wellbeingAfter),
    ]));

    const conclusion = document.createElement("div");
    conclusion.className = "report-section report-conclusion";
    conclusion.innerHTML = `
      <h3>Заключение</h3>
      ${this.createItemHTML("Рабочая гипотеза", data.hypothesis)}
      ${this.createItemHTML("Основные находки", data.mainFindings)}
      ${this.createItemHTML("Рекомендации", data.recommendations)}
      ${this.createItemHTML("План работы", data.workPlan)}
      ${this.createItemHTML("Рекомендуемая программа", data.recommendedProgram)}
    `;

    sections.forEach((section) => {
      if (section) {
        report.appendChild(section);
      }
    });

    report.appendChild(conclusion);

    const footer = document.createElement("div");
    footer.className = "report-footer";
    footer.textContent = "Azarean Network · Студия физической реабилитации · Екатеринбург · [Добавить актуальный телефон и сайт]";
    report.appendChild(footer);

    return report;
  },
  createSection(title, rows, allowEmpty = false) {
    const filteredRows = rows.filter((row) => row && row.value);
    if (!filteredRows.length && !allowEmpty) {
      return null;
    }

    const section = document.createElement("div");
    section.className = "report-section";
    section.innerHTML = `<h3>${title}</h3>`;
    filteredRows.forEach((row) => {
      if (row.isVas) {
        section.appendChild(this.createVasItem(row.label, row.value, row.raw));
      } else {
        section.appendChild(this.createItem(row.label, row.value));
      }
    });
    return section;
  },
  createItem(label, value) {
    const item = document.createElement("p");
    item.className = "report-item";
    item.innerHTML = `<strong>${label}:</strong> ${value}`;
    return item;
  },
  createVasItem(label, value, rawValue) {
    const item = document.createElement("div");
    item.innerHTML = `\n      <p class=\"report-item\"><strong>${label}:</strong> ${value}</p>\n      <div class=\"vas-scale\">\n        <div class=\"vas-indicator\" style=\"width: ${(Number(rawValue) / 10) * 100}%;\"></div>\n      </div>\n    `;\n    return item;
  },
  createItemHTML(label, value) {
    if (!value) {
      return "";
    }
    return `<p class="report-item"><strong>${label}:</strong> ${value}</p>`;
  },
  row(label, value) {
    if (!value && value !== "0") {
      return null;
    }
    return { label, value };
  },
  createVasRow(label, value) {
    if (value === "" || value === null || typeof value === "undefined") {
      return null;
    }
    return { label, value: this.vasLabel(value), isVas: true, raw: value };
  },
  createTable(rows) {
    const table = document.createElement("table");
    table.className = "report-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Тест</th>
          <th>Правое</th>
          <th>Левое</th>
        </tr>
      </thead>
    `;
    const body = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.label}</td>
        <td>${row.right}</td>
        <td>${row.left}</td>
      `;
      body.appendChild(tr);
    });
    table.appendChild(body);
    return table;
  },
  vasLabel(value) {
    if (value === "" || value === null || typeof value === "undefined") {
      return "";
    }
    return `${value}/10`;
  },
  withUnit(value) {
    return value ? `${value} см` : "";
  },
};
