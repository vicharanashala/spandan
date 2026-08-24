"""
Lecture Segment Difficulty Heatmap
----------------------------------

Fetches segment-level difficulty data from the Spandan research API
and generates:

    analysis/output/segment_heatmap.png
    analysis/output/segment_difficulty.csv

Usage:
    python analysis/segment_heatmap.py \
        --key YOUR_RESEARCH_API_KEY \
        --room-id ROOM_ID

Optional:
    --base-url http://localhost:5000/api/research
"""

import argparse
import csv
import os
import sys

import matplotlib.pyplot as plt
import requests


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate a lecture segment difficulty heatmap."
    )

    parser.add_argument(
        "--key",
        required=True,
        help="Research API key used by the X-Research-Key header.",
    )

    parser.add_argument(
        "--room-id",
        required=True,
        help="MongoDB Room ID of the session to analyse.",
    )

    parser.add_argument(
        "--base-url",
        default="http://localhost:5000/api/research",
        help="Base URL of the research API.",
    )

    return parser.parse_args()


def fetch_segment_data(base_url, api_key, room_id):
    url = f"{base_url.rstrip('/')}/segment-difficulty"

    headers = {
        "X-Research-Key": api_key,
    }

    params = {
        "roomId": room_id,
    }

    try:
        response = requests.get(
            url,
            headers=headers,
            params=params,
            timeout=30,
        )
    except requests.RequestException as exc:
        raise RuntimeError(
            f"Could not connect to research API: {exc}"
        ) from exc

    if response.status_code != 200:
        try:
            error = response.json()
        except ValueError:
            error = response.text

        raise RuntimeError(
            f"Research API returned HTTP {response.status_code}: {error}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise RuntimeError(
            "Research API returned invalid JSON."
        ) from exc

    if not isinstance(data, dict):
        raise RuntimeError(
            "Unexpected API response format."
        )

    segments = data.get("segments", [])

    if not isinstance(segments, list):
        raise RuntimeError(
            "Invalid 'segments' field in API response."
        )

    return data


def save_csv(data, output_path):
    segments = data.get("segments", [])

    os.makedirs(
        os.path.dirname(output_path),
        exist_ok=True,
    )

    fieldnames = [
        "segmentIndex",
        "transcriptSnippet",
        "accuracy",
        "questionCount",
        "responseCount",
        "wordCount",
    ]

    with open(
        output_path,
        "w",
        newline="",
        encoding="utf-8",
    ) as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=fieldnames,
            extrasaction="ignore",
        )

        writer.writeheader()

        for segment in segments:
            accuracy = segment.get("avgAccuracy")

            if accuracy is None:
                accuracy = ""

            writer.writerow(
                {
                    "segmentIndex": segment.get("segmentIndex"),
                    "transcriptSnippet": segment.get(
                        "transcriptText",
                        "",
                    ),
                    "accuracy": accuracy,
                    "questionCount": segment.get(
                        "questionCount",
                        0,
                    ),
                    "responseCount": segment.get(
                        "responseCount",
                        0,
                    ),
                    "wordCount": segment.get(
                        "wordCount",
                        0,
                    ),
                }
            )


def accuracy_percent(segment):
    value = segment.get("avgAccuracy")

    if value is None:
        value = segment.get("avgAccuracy_pct")

        if value is None:
            return None

        return float(value)

    value = float(value)

    if value <= 1:
        return value * 100

    return value


def make_heatmap(data, output_path):
    segments = data.get("segments", [])

    if not segments:
        raise RuntimeError(
            "No segment data was returned for this room."
        )

    indexes = []
    accuracies = []
    labels = []

    for segment in segments:
        index = segment.get("segmentIndex")

        if index is None:
            continue

        accuracy = accuracy_percent(segment)

        if accuracy is None:
            continue

        indexes.append(int(index))
        accuracies.append(max(0.0, min(100.0, accuracy)))

        transcript = str(
            segment.get("transcriptText") or ""
        ).strip()

        # Keep chart labels short so long transcripts
        # do not make the chart unreadable.
        snippet = " ".join(
            transcript.split()
        )

        if len(snippet) > 45:
            snippet = snippet[:45] + "..."

        labels.append(
            f"Segment {index}\n{snippet}"
        )

    if not indexes:
        raise RuntimeError(
            "No valid accuracy values were returned."
        )

    fig_width = max(
        10,
        min(24, len(indexes) * 2.2),
    )

    fig, ax = plt.subplots(
        figsize=(fig_width, 7)
    )

    # Each segment becomes one vertical bar.
    bars = ax.bar(
        indexes,
        accuracies,
        width=0.8,
    )

    # Colour each bar according to accuracy.
    # Low accuracy = difficult segment.
    for bar, accuracy in zip(
        bars,
        accuracies,
    ):
        if accuracy < 50:
            bar.set_color("red")
        elif accuracy < 70:
            bar.set_color("gold")
        else:
            bar.set_color("green")

    ax.set_title(
        "Lecture Segment Difficulty Heatmap"
    )

    ax.set_xlabel(
        "Lecture Segment"
    )

    ax.set_ylabel(
        "Average Accuracy (%)"
    )

    ax.set_ylim(
        0,
        100,
    )

    ax.set_xticks(indexes)

    ax.set_xticklabels(
        [
            f"Segment {index}"
            for index in indexes
        ],
        rotation=45,
        ha="right",
    )

    ax.grid(
        axis="y",
        linestyle="--",
        alpha=0.3,
    )

    # Add accuracy value above every bar.
    for bar, accuracy in zip(
        bars,
        accuracies,
    ):
        ax.text(
            bar.get_x()
            + bar.get_width() / 2,
            min(accuracy + 2, 98),
            f"{accuracy:.1f}%",
            ha="center",
            va="bottom",
            fontsize=9,
        )

    # Add a small legend explaining the thresholds.
    ax.text(
        0.01,
        0.97,
        "Green ≥ 70%   |   Yellow 50–69%   |   Red < 50%",
        transform=ax.transAxes,
        va="top",
        fontsize=10,
    )

    fig.tight_layout()

    os.makedirs(
        os.path.dirname(output_path),
        exist_ok=True,
    )

    fig.savefig(
        output_path,
        dpi=180,
        bbox_inches="tight",
    )

    plt.close(fig)


def main():
    args = parse_args()

    output_dir = os.path.join(
        "analysis",
        "output",
    )

    csv_path = os.path.join(
        output_dir,
        "segment_difficulty.csv",
    )

    image_path = os.path.join(
        output_dir,
        "segment_heatmap.png",
    )

    print(
        f"Fetching segment data for room: {args.room_id}"
    )

    try:
        data = fetch_segment_data(
            args.base_url,
            args.key,
            args.room_id,
        )

        save_csv(
            data,
            csv_path,
        )

        make_heatmap(
            data,
            image_path,
        )

    except RuntimeError as exc:
        print(
            f"Error: {exc}",
            file=sys.stderr,
        )
        return 1

    room_name = data.get(
        "roomName",
        "Unknown room",
    )

    segment_count = len(
        data.get("segments", [])
    )

    print()
    print("Segment analysis completed successfully.")
    print(f"Room: {room_name}")
    print(f"Segments: {segment_count}")
    print(f"CSV: {csv_path}")
    print(f"Heatmap: {image_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())