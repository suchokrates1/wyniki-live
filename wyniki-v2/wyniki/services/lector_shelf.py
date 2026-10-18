"""Stitching sentence clips, and filling a shelf of shared bricks."""
from __future__ import annotations

import subprocess
from pathlib import Path


def stitch_chunks(paths: list[Path], dest: Path) -> None:
    """Join sentence clips with a short breath between them."""
    if not paths:
        raise RuntimeError("nothing to stitch")
    dest.parent.mkdir(parents=True, exist_ok=True)
    temporary = dest.with_suffix(".tmp.mp3")
    if len(paths) == 1:
        temporary.write_bytes(paths[0].read_bytes())
        temporary.replace(dest)
        return
    filters = []
    labels = []
    for index in range(len(paths)):
        if index < len(paths) - 1:
            filters.append(f"[{index}:a]apad=pad_dur=0.06[a{index}]")
        else:
            filters.append(f"[{index}:a]anull[a{index}]")
        labels.append(f"[a{index}]")
    filters.append(f"{''.join(labels)}concat=n={len(paths)}:v=0:a=1[out]")
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    for path in paths:
        command.extend(["-i", str(path)])
    command.extend(["-filter_complex", ";".join(filters), "-map", "[out]", "-c:a", "libmp3lame", "-q:a", "4", str(temporary)])
    try:
        subprocess.run(command, check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or b"").decode("utf-8", "replace")[:240]
        raise RuntimeError(f"lector stitch failed: {detail}") from None
    temporary.replace(dest)


def warm_shelf(
    sentences: list[str],
    *,
    speaker=None,
    character_budget: int | None = None,
    language: str = "pl",
) -> dict:
    """Create missing shared bricks. Stops before the character budget is passed."""
    from .court_lector import chunk_path, ensure_chunk, speak_sentence
    from .lector_speech import court_line

    speaker = speaker or speak_sentence
    opener = "Kort jeden." if language == "pl" else (court_line("1", language) or "")
    created = skipped = spent = 0
    for index, sentence in enumerate(sentences):
        if character_budget is not None and spent + len(sentence) > character_budget:
            return {"created": created, "skipped": skipped, "spent": spent, "left": len(sentences) - index}
        path = chunk_path(sentence, None, None, shared=True, language=language)
        if path.is_file() and path.stat().st_size > 0:
            skipped += 1
            continue
        previous = None if sentence == opener else opener
        ensure_chunk(sentence, previous, None, speaker=speaker, shared=True, language=language)
        created += 1
        spent += len(sentence)
    return {"created": created, "skipped": skipped, "spent": spent, "left": 0}
