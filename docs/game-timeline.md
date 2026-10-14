# Game Timeline

`/game-timeline/` presents all 161 non-empty unit cells and 69 period columns
from the supplied timeline PDF. Its SHA-256 is retained in the structured data
for provenance. The PDF itself is not hosted.

The source's upper two rows are Conquest units, its middle three rows are
Marquees, and its bottom row contains Journey Guide units (categories confirmed
by the site owner). Original spellings, repeated names, year boundaries,
empty periods and multi-period spans are retained.

Run `python scripts/extract-game-timeline.py /path/to/source.pdf` with pdfplumber
installed to regenerate the dataset from a local copy of the original PDF. Extraction uses cell geometry,
not the PDF's interleaved reading order, and fails if any non-space source
glyph is unaccounted for. Then run `npm run cache:bust` and `npm test`.

Months use calendar lengths, including leap years. Episodes use 28 days;
eras contain the episodes shown in the source. Episode Marquee rows one and
two are modeled as day 1 and day 14, as requested by the owner. Other rows
have no modeled day. No exact calendar date is inferred for episodes.

Analysis counts a spanning unit once at its first source period. The combined
000 and BT-1 cell counts as two units; IG-12 and Grogu remains one unit.
Per-28-day rates use total units / covered days × 28. Fluctuation is the
population standard deviation of per-period normalized rates. Empty periods
mean missing entries in this source, not independently verified zero releases.
Year filtering retains overlapping spans in the archive, whereas the chart
counts only starts within that year. Search affects only the archive.

Squads remains available through existing bookmarks and preserves saved
plans. It is hidden from site navigation and the sitemap, with noindex set.
