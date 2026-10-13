import argparse
import json
from pathlib import Path

import pandas as pd

SOURCE_CSV = Path(r"C:\Users\rahul\OneDrive\Desktop\groundwater-level-collected-manually.csv")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
STATION_MAP = DATA_DIR / "station_districts.json"

STATIONS = {
    "214100069444503": {"label": "Ranavav2", "district": "Porbandar", "verified": True},
    "222700070363001": {"label": "Movaiya", "district": "Rajkot", "verified": False},
    "233558072540901": {"label": "Derol Pz-II", "district": "Sabarkantha", "verified": False},
    "212030072453001": {"label": "Olpad2", "district": "Surat", "verified": False},
    "224300071363001": {"label": "Surendranagar2", "district": "Surendranagar", "verified": False},
    "203151073094501": {"label": "Dharampur 3", "district": "Valsad", "verified": False},
    "205700073210501": {"label": "Bedchit", "district": "Tapi", "verified": False},
    "222620073072001": {"label": "Sankarda", "district": "Vadodara", "verified": False},
    "225915072121501": {"label": "Jholapur Pz-I", "district": "Ahmedabad", "verified": False},
    "211330071244001": {"label": "Goradka", "district": "Amreli", "verified": False},
    "223030072585601": {"label": "Walmi II", "district": "Anand", "verified": False},
    "232000073180001": {"label": "Karanpur", "district": "Arvalli", "verified": False},
    "241350071544401": {"label": "Balodhar Pz-I", "district": "Banaskantha", "verified": False},
    "212700072480001": {"label": "Ilav", "district": "Bharuch", "verified": False},
    "215737071531101": {"label": "Ayodhayapuram", "district": "Bhavnagar", "verified": False},
    "220105071420001": {"label": "Ningala", "district": "Botad", "verified": False},
    "220400074083001": {"label": "Vagudan", "district": "Chhota Udaipur", "verified": False},
    "224200073550001": {"label": "Devgadh Bariya", "district": "Dahod", "verified": False},
    "204532073411001": {"label": "Ahwa Pz", "district": "Dang", "verified": False},
    "221205069350001": {"label": "Kuvadia", "district": "Devbhumi Dwarka", "verified": False},
    "231750072342602": {"label": "Sardhav Pz-II", "district": "Gandhinagar", "verified": False},
    "204747070563101": {"label": "Kesariya1", "district": "Gir Somnath", "verified": False},
    "222315069520001": {"label": "Moti Khavdi", "district": "Jamnagar", "verified": False},
    "211325070032001": {"label": "Sil Bandar", "district": "Junagadh", "verified": False},
    "235040069435501": {"label": "Khavda", "district": "Kachchh", "verified": False},
    "224240072520001": {"label": "Nadiad Pz-I", "district": "Kheda", "verified": False},
    "232323072182401": {"label": "Suraj", "district": "Mahesana", "verified": False},
    "230709073281801": {"label": "Ucharpi Pz", "district": "Mahisagar", "verified": False},
    "225600070483001": {"label": "Amar Nagar", "district": "Morbi", "verified": False},
    "213115073384501": {"label": "Chikada", "district": "Narmada", "verified": False},
    "205930072531001": {"label": "Chinam", "district": "Navsari", "verified": False},
    "222210073433001": {"label": "Jambughoda", "district": "Panchmahal", "verified": False},
    "235500072060001": {"label": "Bhutia Vasna I", "district": "Patan", "verified": False},
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract configured monitoring-well readings into dashboard data files."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=SOURCE_CSV,
        help=f"Source readings CSV (default: {SOURCE_CSV})",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DATA_DIR,
        help=f"Directory for wells_annual.csv and wells_meta.json (default: {DATA_DIR})",
    )
    parser.add_argument(
        "--station-map",
        type=Path,
        default=STATION_MAP,
        help=f"Station-to-district lookup JSON (default: {STATION_MAP})",
    )
    return parser.parse_args()


