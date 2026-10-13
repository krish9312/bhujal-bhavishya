import { breakSeriesGaps, classifyStage, criticalYearStatusKey, linearRegression, predictYearForDepth, stageOfExtraction, trendMessageKey, yearsToThreshold } from "./model.js";
import { getDistricts, getWells, getWellSeries } from "./dataSource.js";
import { translate } from "./i18n.js";

const languageSelect = document.querySelector("#language-select");
const districtSelect = document.querySelector("#district-select");
const growthSlider = document.querySelector("#growth-slider");
const dataError = document.querySelector("#data-error");
let language = readStorage("language") === "gu" ? "gu" : "en";
let districts = [];
let wells = [];
let wellsError = null;
let selectedDistrict = null;
let selectedWell = null;
let wellSeries = [];
let wellChart;
let wellRequestId = 0;
let chart;
let sortKey = "stage";
let sortDirection = -1;

function readStorage(key) {
  try {
    return localStorage.getItem(`bhujal-${key}`);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(`bhujal-${key}`, value);
  } catch {
    return;
  }
}

const text = (key) => translate(language, key);
const locale = () => language === "gu" ? "gu-IN" : "en-IN";

function formatNumber(value, digits = 2, useGrouping = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return text("noData");
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits, useGrouping }).format(Number(value));
}

function districtName(district) {
  return language === "gu" ? district.name_gu : district.district;
}

function stageFor(district) {
  return stageOfExtraction(district.extraction, district.extractableResource);
}

function wellMetadataText(value, translations) {
  if (value === null || value === undefined || value === "") return text(translations.missing);
  return text(translations[value] ?? value);
}

function formatWellNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return text("notAvailable");
  const number = Number(value);
  return Number.isFinite(number) ? formatNumber(number, digits) : text("notAvailable");
}

function renderWellLimitations(well) {
  const keys = ["limitationOneWell"];
  if (well.well_type === "Tube Well" || /Pz/i.test(well.label ?? "")) keys.push("limitationRecharge");
  keys.push("limitationDataEnd", "limitationAnnualMedian", "limitationCriticalAssumption", "limitationForecast", "limitationWeakFit");
  document.querySelector("#well-limitations-list").replaceChildren(...keys.map((key) => {
    const item = document.createElement("li");
    item.dataset.i18n = key;
    item.textContent = text(key);
    return item;
  }));
}

function setWellError(error) {
  console.error(error);
  const errorElement = document.querySelector("#well-error");
  errorElement.dataset.i18n = "wellDataNotLoaded";
  errorElement.textContent = text("wellDataNotLoaded");
  errorElement.hidden = false;
  document.querySelector("#well-status").hidden = true;
  document.querySelector("#well-missing").hidden = true;
  document.querySelector("#well-content").hidden = true;
  document.querySelector("#well-chart").hidden = true;
  document.querySelector("#well-chart-fallback").hidden = true;
  wellChart?.destroy();
  wellChart = undefined;
}

