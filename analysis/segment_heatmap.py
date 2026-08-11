#!/usr/bin/env python3
"""
Lecture Segment Difficulty Heatmap — Spandan Research Analysis
==============================================================
Answers: "Which part of the lecture did students understand the least?"

Spandan records each lecture in time-ordered chunks called segments.
Both the Transcript and Question models carry a segmentIndex, so every
student response can be traced back to the exact moment of the lecture
it tested.  This script exploits that link to produce:

  1. A colour-coded TIMELINE HEATMAP (bar chart) — one bar per segment,
     coloured green → yellow → red by accuracy.  Untested segments are
     shown in grey so the full lecture timeline is always visible.

  2. A KEYWORD SUMMARY table — top TF-IDF keywords extracted from each
     segment's transcript text so you can see *what topic* each bar
     represents without reading the full transcript.

  3. A CROSS-SESSION HEATMAP — when analysing multiple rooms, averages
     accuracy by segment position so you can spot which part of a
     recurring lecture consistently trips students up.

  4. CSV exports for further analysis in Excel / R / SPSS.

Usage
-----
  # Single session (most common)
  python segment_heatmap.py --key YOUR_KEY --room-id <mongoId>

  # All ended sessions (bulk / cross-session)
  python segment_heatmap.py --key YOUR_KEY

  # Offline mode (no server needed — pass a JSON file)
  python segment_heatmap.py --json session.json

  # Custom API base URL (e.g. local dev)
  python segment_heatmap.py --key YOUR_KEY --room-id <id> \\
         --api-url http://localhost:3001/api

Output
------
  output/heatmap_<roomName>.png    — timeline heatmap for each session
  output/cross_session_heatmap.png — averaged heatmap across all sessions
  output/segment_difficulty.csv    — per-segment table (all sessions)
  output/session_summary.csv       — one row per session (hardest segment, etc.)
"""

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import requests
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from matplotlib.patches import Patch

# ── optional TF-IDF keyword extraction ───────────────────────────────────────
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    _TFIDF_AVAILABLE = True
except ImportError:
    _TFIDF_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_API_URL = 'https://samagama.in/spandan/api'
OUTPUT_DIR      = Path('output')

# Accuracy thresholds for colour mapping
THRESH_RED    = 0.50   # below 50% → red (struggling)
THRESH_YELLOW = 0.65   # below 65% → yellow (borderline)
# above 65% → green (good)

KEYWORD_TOP_N   = 5    # keywords to extract per segment
MIN_RESPONSES   = 3    # skip accuracy label if fewer responses (unreliable)
SNIPPET_LEN     = 80   # chars of transcript to show in the label

# ─────────────────────────────────────────────────────────────────────────────
# Colour helpers
# ─────────────────────────────────────────────────────────────────────────────

def _accuracy_color(acc):
    """Map accuracy 0-1 to a hex colour (red → yellow → green)."""
    if acc is None:
        return '#bdc3c7'   # grey — untested segment
    if acc < THRESH_RED:
        return '#e74c3c'
    if acc < THRESH_YELLOW:
        return '#f39c12'
    return '#27ae60'


def _make_colorbar_legend(ax):
    """Add a simple legend explaining the colour scale."""
    patches = [
        Patch(color='#e74c3c', label=f'< {int(THRESH_RED*100)}%  — struggling'),
        Patch(color='#f39c12', label=f'{int(THRESH_RED*100)}–{int(THRESH_YELLOW*100)}% — borderline'),
        Patch(color='#27ae60', label=f'≥ {int(THRESH_YELLOW*100)}% — good'),
        Patch(color='#bdc3c7', label='not tested'),
    ]
    ax.legend(handles=patches, loc='upper right', fontsize=9, framealpha=0.85)

# ─────────────────────────────────────────────────────────────────────────────
# Data fetching
# ─────────────────────────────────────────────────────────────────────────────

