"""
Generate an HTML report comparing the manually curated horizonottawa CSVs
against the scraper-exported CSVs.

Usage: python tests/generate_horizonottawa_comparison_report.py [--output PATH]
"""
import argparse
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
HORIZON_DIR = ROOT / "datasets" / "horizonottawa" / "votes_by_councillor" / "csv"
EXPORT_DIR  = ROOT / "datasets" / "exported-votes"
DEFAULT_OUT = ROOT / "horizonottawa_comparison_report.html"


def _normalize_url(url_series: pd.Series) -> pd.Series:
    """Truncate meeting URLs at 'lang=English', dropping any trailing params or fragments."""
    return url_series.str.replace(r"(lang=English).*", r"\1", regex=True)


def _load(directory: Path, normalize: bool = False) -> pd.DataFrame:
    frames = [pd.read_csv(f) for f in sorted(directory.glob("*.csv"))]
    df = pd.concat(frames, ignore_index=True)
    df["meeting_url"]   = _normalize_url(df["meeting_link"]) if normalize else df["meeting_link"]
    df["for_count"]     = df["vote_tally"].str.extract(r"(\d+) Yes").astype(int)
    df["against_count"] = df["vote_tally"].str.extract(r"(\d+) No").astype(int)
    return df


def collect(horizon: pd.DataFrame, exported: pd.DataFrame) -> dict:
    exported_meetings = set(exported["meeting_url"].unique())
    covered = horizon[horizon["meeting_url"].isin(exported_meetings)]

    # (councillor, meeting_url, for_count, against_count) → [vote]
    index: dict[tuple, list[str]] = {}
    for _, row in exported.iterrows():
        key = (row.councillor, row.meeting_url, int(row.for_count), int(row.against_count))
        index.setdefault(key, []).append(row.vote)

    per_councillor: dict[str, dict] = {}
    for slug in sorted(horizon["councillor"].unique()):
        per_councillor[slug] = {
            "ok": [], "missing": [], "ambiguous": [], "wrong": [], "unscraped": [],
        }

    for _, row in horizon.iterrows():
        slug = row.councillor
        label = {"date": row.date, "motion": str(row.motion), "tally": f"{int(row.for_count)}Y/{int(row.against_count)}N"}
        if row.meeting_url not in exported_meetings:
            per_councillor[slug]["unscraped"].append(label)
            continue
        key = (slug, row.meeting_url, int(row.for_count), int(row.against_count))
        matches = index.get(key, [])
        if len(matches) == 0:
            per_councillor[slug]["missing"].append(label)
        elif len(matches) > 1:
            per_councillor[slug]["ambiguous"].append(label)
        elif matches[0] != row.vote:
            per_councillor[slug]["wrong"].append({**label, "horizon": row.vote, "exported": matches[0]})
        else:
            per_councillor[slug]["ok"].append(label)

    # Unique missing motions across all councillors
    missing_motions = sorted({
        f"{e['date']} | {e['motion'][:70]} [{e['tally']}]"
        for s in per_councillor.values() for e in s["missing"]
    })

    total_meetings = horizon["meeting_url"].nunique()
    scraped_meetings = len(exported_meetings & set(horizon["meeting_url"].unique()))
    unscraped_urls = sorted(set(horizon["meeting_url"].unique()) - exported_meetings)

    return {
        "per_councillor": per_councillor,
        "missing_motions": missing_motions,
        "total_meetings": total_meetings,
        "scraped_meetings": scraped_meetings,
        "unscraped_urls": unscraped_urls,
        "total_horizon_rows": len(horizon),
        "total_covered_rows": len(covered),
    }