function renderWellAnalysis() {
  if (!selectedWell) return;
  document.querySelector("#well-type").textContent = wellMetadataText(selectedWell.well_type, {
    "Dug Well": "wellTypeDug", "Tube Well": "wellTypeTube", Piezometer: "wellTypePiezometer", missing: "noData"
  });
  document.querySelector("#well-aquifer").textContent = wellMetadataText(selectedWell.well_aquifer_type, {
    Unconfined: "aquiferUnconfined", Confined: "aquiferConfined", "Semi-confined": "aquiferSemiConfined", missing: "aquiferNotRecorded"
  });
  const wellDepth = selectedWell.well_depth === null || selectedWell.well_depth === ""
    ? Number.NaN
    : Number(selectedWell.well_depth);
  document.querySelector("#well-depth").textContent = Number.isFinite(wellDepth) ? `${formatWellNumber(selectedWell.well_depth)} ${text("meterAbbreviation")}` : text("notAvailable");
  const points = wellSeries;
  const startYear = Number(document.querySelector("#trend-start-year").value);
  const criticalDepth = document.querySelector("#critical-depth").valueAsNumber;
  const validPointCount = points.filter(({ year, depth }) => Number.isFinite(year) && year >= startYear && Number.isFinite(depth)).length;
  const regression = linearRegression(points, startYear) ?? { slope: null, intercept: null, r2: null, n: validPointCount };
  const usedPoints = points.filter(({ year, depth }) => year >= startYear && Number.isFinite(depth));
  const latest = points.at(-1);
  const messages = [];
  const slopeValue = document.querySelector("#trend-slope");
  const r2Value = document.querySelector("#trend-r2");
  const criticalYearValue = document.querySelector("#critical-year");
  const hasCriticalDepth = Number.isFinite(criticalDepth) && criticalDepth >= 0;
  const enoughData = regression.n >= 5;

  slopeValue.textContent = regression.slope === null ? text("noData") : `${regression.slope > 0 ? "+" : ""}${formatNumber(regression.slope, 2)} ${text("meterPerYear")}`;
  r2Value.textContent = regression.r2 === null ? text("noData") : formatNumber(regression.r2, 2);
  const criticalYearDetail = document.querySelector("#critical-year-detail");
  criticalYearValue.textContent = criticalYearStatusKey(regression.slope, false)
    ? text(criticalYearStatusKey(regression.slope, false))
    : "—";
  criticalYearDetail.textContent = "";
  document.querySelector("#critical-depth").placeholder = text("criticalDepthPlaceholder");
  document.querySelector("#well-trend-range").textContent = usedPoints.length
    ? text("trendRange").replace("{start}", String(usedPoints[0].year)).replace("{end}", String(usedPoints.at(-1).year)).replace("{n}", String(regression.n))
    : text("notEnoughTrendData");

  if (!hasCriticalDepth) messages.push(text("invalidCriticalDepth"));
  if (!enoughData) messages.push(text("notEnoughTrendData"));
  const slopeMessage = trendMessageKey(regression.slope);
  if (slopeMessage) messages.push(text(slopeMessage));
  if (regression.r2 !== null && regression.r2 < 0.3) messages.push(text("weakFit"));
  const alreadyReached = hasCriticalDepth && latest && latest.depth > criticalDepth;
  if (alreadyReached) {
    messages.push(`${text("criticalDepthReached")} ${text("raiseCriticalDepthHint")}`);
    criticalYearValue.textContent = text("alreadyReachedYear");
    const firstObservedYear = wellSeries.find(({ depth }) => depth > criticalDepth)?.year;
    if (firstObservedYear !== undefined) {
      criticalYearDetail.textContent = text("firstObservedBeyondDepth").replace("{year}", String(firstObservedYear));
    }
  } else {
    const statusKey = criticalYearStatusKey(regression.slope, false);
    criticalYearValue.textContent = statusKey ? text(statusKey) : "—";
  }
  if (hasCriticalDepth && enoughData && regression.slope > 0 && !alreadyReached) {
    const predictedYear = predictYearForDepth(regression.slope, regression.intercept, criticalDepth);
    if (predictedYear !== null) {
      criticalYearValue.textContent = text("aroundYear").replace("{year}", String(Math.round(predictedYear)));
    }
  }

  document.querySelector("#well-messages").replaceChildren(...messages.map((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    return item;
  }));
  renderWellChart(regression, startYear, criticalDepth, hasCriticalDepth);
}