def load_stations(path):
    if not path.is_file():
        raise SystemExit(f"Station district map not found: {path}")
    try:
        station_map = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"Could not parse station district map: {error}") from error

    stations = {}
    for station in station_map.get("stations", []):
        code = str(station.get("station_code", "")).strip()
        district = str(station.get("district", "")).strip()
        label = str(station.get("label", "")).strip()
        if code and district and label:
            stations[code] = {"label": label, "district": district, "verified": False}
    if not stations:
        raise SystemExit(f"No usable stations found in station district map: {path}")
    stations.update(STATIONS)
    return stations


def main():
    args = parse_args()
    if not args.input.is_file():
        raise SystemExit(f"Source CSV not found: {args.input}")
    stations = load_stations(args.station_map)

    required_columns = {
        "station_code",
        "data_type_description",
        "date",
        "data_value",
        "well_type",
        "well_aquifer_type",
        "latitude",
        "longitude",
        "well_depth",
    }
    keep = []
    reading_columns = [
        "station_code",
        "date",
        "data_value",
        "well_type",
        "well_aquifer_type",
        "latitude",
        "longitude",
        "well_depth",
    ]
    for chunk in pd.read_csv(args.input, chunksize=500_000, dtype=str, low_memory=False):
        chunk.columns = [column.strip().lower() for column in chunk.columns]
        missing_columns = required_columns.difference(chunk.columns)
        if missing_columns:
            missing = ", ".join(sorted(missing_columns))
            raise SystemExit(f"Source CSV is missing required columns: {missing}")

        chunk["station_code"] = chunk["station_code"].str.strip()
        hit = chunk[
            chunk["station_code"].isin(stations)
            & chunk["data_type_description"].str.contains("Water Level", case=False, na=False)
        ]
        if not hit.empty:
            keep.append(hit[reading_columns].copy())

    if not keep:
        raise SystemExit("No water-level readings found for stations in the station district map.")

    df = pd.concat(keep, ignore_index=True)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["value"] = pd.to_numeric(df["data_value"], errors="coerce")
    df = df.dropna(subset=["date", "value"])
    if df.empty:
        raise SystemExit("Matching rows were found, but none had a valid date and numeric water-level value.")
    found_station_codes = set(df["station_code"].unique())
    df["year"] = df["date"].dt.year

    annual = (
        df.groupby(["station_code", "year"])
        .agg(depth_to_water_m=("value", "median"), n_readings=("value", "count"))
        .reset_index()
    )
    annual["depth_to_water_m"] = annual["depth_to_water_m"].round(2)

    meta = df.drop_duplicates("station_code")[
        ["station_code", "well_type", "well_aquifer_type", "latitude", "longitude", "well_depth"]
    ].copy()
    for column in ("label", "district", "verified"):
        meta[column] = meta["station_code"].map(lambda code, key=column: stations[code][key])
    annual_by_station = annual.groupby("station_code")["year"]
    meta["first_year"] = meta["station_code"].map(annual_by_station.min())
    meta["last_year"] = meta["station_code"].map(annual_by_station.max())
    station_priority = {code: index for index, code in enumerate(STATIONS)}
    meta["_priority"] = meta["station_code"].map(lambda code: station_priority.get(code, len(station_priority)))
    meta = meta.sort_values(["_priority", "district", "label"], kind="stable").drop(columns="_priority")

    args.data_dir.mkdir(parents=True, exist_ok=True)
    annual_path = args.data_dir / "wells_annual.csv"
    meta_path = args.data_dir / "wells_meta.json"
    annual.to_csv(annual_path, index=False)
    meta.to_json(meta_path, orient="records", indent=2, force_ascii=False)

    missing_stations = sorted(set(stations) - found_station_codes)
    print(f"Saved {len(annual)} annual station-year rows to {annual_path}")
    print(f"Saved metadata for {len(meta)} stations to {meta_path}")
    if missing_stations:
        preview = ", ".join(missing_stations[:10])
        remainder = f" and {len(missing_stations) - 10} more" if len(missing_stations) > 10 else ""
        print(f"No matching water-level readings found for {len(missing_stations)} mapped stations: {preview}{remainder}")


if __name__ == "__main__":
    main()
