"""
Generate an HTML report validating scraped votes against the manually curated CSVs.
Usage: python tests/generate_vote_validation_report.py [--output PATH]
"""
import argparse
import json
import unicodedata
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV_DIR = ROOT / "datasets" / "horizonottawa" / "votes_by_councillor" / "csv"
COUNCILLORS_JSON = ROOT / "ottawa_city_scraper" / "reference_data" / "current_councillors.json"
DB_PATH = ROOT / "ottawa_city_scraper.duckdb"
DEFAULT_OUTPUT = ROOT / "vote_validation_report.html"


def to_slug(name: str) -> str:
    n = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode("ascii")
    return n.lower().replace(" ", "-")


def load_csv_votes() -> pd.DataFrame:
    councillors = json.loads(COUNCILLORS_JSON.read_text(encoding="utf-8"))
    slug_to_initial = {to_slug(c["full_name"]): c["first_name_initial"] for c in councillors}

    frames = [pd.read_csv(f) for f in sorted(CSV_DIR.glob("*.csv"))]
    df = pd.concat(frames, ignore_index=True)
    df["meeting_url"] = df["meeting_link"].str.split("#").str[0]
    df["for_count"] = df["vote_tally"].str.extract(r"(\d+) Yes").astype(int)
    df["against_count"] = df["vote_tally"].str.extract(r"(\d+) No").astype(int)
    df["councillor_name"] = df["councillor"].map(slug_to_initial)
    return df


def collect_stats(df: pd.DataFrame, con: duckdb.DuckDBPyConnection) -> tuple[dict, dict]:
    db_urls = {r[0] for r in con.execute("SELECT source_url FROM meetings").fetchall()}

    councillors = json.loads(COUNCILLORS_JSON.read_text(encoding="utf-8"))
    slug_to_full = {to_slug(c["full_name"]): c["full_name"] for c in councillors}

    per_councillor = {}
    for slug in df["councillor"].unique():
        per_councillor[slug] = {
            "full_name": slug_to_full.get(slug, slug.replace("-", " ").title()),
            "ok": 0, "missing": 0, "ambiguous": 0, "wrong": [], "unscraped": 0, "total": 0,
        }

    for _, row in df.iterrows():
        s = per_councillor[row.councillor]
        s["total"] += 1
        if row.meeting_url not in db_urls:
            s["unscraped"] += 1
            continue
        rows = con.execute(
            """
            SELECT v.vote FROM votes v
            JOIN motions m  ON v.motion_id  = m.motion_id
            JOIN meetings mt ON m.meeting_id = mt.meeting_id
            WHERE mt.source_url = ? AND m.for_count = ? AND m.against_count = ?
              AND m.for_count > 0 AND v.councillor_name = ?
            """,
            [row.meeting_url, int(row.for_count), int(row.against_count), row.councillor_name],
        ).fetchall()
        expected = "for" if row.vote == "Yes" else "against"
        if len(rows) == 0:
            s["missing"] += 1
        elif len(rows) > 1:
            s["ambiguous"] += 1
        elif rows[0][0] != expected:
            s["wrong"].append({"date": row.date, "motion": row.motion,
                                "expected": expected, "got": rows[0][0],
                                "tally": f"{int(row.for_count)}Y/{int(row.against_count)}N"})
        else:
            s["ok"] += 1

    total_csv_meetings = df["meeting_url"].nunique()
    scraped_count = len(db_urls & set(df["meeting_url"].unique()))
    summary = {"total_csv_meetings": total_csv_meetings, "scraped_meetings": scraped_count}
    return per_councillor, summary