def fetch_single_room(api_url, api_key, room_id):
    """Fetch segment-difficulty data for one room."""
    resp = requests.get(
        f"{api_url.rstrip('/')}/research/segment-difficulty",
        headers={'X-Research-Key': api_key},
        params={'roomId': room_id},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_all_rooms(api_url, api_key, limit=200):
    """Fetch segment-difficulty data for all ended sessions (paginated)."""
    all_sessions, cursor = [], None
    while True:
        params = {'limit': min(50, limit - len(all_sessions))}
        if cursor:
            params['since'] = cursor
        resp = requests.get(
            f"{api_url.rstrip('/')}/research/segment-difficulty",
            headers={'X-Research-Key': api_key},
            params=params,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        batch = data.get('sessions', [])
        all_sessions.extend(batch)
        print(f'  fetched {len(all_sessions)} sessions ...', end='\r', flush=True)
        next_cursor = data.get('nextCursor')
        if not batch or not next_cursor or next_cursor == cursor:
            break
        cursor = next_cursor
        if len(all_sessions) >= limit:
            break
    print(f'  fetched {len(all_sessions)} sessions — done.     ')
    return all_sessions


def load_json(filepath):
    """Load data from a local JSON file (offline mode)."""
    with open(filepath) as fh:
        data = json.load(fh)
    # Accept a single session dict OR a bulk envelope {"sessions": [...]}
    if isinstance(data, list):
        return data
    if 'segments' in data:
        return [data]
    return data.get('sessions', [data])

# ─────────────────────────────────────────────────────────────────────────────
# NLP: keyword extraction
# ─────────────────────────────────────────────────────────────────────────────

_STOP_WORDS = {
    'the','a','an','is','it','in','on','of','to','and','or','that','this',
    'was','are','be','for','with','as','at','by','from','have','has','been',
    'we','you','i','he','she','they','so','but','if','not','can','will',
    'its','their','our','which','what','how','when','where','who','then',
    'also','just','more','some','into','than','up','do','about','all',
    'would','could','should','there','here','now','let','may','might',
    'very','much','such','than','over','after','before','because','while',
}


def _simple_keywords(texts, top_n=KEYWORD_TOP_N):
    """
    Fallback keyword extraction using word-frequency (no sklearn needed).
    Returns a list-of-lists, one per text.
    """
    results = []
    for text in texts:
        words = re.findall(r"[a-zA-Z]{4,}", text.lower())
        freq = defaultdict(int)
        for w in words:
            if w not in _STOP_WORDS:
                freq[w] += 1
        top = sorted(freq, key=lambda w: -freq[w])[:top_n]
        results.append(top)
    return results


def extract_keywords(texts, top_n=KEYWORD_TOP_N):
    """
    Extract top-N keywords per segment text.
    Uses TF-IDF when sklearn is available, falls back to word frequency.
    """
    clean = [t.strip() if t.strip() else 'empty' for t in texts]
    if _TFIDF_AVAILABLE and len([t for t in clean if t != 'empty']) > 1:
        try:
            vec = TfidfVectorizer(
                stop_words='english',
                max_features=500,
                ngram_range=(1, 2),
                min_df=1,
            )
            tfidf = vec.fit_transform(clean)
            terms = vec.get_feature_names_out()
            result = []
            for row in tfidf:
                arr = row.toarray().flatten()
                top_idx = arr.argsort()[::-1][:top_n]
                result.append([terms[i] for i in top_idx if arr[i] > 0])
            return result
        except Exception:
            pass
    return _simple_keywords(clean, top_n)

# ─────────────────────────────────────────────────────────────────────────────
# Plotting helpers
# ─────────────────────────────────────────────────────────────────────────────

def _safe_name(name):
    """Sanitise a room name for use in a filename."""
    return re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_')[:50]


def plot_session_heatmap(session, keywords_per_segment, out_dir):
    """
    Per-session timeline heatmap.

    Each bar = one lecture segment.
    Height = accuracy % (grey bar = not tested).
    Labels show the segment index, accuracy, and top keywords.
    """
    segments = session['segments']
    if not segments:
        print(f"  [skip] {session['roomName']} — no segments")
        return

    n      = len(segments)
    accs   = [s['avgAccuracy'] for s in segments]
    counts = [s['responseCount'] for s in segments]
    colors = [_accuracy_color(a) for a in accs]
    heights = [a * 100 if a is not None else 0 for a in accs]

    fig, ax = plt.subplots(figsize=(max(10, n * 1.4), 7))

    x = range(n)
    bars = ax.bar(x, heights, color=colors, edgecolor='white', linewidth=1.2, alpha=0.9, width=0.7)

    # Grey placeholder for untested segments
    for i, (h, a) in enumerate(zip(heights, accs)):
        if a is None:
            ax.bar(i, 15, color='#bdc3c7', edgecolor='white', linewidth=1.2, alpha=0.5, width=0.7)

    # Accuracy labels on bars
    for i, (bar, acc, cnt) in enumerate(zip(bars, accs, counts)):
        if acc is not None and cnt >= MIN_RESPONSES:
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_height() + 1,
                f'{acc*100:.0f}%\n(n={cnt})',
                ha='center', va='bottom', fontsize=8, fontweight='bold',
            )
        elif acc is None:
            ax.text(i, 8, 'not\ntested', ha='center', va='bottom',
                    fontsize=7, color='#7f8c8d')

    # Keyword labels below x-axis
    kw_labels = []
    for kws in keywords_per_segment:
        kw_labels.append(', '.join(kws[:3]) if kws else '')

    ax.set_xticks(list(x))
    ax.set_xticklabels(
        [f'Seg {s["segmentIndex"]}\n{k}' for s, k in zip(segments, kw_labels)],
        fontsize=8, ha='center',
    )

    # Threshold lines
    ax.axhline(THRESH_RED * 100,    color='#e74c3c', linestyle='--', alpha=0.4, linewidth=1)
    ax.axhline(THRESH_YELLOW * 100, color='#f39c12', linestyle='--', alpha=0.4, linewidth=1)
    ax.text(n - 0.4, THRESH_RED * 100 + 0.5,    f'{int(THRESH_RED*100)}%',    color='#e74c3c', fontsize=8)
    ax.text(n - 0.4, THRESH_YELLOW * 100 + 0.5, f'{int(THRESH_YELLOW*100)}%', color='#f39c12', fontsize=8)

    ax.set_ylim(0, 110)
    ax.set_xlabel('Lecture Segment (with top keywords)', fontsize=11)
    ax.set_ylabel('Average Accuracy (%)', fontsize=11)
    ax.set_title(
        f'Segment Difficulty Heatmap\n{session["roomName"]}  —  {session.get("date", "")}',
        fontsize=13, fontweight='bold', pad=12,
    )
    ax.grid(axis='y', alpha=0.25)
    _make_colorbar_legend(ax)

    plt.tight_layout()
    fname = out_dir / f'heatmap_{_safe_name(session["roomName"])}.png'
    fig.savefig(fname, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f'  Saved: {fname}')


def plot_cross_session_heatmap(sessions, out_dir):
    """
    Averages accuracy by segment position across all sessions.
    Useful for recurring lectures (Day 1, Day 2, ...) — shows which
    position in the lecture consistently confuses students.
    """
    tested = [s for s in sessions if s.get('segments')]
    if len(tested) < 2:
        print('  [skip] cross-session heatmap needs at least 2 sessions with segments.')
        return

    # Find max segment count
    max_segs = max(len(s['segments']) for s in tested)

    acc_by_pos = defaultdict(list)
    cnt_by_pos = defaultdict(int)
    for s in tested:
        for seg in s['segments']:
            pos = seg['segmentIndex']
            if seg['avgAccuracy'] is not None and seg['responseCount'] >= MIN_RESPONSES:
                acc_by_pos[pos].append(seg['avgAccuracy'])
                cnt_by_pos[pos] += seg['responseCount']

    positions = sorted(acc_by_pos.keys())
    means     = [np.mean(acc_by_pos[p]) for p in positions]
    sessions_count = [len(acc_by_pos[p]) for p in positions]

    fig, ax = plt.subplots(figsize=(max(10, len(positions) * 1.4), 6))
    colors  = [_accuracy_color(m) for m in means]
    bars    = ax.bar(range(len(positions)), [m * 100 for m in means],
                     color=colors, edgecolor='white', linewidth=1.2, alpha=0.9, width=0.7)

    for i, (bar, m, sc) in enumerate(zip(bars, means, sessions_count)):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 1,
            f'{m*100:.0f}%\n({sc} sess.)',
            ha='center', va='bottom', fontsize=8, fontweight='bold',
        )

    ax.axhline(THRESH_RED * 100,    color='#e74c3c', linestyle='--', alpha=0.4)
    ax.axhline(THRESH_YELLOW * 100, color='#f39c12', linestyle='--', alpha=0.4)
    ax.set_xticks(range(len(positions)))
    ax.set_xticklabels([f'Segment {p}' for p in positions], fontsize=9)
    ax.set_ylim(0, 110)
    ax.set_xlabel('Segment Position in Lecture', fontsize=11)
    ax.set_ylabel('Avg Accuracy across Sessions (%)', fontsize=11)
    ax.set_title(
        f'Cross-Session Heatmap — {len(tested)} sessions',
        fontsize=13, fontweight='bold', pad=12,
    )
    ax.grid(axis='y', alpha=0.25)
    _make_colorbar_legend(ax)

    plt.tight_layout()
    fname = out_dir / 'cross_session_heatmap.png'
    fig.savefig(fname, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f'  Saved: {fname}')