function renderWellChart(regression, startYear, criticalDepth, hasCriticalDepth) {
  const canvas = document.querySelector("#well-chart");
  const fallback = document.querySelector("#well-chart-fallback");
  if (!wellSeries.length) {
    canvas.hidden = true;
    fallback.hidden = true;
    wellChart?.destroy();
    wellChart = undefined;
    return;
  }
  if (typeof Chart === "undefined") {
    canvas.hidden = true;
    fallback.hidden = false;
    return;
  }
  canvas.hidden = false;
  fallback.hidden = true;
  wellChart?.destroy();

  const selectedPoints = wellSeries.filter((point) => point.year >= startYear);
  const latestUsedYear = selectedPoints.at(-1)?.year ?? startYear;
  const latestObservedYear = wellSeries.at(-1)?.year ?? startYear;
  const observedPoints = breakSeriesGaps(wellSeries);
  const data = [{
    label: text("observedDepth"),
    data: observedPoints.map(({ year, depth, n }) => ({ x: year, y: depth, n })),
    spanGaps: false,
    showLine: true,
    borderColor: "#23799a",
    backgroundColor: observedPoints.map(({ n }) => n === 1 ? "transparent" : "#23799a"),
    pointBackgroundColor: observedPoints.map(({ n }) => n === 1 ? "#ffffff" : "#23799a"),
    pointBorderColor: "#23799a",
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0
  }];

  let maxYear = latestObservedYear;
  if (regression.n >= 5 && regression.slope !== null && selectedPoints.length) {
    const crossingYear = hasCriticalDepth && regression.slope > 0
      ? predictYearForDepth(regression.slope, regression.intercept, criticalDepth)
      : null;
    const endYear = crossingYear !== null && crossingYear > latestUsedYear
      ? Math.min(crossingYear, latestUsedYear + 40)
      : latestUsedYear;
    maxYear = Math.max(maxYear, endYear);
    data.push({
      label: text("fittedTrend"),
      data: [
        { x: selectedPoints[0].year, y: regression.slope * selectedPoints[0].year + regression.intercept },
        { x: latestUsedYear, y: regression.slope * latestUsedYear + regression.intercept },
        ...(endYear > latestUsedYear ? [{ x: endYear, y: regression.slope * endYear + regression.intercept }] : [])
      ],
      showLine: true,
      borderColor: "#df7a35",
      borderDash: [7, 5],
      pointRadius: 0,
      fill: false
    });
  }
  if (hasCriticalDepth) {
    data.push({
      label: text("criticalDepthLine"),
      data: [{ x: wellSeries[0]?.year ?? startYear, y: criticalDepth }, { x: maxYear, y: criticalDepth }],
      showLine: true,
      borderColor: "#bf4b50",
      borderDash: [5, 5],
      pointRadius: 0,
      fill: false
    });
  }

  const gujarati = language === "gu";
  const family = gujarati ? "Noto Sans Gujarati" : "DM Sans";
  wellChart = new Chart(canvas, {
    type: "line",
    data: { datasets: data },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { family, weight: "normal" } } },
        tooltip: {
          callbacks: {
            title: (items) => items.length ? String(items[0].raw.x) : "",
            label: (context) => {
              const point = context.raw;
              const depth = `${formatNumber(point.y, 2)} ${text("meterAbbreviation")}`;
              return point.n === undefined
                ? `${context.dataset.label}: ${depth}`
                : `${context.dataset.label}: ${depth} (${text("readingCount")}: ${point.n})`;
            }
          },
          titleFont: { family, weight: "normal" },
          bodyFont: { family, weight: "normal" }
        }
      },
      scales: {
        x: {
          type: "linear",
          min: wellSeries[0]?.year,
          max: maxYear,
          title: { display: true, text: text("wellYearAxis"), font: { family, weight: gujarati ? "normal" : "600" } },
          ticks: { precision: 0, callback: (value) => String(value), font: { family, weight: "normal" } }
        },
        y: {
          reverse: true,
          title: { display: true, text: text("wellDepthAxis"), font: { family, weight: gujarati ? "normal" : "600" } },
          ticks: { font: { family, weight: "normal" } }
        }
      }
    }
  });
}

