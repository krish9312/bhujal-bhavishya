# Bhujal Bhavishya (ભૂજળ ભવિષ્ય)

A district-level groundwater dashboard for a school science exhibition. It presents CGWB assessment data, calculates stage of extraction, and lets students explore simple extraction-growth scenarios. It is an educational tool, not an official assessment or forecast.

## Run it

Install the VS Code **Live Server** extension, open the project in VS Code, and choose **Open with Live Server** on `index.html`. The dashboard fetches its data files in the browser, so it must be run through Live Server over HTTP; fetching files does not work on `file://`. Chart.js and the Noto Sans Gujarati and Devanagari fonts are loaded from CDNs and need an internet connection. The language selector supports English, Gujarati, and Hindi. No backend, package installation, or build step is required.

Open `tests/model.test.html` through the same Live Server address to run the browser-based formula checks.

## Dashboard summaries and planning tools

The “What the data says” summary is calculated from `data/districts.json`, `data/wells_meta.json`, and `data/wells_annual.csv`. Well trend summaries use the observations from 2012 onward, or the station's first available year when that is later. District assessment stages and monitoring-station water-level readings are different measures: station readings are not a district average or extraction rate. Inferred station-to-district matches are marked unverified.

The “What it would take” calculator shows two separate ways to reach the selected stage:

- Extraction reduction = max(0, current extraction − (target stage / 100) × extractable resource).
- Additional extractable resource = max(0, current extraction / (target stage / 100) − current extractable resource).

The calculator expresses both values in hectare-metres and million cubic metres. These are simplified comparisons, not project designs; actual recharge and extraction projects depend on local conditions.

The “How it works” section explains the assessment, monitoring-well trends, and limitations. The well graph represents only its selected station. Its reference depth is a project-set comparison value, not an official or district-wide threshold; the trend extrapolation is not a forecast.

## Data

`data/districts.json` contains the district assessment rows shown in the dashboard. The `assessmentYear` field on each row identifies its period; use the source/year applicable to that row rather than assuming all values belong to one assessment year. Each object contains:

- `district`: district name in English.
- `name_gu`: district name in Gujarati.
- `assessmentYear`: assessment period label.
- `baseYear`: end year used to turn scenario duration into a calendar year.
- `rainfall_mm`: rainfall reported by the same assessment, in millimetres.
- `extractableResource`: annual extractable groundwater resource, in hectare-metres (`ham`).
- `extraction`: annual groundwater extraction, in hectare-metres (`ham`).

Use JSON `null` when an assessment value is unavailable. The dashboard displays a localized “No data” label rather than treating a missing value as zero.

## Model

Stage of extraction is calculated as:

`stage (%) = annual extraction / annual extractable groundwater resource x 100`

Categories are Safe at 70% or lower, Semi-critical above 70% through 90%, Critical above 90% through 100%, and Over-exploited above 100%.

For each threshold, the scenario assumes a fixed annual extraction growth rate and a constant extractable resource. If the current stage is above a threshold, the displayed time is zero. With positive growth, the number of years is:

`years = ln(thresholdPct x extractableResource / (100 x extraction)) / ln(1 + growthPct / 100)`

The growth rate is a project-selected scenario, not an official figure or forecast.

## Add a Monitoring Well

The dashboard lists stations from `data/station_districts.json` and lets users choose between stations assigned to a district. The current station lookup contains stations from `data/station_trends.csv` with at least eight spring-season annual points in 2012–2023, a recorded well depth above 1 metre, and coordinates inside a Gujarat district. District assignments inferred from coordinates are marked unverified. Add or correct station-to-district matches in `station_districts.json`, then run the extractor against the raw readings CSV:

```powershell
py scripts\extract_wells.py --input "C:\path\to\groundwater-level-collected-manually.csv"
```

The input CSV must contain station, reading type, date, value, and well metadata columns. The script processes it in chunks, keeps water-level readings for mapped stations, and writes annual median readings to `data/wells_annual.csv` plus station details to `data/wells_meta.json`. Use `--data-dir` and `--station-map` to choose different output or lookup paths. Install pandas with `py -m pip install pandas` if it is not already available. Verify inferred district matches before setting `"verified": true`. The aggregate “Rann and Kutch” row has no assessment values and is not assigned a monitoring well.

## Add a District

Add a district object to the array in `data/districts.json` using the same fields and units. Provide its English and Gujarati names, assessment year and base year. Use `null` for any unavailable rainfall, resource, or extraction value. The selector, chart, and table read directly from this file.