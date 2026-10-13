import pandas as pd
from pathlib import Path

FILE = r"C:\Users\rahul\OneDrive\Desktop\groundwater-level-collected-manually.csv"

STATIONS = {
    "214100069444503": {"label": "Ranavav2", "district": "Porbandar", "verified": True},
    "222700070363001": {"label": "Movaiya", "district": "Rajkot", "verified": False},
    "233558072540901": {"label": "Derol Pz-II", "district": "Sabarkantha", "verified": False},
    "212030072453001": {"label": "Olpad2", "district": "Surat", "verified": False},
    "224300071363001": {"label": "Surendranagar2", "district": "Surendranagar", "verified": False},
    "203151073094501": {"label": "Dharampur 3", "district": "Valsad", "verified": False},
    "205700073210501": {"label": "Bedchit", "district": "Tapi", "verified": False},
    "222620073072001": {"label": "Sankarda", "district": "Vadodara", "verified": False},
}

DATA = Path(__file__).resolve().parent.parent / "data"
DATA.mkdir(exist_ok=True)

keep = []
for chunk in pd.read_csv(FILE, chunksize=500_000, dtype=str, low_memory=False):
    chunk.columns = [c.strip().lower() for c in chunk.columns]
    chunk["station_code"] = chunk["station_code"].str.strip()
    hit = chunk[chunk["station_code"].isin(STATIONS)
                & chunk["data_type_description"].str.contains("Water Level", case=False, na=False)]
    if len(hit):
        keep.append(hit)

df = pd.concat(keep)
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df["v"] = pd.to_numeric(df["data_value"], errors="coerce")
df = df.dropna(subset=["date", "v"])
df["year"] = df["date"].dt.year

annual = (df.groupby(["station_code", "year"])
            .agg(depth_to_water_m=("v", "median"), n_readings=("v", "count"))
            .reset_index())
annual["depth_to_water_m"] = annual["depth_to_water_m"].round(2)
annual.to_csv(DATA / "wells_annual.csv", index=False)

meta = df.drop_duplicates("station_code")[["station_code", "well_type", "well_aquifer_type",
                                           "latitude", "longitude", "well_depth"]].copy()
for col in ("label", "district", "verified"):
    meta[col] = meta["station_code"].map(lambda c, col=col: STATIONS[c][col])
meta["first_year"] = meta["station_code"].map(annual.groupby("station_code")["year"].min())
meta["last_year"] = meta["station_code"].map(annual.groupby("station_code")["year"].max())
meta.to_json(DATA / "wells_meta.json", orient="records", indent=2, force_ascii=False)

print(annual.groupby("station_code").size())
print(meta.to_string(index=False))