# ─────────────────────────────────────────────────────────────────────────────
# CSV exports
# ─────────────────────────────────────────────────────────────────────────────

def export_csvs(sessions, out_dir):
    """Export flat CSVs suitable for Excel / R / SPSS."""
    rows = []
    summary_rows = []

    for s in sessions:
        seg_texts = [seg.get('transcriptText', '') for seg in s['segments']]
        kws_list  = extract_keywords(seg_texts) if seg_texts else []

        for i, seg in enumerate(s['segments']):
            kws = kws_list[i] if i < len(kws_list) else []
            rows.append({
                'roomId':          s['roomId'],
                'roomName':        s['roomName'],
                'date':            s.get('date'),
                'segmentIndex':    seg['segmentIndex'],
                'wordCount':       seg['wordCount'],
                'duration_s':      seg.get('duration', 0),
                'questionCount':   seg['questionCount'],
                'responseCount':   seg['responseCount'],
                'correctCount':    seg['correctCount'],
                'avgAccuracy':     seg['avgAccuracy'],
                'avgAccuracy_pct': seg['avgAccuracy_pct'],
                'keywords':        ', '.join(kws),
                'transcriptSnippet': seg.get('transcriptSnippet', '')[:200],
            })

        hs = s.get('hardestSegment')
        summary_rows.append({
            'roomId':          s['roomId'],
            'roomName':        s['roomName'],
            'date':            s.get('date'),
            'totalSegments':   s['totalSegments'],
            'testedSegments':  s['testedSegments'],
            'hardestSegment':  hs['segmentIndex'] if hs else None,
            'hardestAccuracy': hs['avgAccuracy_pct'] if hs else None,
            'overallAccuracy': (
                round(
                    sum(r['correctCount'] for r in s['segments']) /
                    sum(r['responseCount'] for r in s['segments']) * 100, 1
                )
                if sum(r['responseCount'] for r in s['segments']) > 0 else None
            ),
        })

    seg_df  = pd.DataFrame(rows)
    sum_df  = pd.DataFrame(summary_rows)
    seg_df.to_csv(out_dir / 'segment_difficulty.csv',  index=False)
    sum_df.to_csv(out_dir / 'session_summary.csv',     index=False)
    print(f'  Saved: {out_dir}/segment_difficulty.csv  ({len(rows)} rows)')
    print(f'  Saved: {out_dir}/session_summary.csv     ({len(summary_rows)} rows)')

