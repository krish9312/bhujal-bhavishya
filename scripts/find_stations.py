import pandas as pd, numpy as np
from pathlib import Path

FILE = r"C:\Users\rahul\OneDrive\Desktop\groundwater-level-collected-manually.csv"
OUT = Path(__file__).resolve().parent.parent / "data" / "station_trends.csv"

keep = []
for chunk in pd.read_csv(FILE, chunksize=500_000, dtype=str, low_memory=False):
    chunk.columns = [c.strip().lower() for c in chunk.columns]
    lat = pd.to_numeric(chunk["latitude"], errors="coerce")
    lon = pd.to_numeric(chunk["longitude"], errors="coerce")
    g = chunk[lat.between(20.1, 24.8) & lon.between(68.1, 74.5)
              & chunk["data_type_description"].str.contains("Water Level", case=False, na=False)]
    if len(g):
        keep.append(g[["station_name", "station_code", "latitude", "longitude",
                       "well_depth", "date", "data_value"]])

df = pd.concat(keep)
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df["v"] = pd.to_numeric(df["data_value"], errors="coerce")
df = df.dropna(subset=["date", "v"])
df["year"] = df.date.dt.year
df["month"] = df.date.dt.month

meta = df.drop_duplicates("station_code").set_index("station_code")[["latitude", "longitude", "well_depth"]]
pre = df[df.month.between(4, 6) & df.year.between(2012, 2023)]
pre = pre.groupby(["station_code", "station_name", "year"], as_index=False).v.mean()

rows = []
for (code, name), g in pre.groupby(["station_code", "station_name"]):
    if len(g) < 8:
        continue
    slope, _ = np.polyfit(g.year, g.v, 1)
    r2 = np.corrcoef(g.year, g.v)[0, 1] ** 2
    rows.append({"station_name": name, "station_code": code, "years": len(g),
                 "slope_m_per_year": round(slope, 2), "r2": round(r2, 2),
                 "first_depth": round(g.sort_values("year").v.iloc[0], 1),
                 "last_depth": round(g.sort_values("year").v.iloc[-1], 1),
                 "well_depth": meta.loc[code, "well_depth"],
                 "lat": meta.loc[code, "latitude"], "lon": meta.loc[code, "longitude"]})

res = pd.DataFrame(rows).sort_values("slope_m_per_year", ascending=False)
OUT.parent.mkdir(exist_ok=True)
res.to_csv(OUT, index=False)
print(len(res), "stations analysed")
print(res[(res.slope_m_per_year > 0.3) & (res.r2 >= 0.5)].head(25).to_string(index=False))