async function loadWellForDistrict(district) {
  const requestId = ++wellRequestId;
  const panel = document.querySelector("#well-panel");
  const status = document.querySelector("#well-status");
  const errorElement = document.querySelector("#well-error");
  const missing = document.querySelector("#well-missing");
  const content = document.querySelector("#well-content");
  panel.hidden = false;
  document.querySelector("#well-chart").hidden = true;
  document.querySelector("#well-chart-fallback").hidden = true;
  status.textContent = text("wellLoading");
  status.hidden = false;
  errorElement.hidden = true;
  missing.hidden = true;
  content.hidden = true;
  selectedWell = null;
  wellSeries = [];
  wellChart?.destroy();
  wellChart = undefined;

  if (wellsError) {
    setWellError(wellsError);
    return;
  }
  const well = wells.find((entry) => entry.district === district.district);
  if (!well) {
    status.hidden = true;
    missing.hidden = false;
    return;
  }

  try {
    const series = await getWellSeries(well.station_code);
    if (requestId !== wellRequestId) return;
    selectedWell = well;
    wellSeries = series;
    document.querySelector("#well-label").textContent = well.label;
    document.querySelector("#well-station-code").textContent = well.station_code;
    document.querySelector("#well-verified").hidden = !well.verified;
    document.querySelector("#well-unverified").hidden = Boolean(well.verified);
    document.querySelector("#well-range").textContent = `${well.first_year}–${well.last_year}`;

    const criticalInput = document.querySelector("#critical-depth");
    const wellDepth = well.well_depth === null || well.well_depth === ""
      ? Number.NaN
      : Number(well.well_depth);
    criticalInput.value = Number.isFinite(wellDepth) && wellDepth >= 0 && wellDepth <= 100
      ? String(Math.round(wellDepth * 0.7))
      : "";
    criticalInput.placeholder = text("criticalDepthPlaceholder");
    const trendSelect = document.querySelector("#trend-start-year");
    const years = series.map(({ year }) => year);
    trendSelect.replaceChildren(...years.map((year) => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = String(year);
      return option;
    }));
    const targetYear = Math.max(Number(well.first_year), 2012);
    const defaultYear = years.find((year) => year >= targetYear) ?? years.at(-1);
    trendSelect.value = defaultYear === undefined ? "" : String(defaultYear);
    renderWellLimitations(well);
    content.hidden = false;
    status.hidden = true;
    errorElement.hidden = true;
    renderWellAnalysis();
  } catch (error) {
    if (requestId !== wellRequestId) return;
    setWellError(error);
  }
}

function categoryKey(category) {
  return ({
    Safe: "safeCategory",
    "Semi-critical": "semiCriticalCategory",
    Critical: "criticalCategory",
    "Over-exploited": "overExploitedCategory"
  })[category] ?? "noData";
}

function categoryClass(category) {
  return ({
    Safe: "category-safe",
    "Semi-critical": "category-semi",
    Critical: "category-critical",
    "Over-exploited": "category-over"
  })[category] ?? "category-none";
}

function populateDistrictSelect() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.dataset.i18n = "selectDistrict";
  placeholder.textContent = text("selectDistrict");
  districtSelect.replaceChildren(placeholder, ...districts.map((district) => {
    const option = document.createElement("option");
    option.value = district.district;
    option.textContent = districtName(district);
    return option;
  }));
  if (selectedDistrict) districtSelect.value = selectedDistrict.district;
}

function applyTranslations() {
  document.documentElement.lang = language;
  document.title = text("pageTitle");
  document.querySelector(".brand").setAttribute("aria-label", text("homeLabel"));
  document.querySelector("#district-chart").setAttribute("aria-label", text("chartAccessibleLabel"));
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (element === districtSelect.options[0]) return;
    element.textContent = text(element.dataset.i18n);
  });
  languageSelect.options[0].textContent = text("englishLanguage");
  languageSelect.options[1].textContent = text("gujaratiLanguage");
  languageSelect.setAttribute("aria-label", text("languageLabel"));
  if (districts.length) populateDistrictSelect();
  renderDistrictTable();
  renderChart();
  if (selectedDistrict) {
    renderSelectedDistrict();
    renderWellAnalysis();
  }
}

function renderSelectedDistrict() {
  const district = selectedDistrict;
  const stage = stageFor(district);
  const category = classifyStage(stage);
  document.querySelector("#district-dashboard").hidden = false;
  document.querySelector("#selected-district-name").textContent = districtName(district);
  document.querySelector("#assessment-year").textContent = district.assessmentYear;
  document.querySelector("#rainfall-value").textContent = formatNumber(district.rainfall_mm, 2, true);
  document.querySelector("#resource-value").textContent = formatNumber(district.extractableResource, 2, true);
  document.querySelector("#extraction-value").textContent = formatNumber(district.extraction, 2, true);
  document.querySelector("#stage-value").textContent = stage === null ? text("noData") : `${formatNumber(stage, 1)}%`;
  const categoryBadge = document.querySelector("#stage-category");
  categoryBadge.textContent = category ? text(categoryKey(category)) : text("noData");
  categoryBadge.className = `category-badge ${categoryClass(category)}`;
  const hasMissingValue = [district.rainfall_mm, district.extractableResource, district.extraction].some((value) => value === null || value === undefined);
  document.querySelector("#no-data-note").hidden = !hasMissingValue;
  document.querySelector("#source-line").textContent = text("sourceLine").replace("{year}", district.assessmentYear);
  renderScenario();
}