# ─────────────────────────────────────────────────────────────────────────────
# Console report
# ─────────────────────────────────────────────────────────────────────────────

def print_report(sessions):
    SEP = '=' * 68
    print(f'\n{SEP}')
    print('  LECTURE SEGMENT DIFFICULTY REPORT')
    print(SEP)

    for s in sessions:
        segs = s['segments']
        tested = [sg for sg in segs if sg['avgAccuracy'] is not None]
        print(f"\n  {s['roomName']}  ({s.get('date', 'n/a')})")
        print(f"  Segments: {s['totalSegments']} total, {s['testedSegments']} tested")

        if not tested:
            print('  No tested segments.')
            continue

        print(f"\n  {'Seg':>4}  {'Accuracy':>9}  {'Responses':>9}  {'Status':<12}  Keywords")
        print('  ' + '-' * 65)
        seg_texts = [sg.get('transcriptText', '') for sg in segs]
        kws_list  = extract_keywords(seg_texts) if seg_texts else []

        for i, sg in enumerate(segs):
            acc = sg['avgAccuracy_pct']
            if acc is None:
                status = 'not tested'
                acc_str = '   —'
            elif acc < THRESH_RED * 100:
                status = '🔴 struggling'
            elif acc < THRESH_YELLOW * 100:
                status = '🟡 borderline'
            else:
                status = '✅ good'
            acc_str = f'{acc:>7.1f}%' if acc is not None else '      —'

            kws = kws_list[i] if i < len(kws_list) else []
            kw_str = ', '.join(kws[:3]) if kws else ''
            print(f"  {sg['segmentIndex']:>4}  {acc_str}  {sg['responseCount']:>9}  {status:<13}  {kw_str}")

        hs = s.get('hardestSegment')
        if hs:
            print(f"\n  Hardest segment: Seg {hs['segmentIndex']}  "
                  f"({hs['avgAccuracy_pct']}% correct)")

    print(f'\n{SEP}\n')

# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description='Spandan — Lecture Segment Difficulty Heatmap',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument('--api-url', default=DEFAULT_API_URL,
                    help='Base API URL (default: https://samagama.in/spandan/api)')
    ap.add_argument('--key',
                    help='Research API key  (RESEARCH_API_KEY from backend/.env)')
    ap.add_argument('--room-id',
                    help='Analyse a single room (MongoDB ObjectId)')
    ap.add_argument('--json',
                    help='Path to a local JSON file — offline mode, skips the API')
    ap.add_argument('--limit', type=int, default=200,
                    help='Max sessions to fetch in bulk mode (default 200)')
    ap.add_argument('--no-keywords', action='store_true',
                    help='Skip keyword extraction (faster, no sklearn needed)')
    args = ap.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)

    if not _TFIDF_AVAILABLE and not args.no_keywords:
        print('  [info] sklearn not found — using simple word-frequency keywords.')
        print('         Install with:  pip install scikit-learn')

    # ── load data ──
    if args.json:
        print(f'Loading from file: {args.json}')
        sessions = load_json(args.json)
    elif args.key:
        if args.room_id:
            print(f'Fetching single room: {args.room_id}')
            session = fetch_single_room(args.api_url, args.key, args.room_id)
            sessions = [session] if session else []
        else:
            print(f'Fetching all sessions from: {args.api_url}')
            sessions = fetch_all_rooms(args.api_url, args.key, args.limit)
    else:
        ap.error('Provide --key (live API) or --json (offline).  Run with -h for help.')

    sessions = [s for s in sessions if s.get('segments')]
    if not sessions:
        sys.exit('No sessions with segment data found.')

    print(f'\nAnalysing {len(sessions)} session(s) ...')

    # ── per-session heatmaps ──
    for s in sessions:
        seg_texts = [sg.get('transcriptText', '') for sg in s['segments']]
        kws_list  = (
            extract_keywords(seg_texts)
            if seg_texts and not args.no_keywords
            else [[] for _ in seg_texts]
        )
        plot_session_heatmap(s, kws_list, OUTPUT_DIR)

    # ── cross-session heatmap ──
    if len(sessions) > 1:
        print('Generating cross-session heatmap ...')
        plot_cross_session_heatmap(sessions, OUTPUT_DIR)

    # ── CSV exports ──
    print('Exporting CSVs ...')
    export_csvs(sessions, OUTPUT_DIR)

    # ── console report ──
    print_report(sessions)
    print(f'All outputs saved to -> ./{OUTPUT_DIR}/\n')


if __name__ == '__main__':
    main()