def render_html(per_councillor: dict, summary: dict) -> str:
    rows_html = []
    totals = defaultdict(int)

    for slug, s in sorted(per_councillor.items(), key=lambda x: x[1]["full_name"]):
        scraped = s["total"] - s["unscraped"]
        validated = s["ok"] + s["ambiguous"] + s["missing"]
        pct = round(100 * s["ok"] / validated) if validated else 0
        wrong_count = len(s["wrong"])

        totals["total"] += s["total"]
        totals["unscraped"] += s["unscraped"]
        totals["ok"] += s["ok"]
        totals["missing"] += s["missing"]
        totals["ambiguous"] += s["ambiguous"]
        totals["wrong"] += wrong_count

        # bar: green=ok, amber=ambiguous, red=missing+wrong, grey=unscraped
        def bar_seg(pct, colour, title):
            return f'<div class="seg" style="width:{pct}%;background:{colour}" title="{title}"></div>'

        if scraped:
            b_ok   = bar_seg(100 * s["ok"]        / s["total"], "#22c55e", f"Correct: {s['ok']}")
            b_amb  = bar_seg(100 * s["ambiguous"]  / s["total"], "#f59e0b", f"Ambiguous: {s['ambiguous']}")
            b_miss = bar_seg(100 * s["missing"]    / s["total"], "#ef4444", f"Missing: {s['missing']}")
            b_wr   = bar_seg(100 * wrong_count     / s["total"], "#7c3aed", f"Wrong: {wrong_count}")
            b_uns  = bar_seg(100 * s["unscraped"]  / s["total"], "#d1d5db", f"Unscraped meetings: {s['unscraped']}")
        else:
            b_ok = b_amb = b_miss = b_wr = ""
            b_uns = bar_seg(100, "#d1d5db", f"Unscraped: {s['unscraped']}")

        wrong_detail = ""
        if s["wrong"]:
            items = "".join(
                f'<li><span class="badge wrong-badge">WRONG</span> '
                f'<strong>{w["date"]}</strong> — {w["motion"][:80]} '
                f'<span class="tally">{w["tally"]}</span> '
                f'CSV: <em>{w["expected"]}</em> → DB: <em>{w["got"]}</em></li>'
                for w in s["wrong"]
            )
            wrong_detail = f'<ul class="wrong-list">{items}</ul>'

        row_class = "has-wrong" if wrong_count else ""
        rows_html.append(f"""
        <tr class="{row_class}">
          <td class="name">{s['full_name']}</td>
          <td class="num">{s['total']}</td>
          <td class="num ok">{s['ok']}</td>
          <td class="num amb">{s['ambiguous']}</td>
          <td class="num miss">{s['missing']}</td>
          <td class="num wr">{wrong_count if wrong_count else '—'}</td>
          <td class="num uns">{s['unscraped']}</td>
          <td class="pct {'pct-high' if pct >= 80 else 'pct-mid' if pct >= 50 else 'pct-low'}">{pct}%</td>
          <td class="bar-cell">
            <div class="bar">{b_ok}{b_amb}{b_miss}{b_wr}{b_uns}</div>
            {wrong_detail}
          </td>
        </tr>""")

    validated_total = totals["ok"] + totals["ambiguous"] + totals["missing"]
    overall_pct = round(100 * totals["ok"] / validated_total) if validated_total else 0

    meeting_pct = round(100 * summary["scraped_meetings"] / summary["total_csv_meetings"])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Vote Validation Report</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #f8fafc; color: #1e293b; padding: 2rem; }}
  h1 {{ font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }}
  .subtitle {{ color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }}

  .summary-cards {{ display: flex; gap: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }}
  .card {{ background: white; border-radius: 0.75rem; padding: 1rem 1.5rem;
           box-shadow: 0 1px 3px rgba(0,0,0,.08); min-width: 140px; }}
  .card .val {{ font-size: 2rem; font-weight: 700; line-height: 1; }}
  .card .lbl {{ font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; text-transform: uppercase; letter-spacing: .05em; }}
  .card.green .val {{ color: #16a34a; }}
  .card.amber .val {{ color: #d97706; }}
  .card.red   .val {{ color: #dc2626; }}
  .card.purple .val {{ color: #7c3aed; }}
  .card.grey  .val {{ color: #6b7280; }}

  .legend {{ display: flex; gap: 1.25rem; margin-bottom: 1rem; flex-wrap: wrap; font-size: 0.8rem; }}
  .legend-item {{ display: flex; align-items: center; gap: 0.4rem; }}
  .dot {{ width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }}

  table {{ width: 100%; border-collapse: collapse; background: white;
           border-radius: 0.75rem; overflow: hidden;
           box-shadow: 0 1px 3px rgba(0,0,0,.08); }}
  th {{ background: #f1f5f9; font-size: 0.75rem; text-transform: uppercase;
        letter-spacing: .05em; color: #475569; padding: 0.6rem 0.75rem;
        text-align: left; border-bottom: 1px solid #e2e8f0; }}
  td {{ padding: 0.55rem 0.75rem; border-bottom: 1px solid #f1f5f9;
        font-size: 0.875rem; vertical-align: top; }}
  tr:last-child td {{ border-bottom: none; }}
  tr.has-wrong {{ background: #fdf4ff; }}
  tr.has-wrong:hover {{ background: #fae8ff; }}
  tr:not(.has-wrong):hover {{ background: #f8fafc; }}

  .name {{ font-weight: 600; white-space: nowrap; }}
  .num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .ok   {{ color: #16a34a; }}
  .amb  {{ color: #d97706; }}
  .miss {{ color: #dc2626; }}
  .wr   {{ color: #7c3aed; font-weight: 700; }}
  .uns  {{ color: #9ca3af; }}
  .pct  {{ text-align: right; font-weight: 600; white-space: nowrap; }}
  .pct-high {{ color: #16a34a; }}
  .pct-mid  {{ color: #d97706; }}
  .pct-low  {{ color: #dc2626; }}
  .tally {{ font-size: 0.75rem; background: #f1f5f9; border-radius: 4px;
            padding: 1px 5px; font-variant-numeric: tabular-nums; }}

  .bar-cell {{ min-width: 220px; }}
  .bar {{ height: 8px; border-radius: 4px; overflow: hidden; display: flex;
          background: #f1f5f9; margin-top: 6px; }}
  .seg {{ height: 100%; transition: opacity .15s; }}
  .seg:hover {{ opacity: 0.75; }}

  .wrong-list {{ margin-top: 0.5rem; padding-left: 1rem; font-size: 0.78rem; color: #4b0082; }}
  .wrong-list li {{ margin-bottom: 0.3rem; }}
  .badge {{ display: inline-block; font-size: 0.65rem; font-weight: 700;
            padding: 1px 5px; border-radius: 3px; letter-spacing: .04em;
            text-transform: uppercase; margin-right: 4px; }}
  .wrong-badge {{ background: #7c3aed; color: white; }}

  tfoot td {{ font-weight: 700; background: #f8fafc; border-top: 2px solid #e2e8f0; }}
</style>
</head>
<body>
<h1>Ottawa City Council — Vote Validation Report</h1>
<p class="subtitle">Generated {datetime.now().strftime("%Y-%m-%d %H:%M")} &nbsp;·&nbsp;
  Scraped votes validated against manually curated CSV data (horizonottawa)</p>

<div class="summary-cards">
  <div class="card grey">
    <div class="val">{summary['scraped_meetings']}/{summary['total_csv_meetings']}</div>
    <div class="lbl">Meetings scraped</div>
  </div>
  <div class="card grey">
    <div class="val">{meeting_pct}%</div>
    <div class="lbl">Meeting coverage</div>
  </div>
  <div class="card green">
    <div class="val">{totals['ok']}</div>
    <div class="lbl">Correct votes</div>
  </div>
  <div class="card amber">
    <div class="val">{totals['ambiguous']}</div>
    <div class="lbl">Ambiguous (same tally)</div>
  </div>
  <div class="card red">
    <div class="val">{totals['missing']}</div>
    <div class="lbl">Missing votes</div>
  </div>
  <div class="card purple">
    <div class="val">{totals['wrong']}</div>
    <div class="lbl">Wrong direction</div>
  </div>
  <div class="card green">
    <div class="val">{overall_pct}%</div>
    <div class="lbl">Accuracy (of resolved)</div>
  </div>
</div>

<div class="legend">
  <span class="legend-item"><span class="dot" style="background:#22c55e"></span> Correct</span>
  <span class="legend-item"><span class="dot" style="background:#f59e0b"></span> Ambiguous (duplicate tally in meeting)</span>
  <span class="legend-item"><span class="dot" style="background:#ef4444"></span> Missing (not found in DB)</span>
  <span class="legend-item"><span class="dot" style="background:#7c3aed"></span> Wrong direction</span>
  <span class="legend-item"><span class="dot" style="background:#d1d5db"></span> Meeting not yet scraped</span>
</div>

<table>
  <thead>
    <tr>
      <th>Councillor</th>
      <th style="text-align:right">Total CSV</th>
      <th style="text-align:right">Correct</th>
      <th style="text-align:right">Ambig.</th>
      <th style="text-align:right">Missing</th>
      <th style="text-align:right">Wrong</th>
      <th style="text-align:right">Unscraped</th>
      <th style="text-align:right">Accuracy</th>
      <th>Breakdown</th>
    </tr>
  </thead>
  <tbody>
    {"".join(rows_html)}
  </tbody>
  <tfoot>
    <tr>
      <td>Total</td>
      <td class="num">{totals['total']}</td>
      <td class="num ok">{totals['ok']}</td>
      <td class="num amb">{totals['ambiguous']}</td>
      <td class="num miss">{totals['missing']}</td>
      <td class="num wr">{totals['wrong'] if totals['wrong'] else '—'}</td>
      <td class="num uns">{totals['unscraped']}</td>
      <td class="pct {'pct-high' if overall_pct >= 80 else 'pct-mid'}">{overall_pct}%</td>
      <td></td>
    </tr>
  </tfoot>
</table>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()

    print("Loading CSV votes...")
    df = load_csv_votes()
    con = duckdb.connect(str(DB_PATH), read_only=True)

    print("Collecting stats...")
    per_councillor, summary = collect_stats(df, con)

    html = render_html(per_councillor, summary)
    out = Path(args.output)
    out.write_text(html, encoding="utf-8")
    print(f"Report written to {out}")


if __name__ == "__main__":
    main()
