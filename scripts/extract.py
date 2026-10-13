import pandas as pd
from pathlib import Path

# 1. Full path to the big file (change this)
FILE = r"C:\Users\rahul\OneDrive\Desktop\groundwater-level-collected-manually.csv"

STATION_CODE = "242140071304001"   # Ranavav2

# 2. Output goes to <project>/data/ranavav2_readings.csv
OUT = Path(__file__).resolve().parent.parent / "data" / "vav_ii_readings.csv"
OUT.parent.mkdir(exist_ok=True)

chunks = []
for chunk in pd.read_csv(FILE, chunksize=500_000, dtype=str, low_memory=False):
    chunk.columns = [c.strip().lower() for c in chunk.columns]
    if "station_code" in chunk.columns:
        hit = chunk[chunk["station_code"].str.strip() == STATION_CODE]
    else:
        hit = chunk[chunk.apply(lambda r: "ranavav" in " ".join(r.astype(str)).lower(), axis=1)]
    if len(hit):
        chunks.append(hit)

if chunks:
    out = pd.concat(chunks)
    out.to_csv(OUT, index=False)
    print(len(out), "rows saved to", OUT)
    print(out.head(10).to_string())
else:
    print("No rows found.")