function renderScenario() {
  if (!selectedDistrict) return;
  const rows = document.querySelector("#scenario-rows");
  rows.replaceChildren();
  const growth = Number(growthSlider.value);
  document.querySelector("#growth-output").textContent = `${formatNumber(growth, Number.isInteger(growth) ? 0 : 1)}%`;
  for (const threshold of [70, 90, 100]) {
    const row = document.createElement("tr");
    const thresholdCell = document.createElement("th");
    thresholdCell.scope = "row";
    thresholdCell.textContent = `${threshold}%`;
    const yearsCell = document.createElement("td");
    const yearCell = document.createElement("td");
    const years = yearsToThreshold(selectedDistrict.extraction, selectedDistrict.extractableResource, threshold, growth);
    if (years === 0) {
      yearsCell.textContent = text("alreadyAboveLevel");
      yearCell.textContent = text("alreadyAboveLevel");
    } else if (years === null) {
      yearsCell.textContent = text("notReachedAtGrowth");
      yearCell.textContent = text("notReachedAtGrowth");
    } else {
      yearsCell.textContent = formatNumber(years, 1);
      yearCell.textContent = String(Math.round(selectedDistrict.baseYear + years));
    }
    row.append(thresholdCell, yearsCell, yearCell);
    rows.append(row);
  }
}

function sortValue(district, key) {
  if (key === "district") return districtName(district).toLocaleLowerCase(locale());
  if (key === "category") return classifyStage(stageFor(district)) ?? "";
  if (key === "stage") return stageFor(district);
  return district[key];
}

function compareDistricts(left, right) {
  const leftValue = sortValue(left, sortKey);
  const rightValue = sortValue(right, sortKey);
  const leftMissing = leftValue === null || leftValue === undefined || leftValue === "";
  const rightMissing = rightValue === null || rightValue === undefined || rightValue === "";
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  if (typeof leftValue === "number" && typeof rightValue === "number") return (leftValue - rightValue) * sortDirection;
  return String(leftValue).localeCompare(String(rightValue), locale()) * sortDirection;
}

function renderDistrictTable() {
  const body = document.querySelector("#district-rows");
  if (!body) return;
  const sortedDistricts = [...districts].sort(compareDistricts);
  body.replaceChildren(...sortedDistricts.map((district) => {
    const stage = stageFor(district);
    const category = classifyStage(stage);
    const row = document.createElement("tr");
    row.dataset.district = district.district;
    row.tabIndex = 0;
    row.setAttribute("aria-selected", String(selectedDistrict?.district === district.district));
    if (selectedDistrict?.district === district.district) row.classList.add("selected");
    if (stage === null) row.classList.add("no-data-row");
    const values = [
      districtName(district),
      formatNumber(district.rainfall_mm, 2, true),
      formatNumber(district.extractableResource, 2, true),
      formatNumber(district.extraction, 2, true),
      stage === null ? text("noData") : `${formatNumber(stage, 1)}%`
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const categoryCell = document.createElement("td");
    if (category) {
      const badge = document.createElement("span");
      badge.className = `table-category ${categoryClass(category)}`;
      badge.textContent = text(categoryKey(category));
      categoryCell.append(badge);
    } else {
      categoryCell.textContent = text("noData");
    }
    row.append(categoryCell);
    row.addEventListener("click", () => selectDistrict(district.district));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectDistrict(district.district);
      }
    });
    return row;
  }));
  document.querySelectorAll("[data-sort]").forEach((button) => {
    let direction = "none";
    if (button.dataset.sort === sortKey) direction = sortDirection > 0 ? "ascending" : "descending";
    button.setAttribute("aria-sort", direction);
  });
}

