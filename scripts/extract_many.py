import pandas as pd
from pathlib import Path

FILE = r"C:\Users\rahul\OneDrive\Desktop\groundwater-level-collected-manually.csv"

STATIONS = {
    "242140071304001": {"label": "Vav ii", "taluka": "Vav", "district": "Vav-Tharad (formerly Banaskantha)"},
    "234200072320004": {"label": "Visnagar iv", "taluka": "Visnagar", "district": "Mehsana"},
    "231500069400002": {"label": "Bhuj (Circuit House)", "taluka": "Bhuj", "district": "Kachchh"},
    "231521068502401": {"label": "Naliya", "taluka": "Abdasa", "district": "Kachchh"},
    "214100069444503": {"label": "Ranavav2", "taluka": "Ranavav", "district": "Porbandar"},
}

DATA = Path(__file__).resolve().parent.parent / "data"
DATA.mkdir(exist_ok=True)

keep = []
for chunk in pd.read_csv(FILE, chunksize=500_000, dtype=str, low_memory=False):
    chunk.columns = [c.strip().lower() for c in chunk.columns]
    hit = chunk[chunk["station_code"].str.strip().isin(STATIONS)
                & chunk["data_type_description"].str.contains("Water Level", case=False, na=False)]
    if len(hit):
        keep.append(hit)

df = pd.concat(keep)
df["station_code"] = df["station_code"].str.strip()
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df["v"] = pd.to_numeric(df["data_value"], errors="coerce")
df = df.dropna(subset=["date", "v"])
df["year"] = df["date"].dt.year

annual = (df.groupby(["station_code", "year"])
            .agg(depth_to_water_m=("v", "median"), n_readings=("v", "count"))
            .reset_index())
annual["depth_to_water_m"] = annual["depth_to_water_m"].round(2)
annual.to_csv(DATA / "stations_annual.csv", index=False)

meta = df.drop_duplicates("station_code")[["station_code", "well_type", "well_aquifer_type",
                                           "latitude", "longitude", "well_depth"]].copy()
for col in ("label", "taluka", "district"):
    meta[col] = meta["station_code"].map(lambda c, col=col: STATIONS[c][col])
meta["first_year"] = meta["station_code"].map(annual.groupby("station_code")["year"].min())
meta["last_year"] = meta["station_code"].map(annual.groupby("station_code")["year"].max())
meta.to_json(DATA / "stations_meta.json", orient="records", indent=2, force_ascii=False)

print(annual.groupby("station_code").size())
print(meta.to_string(index=False))