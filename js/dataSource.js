let wellsPromise;
let wellSeriesPromise;

export async function getDistricts() {
  try {
    const response = await fetch(new URL("../data/districts.json", import.meta.url));
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return await response.json();
  } catch (error) {
    throw new Error("Could not load district data. Run this site through VS Code Live Server.", { cause: error });
  }
}

export async function getWells() {
  try {
    wellsPromise ??= fetch(new URL("../data/wells_meta.json", import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status}).`);
        return response.json();
      })
      .catch((error) => {
        wellsPromise = undefined;
        throw error;
      });
    return await wellsPromise;
  } catch (error) {
    throw new Error("Could not load monitoring well metadata.", { cause: error });
  }
}

export async function getWellSeries(stationCode) {
  try {
    wellSeriesPromise ??= fetch(new URL("../data/wells_annual.csv", import.meta.url))
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status}).`);
        return response.text();
      })
      .then((csv) => {
        const [, ...rows] = csv.trim().split(/\r?\n/);
        return rows.map((row) => {
          const [code, year, depth, count] = row.split(",");
          return { stationCode: code, year: Number(year), depth: Number(depth), n: Number(count) };
        });
      })
      .catch((error) => {
        wellSeriesPromise = undefined;
        throw error;
      });
    const allRows = await wellSeriesPromise;
    return allRows
      .filter((row) => row.stationCode === stationCode)
      .map(({ year, depth, n }) => ({ year, depth, n }))
      .sort((left, right) => left.year - right.year);
  } catch (error) {
    throw new Error(`Could not load monitoring well readings for ${stationCode}.`, { cause: error });
  }
}