const referenceLines = {
  id: "stageReferenceLines",
  afterDraw(chartInstance) {
    const scale = chartInstance.scales.x;
    const { ctx, chartArea } = chartInstance;
    for (const value of [70, 90, 100]) {
      const x = scale.getPixelForValue(value);
      if (x < chartArea.left || x > chartArea.right) continue;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      let lineColor = "#ba583c";
      if (value === 70) lineColor = "#418466";
      else if (value === 90) lineColor = "#c28b24";
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5;
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  }
};

function renderChart() {
  const canvas = document.querySelector("#district-chart");
  const fallback = document.querySelector("#chart-fallback");
  if (!districts.length || typeof Chart === "undefined") {
    canvas.hidden = true;
    fallback.hidden = false;
    return;
  }
  canvas.hidden = false;
  fallback.hidden = true;
  const ranked = districts.map((district) => ({ district, stage: stageFor(district) }))
    .filter(({ stage }) => stage !== null)
    .sort((left, right) => right.stage - left.stage);
  const categoryColors = { Safe: "#318768", "Semi-critical": "#d8a333", Critical: "#df7a35", "Over-exploited": "#bf4b50" };
  const selectedName = selectedDistrict?.district;
  const maxStage = Math.max(110, Math.ceil((Math.max(...ranked.map(({ stage }) => stage), 100) + 5) / 10) * 10);
  chart?.destroy();
  chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ranked.map(({ district }) => districtName(district)),
      datasets: [{
        data: ranked.map(({ stage }) => stage),
        backgroundColor: ranked.map(({ stage }) => categoryColors[classifyStage(stage)]),
        borderColor: ranked.map(({ district }) => district.district === selectedName ? "#143f46" : "transparent"),
        borderWidth: ranked.map(({ district }) => district.district === selectedName ? 3 : 0),
        borderRadius: 3,
        barThickness: 20
      }]
    },
    options: {
      indexAxis: "y", responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${formatNumber(context.parsed.x, 1)}%` } } },
      scales: {
        x: { min: 0, max: maxStage, grid: { color: "#e6eeee" }, title: { display: true, text: text("stageAxisTitle"), color: "#385c61", font: { family: language === "gu" ? "Noto Sans Gujarati" : "DM Sans", size: 12, weight: language === "gu" ? "normal" : "600" } }, ticks: { color: "#557074", callback: (value) => `${formatNumber(value, 0)}%` } },
        y: { grid: { display: false }, ticks: { color: "#284d53", font: { family: language === "gu" ? "Noto Sans Gujarati" : "DM Sans", size: 12 } } }
      },
      onClick: (_event, elements) => {
        if (elements.length) selectDistrict(ranked[elements[0].index].district.district);
      }
    },
    plugins: [referenceLines]
  });
}

function selectDistrict(name) {
  const district = districts.find((entry) => entry.district === name);
  if (!district) return;
  selectedDistrict = district;
  districtSelect.value = district.district;
  writeStorage("district", district.district);
  renderSelectedDistrict();
  loadWellForDistrict(district);
  renderDistrictTable();
  renderChart();
}

function renderDistricts() {
  populateDistrictSelect();
  renderDistrictTable();
  renderChart();
  if (selectedDistrict) {
    renderSelectedDistrict();
    loadWellForDistrict(selectedDistrict);
  }
}

document.querySelectorAll("[data-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    if (sortKey === button.dataset.sort) sortDirection *= -1;
    else {
      sortKey = button.dataset.sort;
      sortDirection = sortKey === "stage" ? -1 : 1;
    }
    renderDistrictTable();
  });
});

districtSelect.addEventListener("change", () => selectDistrict(districtSelect.value));
growthSlider.addEventListener("input", renderScenario);
document.querySelector("#critical-depth").addEventListener("input", renderWellAnalysis);
document.querySelector("#trend-start-year").addEventListener("change", renderWellAnalysis);
languageSelect.addEventListener("change", () => {
  language = languageSelect.value;
  writeStorage("language", language);
  applyTranslations();
});

async function startDashboard() {
  languageSelect.value = language;
  applyTranslations();
  try {
    districts = await getDistricts();
    try {
      wells = await getWells();
    } catch (error) {
      wellsError = error;
    }
    const savedDistrict = readStorage("district");
    selectedDistrict = districts.find((district) => district.district === savedDistrict) ?? null;
    renderDistricts();
    dataError.hidden = true;
  } catch (error) {
    console.error(error);
    dataError.textContent = text("districtLoadError");
    dataError.hidden = false;
    document.querySelector("#district-dashboard").hidden = true;
  }
}

await startDashboard();