def render(data: dict) -> str:
    pc = data["per_councillor"]

    totals = defaultdict(int)
    rows_html = []

    for slug, s in pc.items():
        name = slug.replace("-", " ").title()
        ok  = len(s["ok"])
        mis = len(s["missing"])
        amb = len(s["ambiguous"])
        wr  = len(s["wrong"])
        uns = len(s["unscraped"])
        total = ok + mis + amb + wr + uns
        validated = ok + mis + amb + wr
        pct = round(100 * ok / validated) if validated else 0

        totals["ok"]  += ok;  totals["missing"] += mis; totals["ambiguous"] += amb
        totals["wrong"] += wr; totals["unscraped"] += uns; totals["total"] += total

        def seg(w, colour, tip):
            if w == 0: return ""
            return f'<div class="seg" style="width:{w}%;background:{colour}" title="{tip}"></div>'

        bar = (
            seg(100*ok/total,  "#22c55e", f"Correct: {ok}") +
            seg(100*amb/total, "#f59e0b", f"Ambiguous: {amb}") +
            seg(100*mis/total, "#ef4444", f"Missing: {mis}") +
            seg(100*wr/total,  "#7c3aed", f"Wrong: {wr}") +
            seg(100*uns/total, "#d1d5db", f"Not yet scraped: {uns}")
        ) if total else ""

        wrong_html = ""
        if s["wrong"]:
            items = "".join(
                f'<li><strong>{w["date"]}</strong> — {w["motion"][:80]}'
                f' <span class="tally">{w["tally"]}</span>'
                f' horizonottawa=<em>{w["horizon"]}</em> → exported=<em>{w["exported"]}</em></li>'
                for w in s["wrong"]
            )
            wrong_html = f'<ul class="detail-list wrong-list">{items}</ul>'

        row_class = "row-wrong" if wr else ""
        pct_class = "pct-high" if pct >= 80 else ("pct-mid" if pct >= 50 else "pct-low")

        rows_html.append(f"""
        <tr class="{row_class}">
          <td class="name">{name}</td>
          <td class="num">{total}</td>
          <td class="num c-ok">{ok}</td>
          <td class="num c-amb">{amb}</td>
          <td class="num c-mis">{mis}</td>
          <td class="num c-wr">{"⚠ " + str(wr) if wr else "—"}</td>
          <td class="num c-uns">{uns}</td>
          <td class="num {pct_class}">{pct}%</td>
          <td class="bar-cell"><div class="bar">{bar}</div>{wrong_html}</td>
        </tr>""")

    validated_total = totals["ok"] + totals["missing"] + totals["ambiguous"] + totals["wrong"]
    overall_pct = round(100 * totals["ok"] / validated_total) if validated_total else 0
    pct_class = "pct-high" if overall_pct >= 80 else "pct-mid"
    meeting_pct = round(100 * data["scraped_meetings"] / data["total_meetings"])

    missing_rows = "".join(
        f'<li class="missing-item">{m}</li>' for m in data["missing_motions"]
    )
    unscraped_rows = "".join(
        f'<li class="unscraped-item">{u}</li>' for u in data["unscraped_urls"]
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Horizonottawa vs Exported — Comparison Report</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        background:#f8fafc;color:#1e293b;padding:2rem;}}
  h1{{font-size:1.5rem;font-weight:700;margin-bottom:.25rem}}
  h2{{font-size:1.05rem;font-weight:600;margin:2rem 0 .75rem;color:#334155}}
  .subtitle{{color:#64748b;font-size:.85rem;margin-bottom:1.5rem}}

  .cards{{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:2rem}}
  .card{{background:white;border-radius:.75rem;padding:1rem 1.5rem;
         box-shadow:0 1px 3px rgba(0,0,0,.08);min-width:130px}}
  .card .val{{font-size:2rem;font-weight:700;line-height:1}}
  .card .lbl{{font-size:.72rem;color:#64748b;margin-top:.25rem;
              text-transform:uppercase;letter-spacing:.05em}}
  .green .val{{color:#16a34a}} .amber .val{{color:#d97706}}
  .red .val{{color:#dc2626}}   .purple .val{{color:#7c3aed}}
  .grey .val{{color:#6b7280}}

  .legend{{display:flex;gap:1.25rem;flex-wrap:wrap;font-size:.8rem;margin-bottom:1rem}}
  .legend-item{{display:flex;align-items:center;gap:.4rem}}
  .dot{{width:12px;height:12px;border-radius:3px;flex-shrink:0}}

  table{{width:100%;border-collapse:collapse;background:white;
         border-radius:.75rem;overflow:hidden;
         box-shadow:0 1px 3px rgba(0,0,0,.08)}}
  th{{background:#f1f5f9;font-size:.72rem;text-transform:uppercase;
      letter-spacing:.05em;color:#475569;padding:.6rem .75rem;
      text-align:left;border-bottom:1px solid #e2e8f0}}
  td{{padding:.55rem .75rem;border-bottom:1px solid #f1f5f9;
      font-size:.875rem;vertical-align:top}}
  tr:last-child td{{border-bottom:none}}
  tr.row-wrong{{background:#fdf4ff}}
  tr.row-wrong:hover{{background:#fae8ff}}
  tr:not(.row-wrong):hover{{background:#f8fafc}}
  tfoot td{{font-weight:700;background:#f8fafc;border-top:2px solid #e2e8f0}}

  .name{{font-weight:600;white-space:nowrap}}
  .num{{text-align:right;font-variant-numeric:tabular-nums}}
  .c-ok{{color:#16a34a}} .c-amb{{color:#d97706}}
  .c-mis{{color:#dc2626}} .c-wr{{color:#7c3aed;font-weight:700}}
  .c-uns{{color:#9ca3af}}
  .pct-high{{color:#16a34a;font-weight:600;text-align:right}}
  .pct-mid{{color:#d97706;font-weight:600;text-align:right}}
  .pct-low{{color:#dc2626;font-weight:600;text-align:right}}
  .tally{{font-size:.72rem;background:#f1f5f9;border-radius:4px;padding:1px 5px}}

  .bar-cell{{min-width:200px}}
  .bar{{height:8px;border-radius:4px;overflow:hidden;display:flex;
        background:#f1f5f9;margin-top:5px}}
  .seg{{height:100%}}

  .detail-list{{margin-top:.4rem;padding-left:1rem;font-size:.78rem}}
  .wrong-list{{color:#4b0082}}
  .wrong-list li{{margin-bottom:.25rem}}

  .panel{{background:white;border-radius:.75rem;padding:1.25rem 1.5rem;
          box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:1.5rem}}
  .panel ul{{padding-left:1.25rem;font-size:.85rem;line-height:1.8}}
  .missing-item{{color:#dc2626}}
  .unscraped-item{{color:#6b7280;font-size:.8rem}}
</style>
</head>
<body>
<h1>Horizonottawa vs Exported Votes — Comparison Report</h1>
<p class="subtitle">Generated {datetime.now().strftime("%Y-%m-%d %H:%M")} &nbsp;·&nbsp;
  Manually curated horizonottawa CSVs compared against scraper-exported CSVs (no DB required)</p>

<div class="cards">
  <div class="card grey">
    <div class="val">{data['scraped_meetings']}/{data['total_meetings']}</div>
    <div class="lbl">Meetings covered</div>
  </div>
  <div class="card grey">
    <div class="val">{meeting_pct}%</div>
    <div class="lbl">Meeting coverage</div>
  </div>
  <div class="card grey">
    <div class="val">{data['total_covered_rows']}/{data['total_horizon_rows']}</div>
    <div class="lbl">Rows in scope</div>
  </div>
  <div class="card green">
    <div class="val">{totals['ok']}</div>
    <div class="lbl">Correct votes</div>
  </div>
  <div class="card amber">
    <div class="val">{totals['ambiguous']}</div>
    <div class="lbl">Ambiguous tally</div>
  </div>
  <div class="card red">
    <div class="val">{totals['missing']}</div>
    <div class="lbl">Missing in export</div>
  </div>
  <div class="card purple">
    <div class="val">{totals['wrong']}</div>
    <div class="lbl">Wrong direction</div>
  </div>
  <div class="card green">
    <div class="val">{overall_pct}%</div>
    <div class="lbl">Accuracy (resolved)</div>
  </div>
</div>

<div class="legend">
  <span class="legend-item"><span class="dot" style="background:#22c55e"></span>Correct</span>
  <span class="legend-item"><span class="dot" style="background:#f59e0b"></span>Ambiguous (same tally, multiple motions)</span>
  <span class="legend-item"><span class="dot" style="background:#ef4444"></span>Missing in export</span>
  <span class="legend-item"><span class="dot" style="background:#7c3aed"></span>Wrong direction</span>
  <span class="legend-item"><span class="dot" style="background:#d1d5db"></span>Meeting not yet scraped</span>
</div>

<table>
  <thead>
    <tr>
      <th>Councillor</th>
      <th style="text-align:right">Total</th>
      <th style="text-align:right">Correct</th>
      <th style="text-align:right">Ambig.</th>
      <th style="text-align:right">Missing</th>
      <th style="text-align:right">Wrong</th>
      <th style="text-align:right">Unscraped</th>
      <th style="text-align:right">Accuracy</th>
      <th>Breakdown</th>
    </tr>
  </thead>
  <tbody>{"".join(rows_html)}</tbody>
  <tfoot>
    <tr>
      <td>Total</td>
      <td class="num">{totals['total']}</td>
      <td class="num c-ok">{totals['ok']}</td>
      <td class="num c-amb">{totals['ambiguous']}</td>
      <td class="num c-mis">{totals['missing']}</td>
      <td class="num c-wr">{"⚠ " + str(totals['wrong']) if totals['wrong'] else "—"}</td>
      <td class="num c-uns">{totals['unscraped']}</td>
      <td class="num {pct_class}">{overall_pct}%</td>
      <td></td>
    </tr>
  </tfoot>
</table>

<h2>Missing Motions ({len(data['missing_motions'])} distinct)</h2>
<div class="panel">
  <p style="font-size:.8rem;color:#64748b;margin-bottom:.75rem">
    These motions appear in horizonottawa CSVs and the meeting was scraped,
    but no matching tally was found in the exported data. Likely scraper gaps.
  </p>
  <ul>{missing_rows}</ul>
</div>

<h2>Unscraped Meetings ({len(data['unscraped_urls'])})</h2>
<div class="panel">
  <p style="font-size:.8rem;color:#64748b;margin-bottom:.75rem">
    These meeting URLs appear in horizonottawa CSVs but have no corresponding
    exported data. They have not been scraped yet.
  </p>
  <ul>{unscraped_rows}</ul>
</div>

</body>
</html>"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    print("Loading CSVs...")
    horizon  = _load(HORIZON_DIR, normalize=True)
    exported = _load(EXPORT_DIR, normalize=True)

    print("Comparing...")
    data = collect(horizon, exported)

    html = render(data)
    out = Path(args.output)
    out.write_text(html, encoding="utf-8")
    print(f"Report written to {out}")


if __name__ == "__main__":
    main()
