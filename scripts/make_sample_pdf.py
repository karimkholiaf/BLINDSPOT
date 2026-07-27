"""Generate the demo source document: public/sample-lecture.pdf.

A six-page university-style lecture handout on algorithmic complexity, used as
sample input for the document-understanding pipeline. All prose is original.

Usage:
    python -m pip install reportlab pypdf
    python scripts/make_sample_pdf.py

The script rebuilds the PDF in place and then verifies that a real, extractable
text layer was produced (pypdf is optional; verification is skipped if absent).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# --------------------------------------------------------------------------
# Paths and palette
# --------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "public" / "sample-lecture.pdf"

INK = colors.Color(0.10, 0.11, 0.13)
HEADING = colors.Color(0.09, 0.20, 0.33)
MUTED = colors.Color(0.36, 0.39, 0.43)
RULE = colors.Color(0.70, 0.74, 0.78)
HAIRLINE = colors.Color(0.82, 0.85, 0.88)
CODE_BG = colors.Color(0.957, 0.965, 0.973)
BOX_BG = colors.Color(0.945, 0.957, 0.969)
TABLE_HEAD_BG = colors.Color(0.90, 0.92, 0.94)
TABLE_ALT_BG = colors.Color(0.972, 0.977, 0.982)

FOOTER_LEFT = "COMP2 · Data Structures and Algorithms · Handout 4"
RUNNING_HEAD = "Lecture 4: Algorithmic Complexity"

MARGIN_X = 2.4 * cm
MARGIN_TOP = 1.9 * cm
MARGIN_BOTTOM = 2.0 * cm

# --------------------------------------------------------------------------
# Styles
# --------------------------------------------------------------------------

_base = getSampleStyleSheet()

S = {
    "kicker": ParagraphStyle(
        "kicker",
        parent=_base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=MUTED,
        spaceAfter=2,
    ),
    "title": ParagraphStyle(
        "title",
        parent=_base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=19,
        leading=23,
        textColor=HEADING,
        spaceBefore=6,
        spaceAfter=3,
    ),
    "subtitle": ParagraphStyle(
        "subtitle",
        parent=_base["Normal"],
        fontName="Times-Italic",
        fontSize=11.5,
        leading=14,
        textColor=MUTED,
        spaceAfter=8,
    ),
    "meta": ParagraphStyle(
        "meta",
        parent=_base["Normal"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=11.5,
        textColor=MUTED,
    ),
    "h2": ParagraphStyle(
        "h2",
        parent=_base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=15,
        textColor=HEADING,
        spaceBefore=12,
        spaceAfter=4,
        keepWithNext=1,
    ),
    "h3": ParagraphStyle(
        "h3",
        parent=_base["Normal"],
        fontName="Helvetica-BoldOblique",
        fontSize=10.2,
        leading=12.5,
        textColor=HEADING,
        spaceBefore=8,
        spaceAfter=2,
        keepWithNext=1,
    ),
    "body": ParagraphStyle(
        "body",
        parent=_base["Normal"],
        fontName="Times-Roman",
        fontSize=11,
        leading=14.1,
        textColor=INK,
        alignment=TA_JUSTIFY,
        spaceAfter=6,
    ),
    "bullet": ParagraphStyle(
        "bullet",
        parent=_base["Normal"],
        fontName="Times-Roman",
        fontSize=10.4,
        leading=13.4,
        textColor=INK,
        alignment=TA_JUSTIFY,
        spaceAfter=2.5,
    ),
    "definition": ParagraphStyle(
        "definition",
        parent=_base["Normal"],
        fontName="Times-Roman",
        fontSize=10.6,
        leading=14,
        textColor=INK,
        alignment=TA_JUSTIFY,
    ),
    "caption": ParagraphStyle(
        "caption",
        parent=_base["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=8.4,
        leading=10.5,
        textColor=MUTED,
        spaceBefore=3,
        spaceAfter=8,
    ),
    "code": ParagraphStyle(
        "code",
        parent=_base["Normal"],
        fontName="Courier",
        fontSize=8.4,
        leading=10.8,
        textColor=INK,
    ),
    "th": ParagraphStyle(
        "th",
        parent=_base["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.8,
        leading=11,
        textColor=HEADING,
    ),
    "td": ParagraphStyle(
        "td",
        parent=_base["Normal"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=11,
        textColor=INK,
    ),
    "tdr": ParagraphStyle(
        "tdr",
        parent=_base["Normal"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=11,
        textColor=INK,
        alignment=TA_RIGHT,
    ),
}

# --------------------------------------------------------------------------
# Flowable helpers
# --------------------------------------------------------------------------


def p(text: str) -> Paragraph:
    return Paragraph(text, S["body"])


def h2(text: str) -> Paragraph:
    return Paragraph(text, S["h2"])


def h3(text: str) -> Paragraph:
    return Paragraph(text, S["h3"])


def caption(text: str) -> Paragraph:
    return Paragraph(text, S["caption"])


def bullets(items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(Paragraph(t, S["bullet"]), leftIndent=16) for t in items],
        bulletType="bullet",
        bulletFontName="Helvetica",
        bulletFontSize=7,
        bulletOffsetY=1.5,
        start="•",
        leftIndent=14,
        spaceBefore=1,
        spaceAfter=6,
    )


def code(text: str, width: float) -> KeepTogether:
    """A monospaced pseudocode block in a lightly shaded box."""
    escaped = text.strip("\n").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    block = Table(
        [[Preformatted(escaped, S["code"])]],
        colWidths=[width],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                ("BOX", (0, 0), (-1, -1), 0.5, HAIRLINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        ),
    )
    return KeepTogether([Spacer(1, 1), block, Spacer(1, 7)])


def callout(text: str, width: float) -> KeepTogether:
    """A boxed definition / key-point block."""
    box = Table(
        [[Paragraph(text, S["definition"])]],
        colWidths=[width],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BOX_BG),
                ("BOX", (0, 0), (-1, -1), 0.6, RULE),
                ("LINEBEFORE", (0, 0), (0, -1), 2.2, HEADING),
                ("LEFTPADDING", (0, 0), (-1, -1), 11),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        ),
    )
    return KeepTogether([Spacer(1, 2), box, Spacer(1, 8)])


def data_table(header: list[str], rows: list[list[str]], col_widths: list[float],
               right_align_from: int = 99) -> Table:
    def cell(text: str, col: int, head: bool) -> Paragraph:
        if head:
            return Paragraph(text, S["th"])
        return Paragraph(text, S["tdr"] if col >= right_align_from else S["td"])

    data = [[cell(t, i, True) for i, t in enumerate(header)]]
    data += [[cell(t, i, False) for i, t in enumerate(r)] for r in rows]

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEAD_BG),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("BOX", (0, 0), (-1, -1), 0.5, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, HAIRLINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), TABLE_ALT_BG))

    return Table(data, colWidths=col_widths, style=TableStyle(style), hAlign="LEFT",
                 repeatRows=1)


# --------------------------------------------------------------------------
# Page furniture
# --------------------------------------------------------------------------


class NumberedCanvas(pdfcanvas.Canvas):
    """Defers page output so the footer can print 'Page x of y'."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_states = []

    def showPage(self):
        self._saved_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_states)
        for state in self._saved_states:
            self.__dict__.update(state)
            self._draw_footer(total)
            super().showPage()
        super().save()

    def _draw_footer(self, total: int):
        width, _ = A4
        y = 1.15 * cm
        self.saveState()
        self.setStrokeColor(HAIRLINE)
        self.setLineWidth(0.5)
        self.line(MARGIN_X, y + 11, width - MARGIN_X, y + 11)
        self.setFont("Helvetica", 8)
        self.setFillColor(MUTED)
        self.drawString(MARGIN_X, y, FOOTER_LEFT)
        self.drawRightString(width - MARGIN_X, y, f"Page {self._pageNumber} of {total}")
        self.restoreState()


def later_pages(canv, doc):
    width, height = A4
    canv.saveState()
    canv.setFont("Helvetica-Oblique", 8)
    canv.setFillColor(MUTED)
    canv.drawRightString(width - MARGIN_X, height - 1.35 * cm, RUNNING_HEAD)
    canv.setStrokeColor(HAIRLINE)
    canv.setLineWidth(0.5)
    canv.line(MARGIN_X, height - 1.55 * cm, width - MARGIN_X, height - 1.55 * cm)
    canv.restoreState()


def first_page(canv, doc):
    return None


# --------------------------------------------------------------------------
# Content
# --------------------------------------------------------------------------


def build_story(w: float) -> list:
    st: list = []

    # ---------------- Title block ----------------
    st.append(Paragraph("COMP2 · DATA STRUCTURES AND ALGORITHMS", S["kicker"]))
    st.append(HRFlowable(width="100%", thickness=1.6, color=HEADING, spaceBefore=3,
                         spaceAfter=1))
    st.append(Paragraph("Lecture 4: Algorithmic Complexity", S["title"]))
    st.append(Paragraph(
        "Growth rates, asymptotic notation, and what they do and do not tell us",
        S["subtitle"]))
    st.append(Table(
        [[Paragraph("Handout 4 of 11 · Department of Computer Science<br/>"
                    "Lecture: Tuesday, 11:00 · Lab session: Thursday, 14:00", S["meta"]),
          Paragraph("Prerequisite: Lecture 3 (arrays, lists, recursion)<br/>"
                    "Assessed by: Coursework 1, question 2", S["meta"])]],
        colWidths=[w * 0.55, w * 0.45],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]),
        hAlign="LEFT"))
    st.append(HRFlowable(width="100%", thickness=0.6, color=RULE, spaceBefore=8,
                         spaceAfter=10))

    st.append(p(
        "These notes accompany Lecture 4 and are written to be read on their own, so "
        "the worked examples are given in full rather than left on the whiteboard. "
        "Everything here is examinable. The exercises at the end are not marked, but "
        "question 2 of Coursework 1 assumes you have attempted them."))

    st.append(h3("Learning outcomes"))
    st.append(bullets([
        "State the definition of Big-O notation and apply it to a polynomial cost function.",
        "Order the common complexity classes by growth rate and predict how each responds "
        "to a change in input size.",
        "Distinguish best-case, average-case and worst-case analysis, and say which one a "
        "particular engineering decision depends on.",
        "Explain why an asymptotic classification does not by itself determine which of two "
        "algorithms runs faster on a given input.",
        "Distinguish auxiliary space from total space, and classify a sorting algorithm as "
        "in-place or out-of-place.",
    ]))

    # ---------------- 1 ----------------
    st.append(h2("1. Why we measure complexity"))
    st.append(p(
        "Two students submit programs that solve the same problem. On the same test file, "
        "one finishes in 0.8 seconds and the other in 2.1 seconds. It is tempting to "
        "conclude that the first student has the better algorithm. That conclusion is not "
        "supported by the measurement. What was measured is the behaviour of one "
        "implementation, written in one language, compiled with one set of options, running "
        "on one machine, against one input. Change any of those and the ranking can change."))
    st.append(p(
        "The confounding factors are numerous. Processor speed and instruction set matter. So "
        "does the memory hierarchy: an algorithm whose working set fits in cache can beat one "
        "that does fewer operations but scatters them across memory. Compiler optimisation "
        "level matters, sometimes by a factor of three. Choice of language matters enormously, "
        "since a careless program in a compiled language routinely outruns a careful one in an "
        "interpreted language by a factor of thirty or more, which is easily enough to "
        "disguise a genuinely worse method."))
    st.append(p(
        "We want to compare the methods, not the circumstances, so the standard approach "
        "abstracts away from the machine entirely. Choose a measure of input size, normally "
        "written n: the number of elements in an array, the number of vertices and edges in a "
        "graph. Choose an elementary operation that dominates the work, such as a comparison "
        "in a sorting routine. Then count how many times that operation is performed as a "
        "function of n, and call the result T(n). Because T(n) counts operations rather than "
        "seconds, it is the same whoever compiles the program and whatever hardware they run "
        "it on."))
    st.append(p(
        "There is a second, more practical reason to work this way. A stopwatch reading tells "
        "you about the input you happened to try; a cost function tells you what will happen "
        "when the input is a thousand times larger. Systems are rarely retired because they "
        "are too slow on today's data. They are retired because the data grew and the cost "
        "grew faster, and complexity analysis is the tool that lets you see that coming while "
        "the system still looks healthy."))
    st.append(p(
        "A small example shows what this buys us. Suppose algorithm A performs 100n "
        "elementary operations and algorithm B performs n². For n = 10, A does 1,000 "
        "operations and B does 100, so B is ten times cheaper. At n = 100 they are level, at "
        "10,000 operations each. For n = 1,000, A does 100,000 and B does 1,000,000, so A is "
        "now ten times cheaper, and the gap keeps widening. Neither algorithm is simply "
        "\"the fast one\": which is faster depends on n, and the two curves cross at a "
        "specific place. Keep this example in mind; we return to the crossing point in "
        "Section 5."))

    # ---------------- 2 ----------------
    st.append(h2("2. Big-O notation"))
    st.append(p(
        "Counting exact operations is still more detail than we usually want. The counts "
        "3n² + 5n + 100 and 7n² + 2n + 4 describe algorithms that behave the same way "
        "as n grows, even though the numbers differ. Big-O notation expresses that shared "
        "behaviour and discards the rest."))
    st.append(callout(
        "<b>Definition.</b> Let f and g be functions from the positive integers to the "
        "non-negative reals. We say that <i>f(n) is O(g(n))</i> if there exist a constant "
        "c &gt; 0 and an integer n<sub>0</sub> &ge; 1 such that f(n) &le; c · g(n) for "
        "every n &ge; n<sub>0</sub>.", w))
    st.append(p(
        "In words: from some point onwards, f is bounded above by a constant multiple of g. "
        "Three features of that definition deserve to be read carefully, because each of them "
        "limits what a Big-O statement is entitled to claim."))
    st.append(p(
        "<b>It is an upper bound, not an exact description.</b> The definition says f grows "
        "<i>no faster than</i> g; it does not say f grows as fast as g. A function that is "
        "O(n) is also, correctly, O(n²) and O(2<super>n</super>), because a loose bound "
        "is still a bound. By convention we quote the tightest bound we can establish, which "
        "is why saying \"binary search is O(n²)\" would be true but useless."))
    st.append(p(
        "<b>It is asymptotic.</b> The definition constrains f only for n ≥ "
        "n<sub>0</sub>, and it does not say how large n<sub>0</sub> is. Below that threshold "
        "the inequality is allowed to fail completely, and the notation makes no claim of any "
        "kind about what happens there. The constant c is similarly unconstrained; it may be "
        "2, or it may be two million. Section 5 is about the consequences of these two "
        "silences."))
    st.append(p(
        "<b>It describes growth rate, not speed.</b> This is the point most often lost. "
        "Big-O measures growth rate, not speed: it tells you how the running time scales as "
        "the input size increases, not how many seconds the algorithm takes on any particular "
        "machine. Two algorithms in the same Big-O class can differ in real running time by a "
        "factor of a hundred, because the constant factor that separates them is exactly what "
        "the notation throws away. Because the constant factor is discarded, an algorithm "
        "with a better Big-O classification is not guaranteed to be faster than one with a "
        "worse classification on any particular input; the classification only tells you "
        "which one must eventually win as n grows without bound."))

    st.append(h3("Dropping constants and lower-order terms"))
    st.append(p(
        "In practice we do not work from the definition every time. We simplify a cost "
        "function by two rules: discard all constant multipliers, and discard every term "
        "except the fastest-growing one. So 3n² + 5n + 100 is O(n²). The 3 goes "
        "because constant multipliers are dropped; the 5n and the 100 go because they are "
        "lower-order terms, dominated by n²."))
    st.append(p(
        "The justification is arithmetic. As n grows, the quadratic term takes over "
        "completely:"))
    st.append(data_table(
        ["n", "3n²", "5n", "100", "total T(n)", "share from 3n²"],
        [
            ["10", "300", "50", "100", "450", "66.7%"],
            ["100", "30,000", "500", "100", "30,600", "98.0%"],
            ["1,000", "3,000,000", "5,000", "100", "3,005,100", "99.8%"],
        ],
        col_widths=[w * 0.10, w * 0.19, w * 0.13, w * 0.11, w * 0.24, w * 0.23],
        right_align_from=1,
    ))
    st.append(caption(
        "Table 1. Contribution of each term of T(n) = 3n² + 5n + 100. By n = 1,000 the "
        "linear and constant terms together account for less than a fifth of one percent of "
        "the total."))
    st.append(p(
        "To confirm it formally we need only exhibit a c and an n<sub>0</sub>. For every "
        "n ≥ 1 we have 5n ≤ 5n² and 100 ≤ 100n², so 3n² + 5n + "
        "100 ≤ 3n² + 5n² + 100n² = 108n². Taking c = 108 and "
        "n<sub>0</sub> = 1 satisfies the definition, and therefore T(n) is O(n²). A "
        "tighter pair also works: for n ≥ 10, T(n) ≤ 4.5n², with c = 4.5 and "
        "n<sub>0</sub> = 10. Both are valid, because the definition asks for the existence of "
        "some c and n<sub>0</sub> rather than the best ones."))
    st.append(p(
        "It is worth being explicit about why discarding the constants is legitimate, because "
        "the same step is what makes the result blunt. The constant multiplier reflects how "
        "much a single elementary step costs on a given machine with a given compiler, and "
        "those are precisely the factors Section 1 set out to eliminate; removing them is "
        "what makes the classification portable. The price is that the classification then "
        "retains no information at all about the regime in which those constants dominate. "
        "Big-O answers one question, namely how cost scales with input size, and it answers "
        "no other question."))
    st.append(p(
        "Two companions to Big-O appear in the literature. Ω(g(n)) is the mirror image, "
        "an asymptotic <i>lower</i> bound, meaning f grows at least as fast as g. "
        "Θ(g(n)) means both at once, an asymptotically tight bound, and is the honest "
        "notation when we know the growth rate exactly rather than merely bounding it above. "
        "Informally most engineers write \"O\" where they mean \"Θ\", but you should "
        "know the difference when you read a proof."))

    # ---------------- 3 ----------------
    st.append(h2("3. The growth-rate hierarchy"))
    st.append(p(
        "A small number of complexity classes account for most of the algorithms you will "
        "meet. Learning their relative behaviour is more useful than memorising individual "
        "results, because it lets you judge quickly whether a proposed approach is plausible "
        "at the scale you care about."))
    st.append(data_table(
        ["Class", "Name", "Typical example", "n = 10", "n = 100", "n = 1,000",
         "n = 1,000,000"],
        [
            ["O(1)", "constant", "array index; hash lookup", "1", "1", "1", "1"],
            ["O(log n)", "logarithmic", "binary search on sorted data", "3", "7", "10", "20"],
            ["O(n)", "linear", "linear search; one pass over a list", "10", "100", "1,000",
             "10<super>6</super>"],
            ["O(n log n)", "linearithmic", "mergesort; heapsort; quicksort (average)", "33",
             "664", "9,966", "2.0 × 10<super>7</super>"],
            ["O(n²)", "quadratic", "insertion sort; comparing all pairs", "100", "10,000",
             "10<super>6</super>", "10<super>12</super>"],
            ["O(2<super>n</super>)", "exponential", "enumerating all subsets", "1,024",
             "1.3 × 10<super>30</super>", "≈ 10<super>301</super>", "beyond "
             "astronomical"],
        ],
        col_widths=[w * 0.13, w * 0.13, w * 0.28, w * 0.08, w * 0.11, w * 0.11, w * 0.16],
        right_align_from=3,
    ))
    st.append(caption(
        "Table 2. Approximate operation counts by complexity class. Logarithms are base 2 and "
        "figures are rounded."))
    st.append(p(
        "A useful way to internalise the table is to ask what happens when the input doubles. "
        "An O(1) algorithm is unaffected. An O(log n) algorithm performs one extra step. An "
        "O(n) algorithm does twice the work, and an O(n log n) algorithm slightly more than "
        "twice. An O(n²) algorithm does four times the work, so a tenfold increase in "
        "input becomes a hundredfold increase in cost. An O(2<super>n</super>) algorithm "
        "squares its own workload, which is why exponential algorithms hit a wall hardware "
        "cannot move: a machine a thousand times faster buys roughly ten more elements of "
        "input, and then you are stuck again."))
    st.append(p(
        "Two technical notes. The base of the logarithm never appears in the classification, "
        "because changing base multiplies by a constant and constants are dropped, so "
        "O(log n) is unambiguous. And the classes are not equally spaced in practice: the "
        "step from O(n²) to O(n log n) usually decides whether a program is viable on "
        "large data, whereas the step from O(n) to O(n log n) is often invisible, since at "
        "n = 1,000,000 the factor log₂ n is only about 20 and a better implementation "
        "can easily recover that."))

    # ---------------- 4 ----------------
    st.append(h2("4. Best case, average case and worst case"))
    st.append(p(
        "Input size alone does not determine how much work an algorithm does: two arrays of "
        "the same length can send the same routine down very different paths. A complete "
        "analysis therefore reports three quantities, the fewest operations over all inputs "
        "of size n (best case), the most (worst case), and the expected number under some "
        "stated distribution of inputs (average case). These are separate results and are "
        "frequently in different complexity classes."))
    st.append(h3("Linear search"))
    st.append(code(
        """
function LINEAR-SEARCH(A, target):
    for i = 0 to length(A) - 1:
        if A[i] == target:
            return i                 # found it; stop immediately
    return NOT_FOUND                 # fell off the end
""", w))
    st.append(p(
        "The best case is one comparison, when the target sits at index 0, so O(1). The worst "
        "case is n comparisons, when the target is in the last position or absent altogether, "
        "so O(n). For the average case we must state an assumption: if the target is present "
        "and equally likely to be at any index, the expected number of comparisons is "
        "(n + 1) / 2, which is still O(n) once the constant is dropped. An average-case result "
        "is only as trustworthy as the assumption behind it, and a workload in which the same "
        "few records are looked up repeatedly will not match this one."))
    st.append(h3("Quicksort"))
    st.append(code(
        """
function QUICKSORT(A, lo, hi):
    if lo >= hi:
        return                       # zero or one element: already sorted
    p = PARTITION(A, lo, hi)         # choose a pivot, move smaller items left
    QUICKSORT(A, lo, p - 1)          # sort the left part
    QUICKSORT(A, p + 1, hi)          # sort the right part
""", w))
    st.append(p(
        "Each call to PARTITION examines every element between lo and hi once, so the work at "
        "any one level of the recursion is at most n. The total cost is therefore n "
        "multiplied by the depth of the recursion, and everything depends on how well the "
        "pivot splits the array."))
    st.append(p(
        "When pivots land near the median, each call halves the range and the recursion is "
        "about log₂ n levels deep. That gives n × log n work overall, so quicksort "
        "is O(n log n) in the average case, and random inputs are overwhelmingly likely to "
        "behave this way. When pivots land badly the picture changes completely. If the pivot "
        "is always the smallest or largest remaining element, each call removes just one item "
        "and the recursion is n levels deep, giving n + (n - 1) + (n - 2) + ... + 1 = "
        "n(n + 1) / 2 comparisons. So quicksort is O(n log n) on average but O(n²) in "
        "the worst case. The classic way to trigger the worst case is to hand a "
        "last-element-pivot implementation an array that is already sorted, which is an "
        "unfortunately common situation in real systems."))
    st.append(p(
        "Practical implementations defend against this rather than accepting it. Choosing the "
        "pivot at random, or as the median of the first, middle and last elements, makes the "
        "degenerate case vanishingly unlikely to arise by accident. Introsort goes further "
        "and monitors recursion depth, switching to heapsort if the depth exceeds roughly "
        "2 log₂ n, which converts the O(n²) worst case into a hard O(n log n) "
        "guarantee while keeping quicksort's speed on typical input."))
    st.append(p(
        "Which of the three cases you should care about is an engineering question, not a "
        "mathematical one. A batch job that runs overnight cares about the average, because "
        "the occasional bad input is amortised away; a request handler with a hard latency "
        "budget cares about the worst case, because an average is no defence when the "
        "deadline is missed. The best case is rarely decisive on its own, though insertion "
        "sort's O(n) best case on nearly-sorted data is the reason it appears in the next "
        "section at all."))

    # ---------------- 5 ----------------
    st.append(h2("5. Why asymptotic analysis can mislead on small inputs"))
    st.append(p(
        "Return to the definition in Section 2. It guarantees a bound only for n ≥ "
        "n<sub>0</sub>, and it allows the constant c to be arbitrarily large. Both of those "
        "allowances have practical consequences, and together they mean that a Big-O "
        "classification tells you nothing whatsoever about small inputs."))
    st.append(p(
        "The constants that were dropped are not fictions. They stand for real work: the "
        "overhead of a function call, the cost of pushing and popping a stack frame, pivot "
        "selection, bounds checks, allocating a scratch buffer, and above all the memory "
        "access pattern, since a sequential sweep through a small array may sit entirely in "
        "L1 cache while a cleverer algorithm jumps around and misses. On a large input these "
        "costs are diluted across a great deal of productive work. On a small input they are "
        "essentially the whole cost."))
    st.append(p(
        "Sorting is the standard illustration. Insertion sort is O(n²), which sounds "
        "disqualifying, but its constant factor is about as small as an algorithm's can be. "
        "Each step performs one comparison and one shift, it touches memory in a strictly "
        "sequential pattern, it makes no recursive calls, and it allocates nothing. It also "
        "has an O(n) best case, so on data that is already nearly ordered it barely does any "
        "work at all. Quicksort's per-call overhead is small but not zero, and on a "
        "twelve-element array you pay that overhead repeatedly in exchange for very little "
        "actual sorting."))
    st.append(p(
        "An illustrative cost model makes the shape of the trade-off visible. Suppose "
        "insertion sort costs about 0.5n² units and quicksort about 2n log₂ n + 30 "
        "units, the trailing 30 standing for per-call setup that does not shrink with n:"))
    st.append(data_table(
        ["n", "insertion sort ≈ 0.5n²", "quicksort ≈ 2n log₂ n + 30",
         "faster in this model"],
        [
            ["4", "8", "46", "insertion sort, by about 6×"],
            ["8", "32", "78", "insertion sort, by about 2.4×"],
            ["16", "128", "158", "insertion sort, narrowly"],
            ["20", "200", "203", "level pegging (the crossover)"],
            ["32", "512", "350", "quicksort"],
            ["100", "5,000", "1,359", "quicksort, by about 3.7×"],
            ["1,000", "500,000", "19,962", "quicksort, by about 25×"],
        ],
        col_widths=[w * 0.10, w * 0.24, w * 0.26, w * 0.40],
        right_align_from=1,
    ))
    st.append(caption(
        "Table 3. An illustrative model, not a measurement; the exact constants depend on the "
        "machine and the implementation. The shape, however, is real, and so is the location "
        "of the crossover."))
    st.append(p(
        "Below the crossover the algorithm with the worse asymptotic complexity is genuinely "
        "the faster one, on the same data and the same machine. Above it the asymptotically "
        "better algorithm pulls ahead and never gives the lead back. Both halves of that "
        "sentence are ordinary consequences of the definition; neither is an anomaly."))
    st.append(callout(
        "<b>In practice.</b> This is not a theoretical curiosity: production sorting routines "
        "are built around it. Introsort, the hybrid used by the C++ standard library's "
        "std::sort, and Timsort, used by Python's list.sort and by Java's sort for object "
        "arrays, both stop subdividing once a partition or run falls below a fixed threshold "
        "of roughly 10 to 30 elements and finish that block with insertion sort, precisely "
        "because insertion sort's lower overhead beats quicksort's asymptotically better "
        "complexity on small arrays. Library authors treat this as routine engineering rather "
        "than as a special case.", w))
    st.append(p(
        "The hybrid is easy to write, and you will implement one in the lab session:"))
    st.append(code(
        """
SMALL = 16                           # tuned per library; typically 10 to 30

function INSERTION-SORT(A, lo, hi):
    for i = lo + 1 to hi:
        key = A[i]
        j = i - 1
        while j >= lo and A[j] > key:
            A[j + 1] = A[j]          # shift the larger element right
            j = j - 1
        A[j + 1] = key

function HYBRID-SORT(A, lo, hi):
    if hi - lo + 1 <= SMALL:
        INSERTION-SORT(A, lo, hi)    # cheaper here, despite being O(n^2)
        return
    p = PARTITION(A, lo, hi)
    HYBRID-SORT(A, lo, p - 1)
    HYBRID-SORT(A, p + 1, hi)
""", w))
    st.append(p(
        "The same pattern appears well outside sorting. Strassen's matrix multiplication has "
        "a better exponent than the schoolbook algorithm, but its bookkeeping overhead means "
        "implementations only switch to it above dimensions in the hundreds. A linear scan of "
        "a twenty-element array frequently beats a hash table lookup, because computing the "
        "hash and following a pointer costs more than twenty sequential comparisons in cache. "
        "In each case the asymptotically inferior method wins in a bounded region, and that "
        "region is often exactly where real workloads live."))
    st.append(p(
        "The practical guidance follows directly. Use asymptotic analysis to choose the "
        "family of algorithms when inputs are large or unbounded, since nothing else predicts "
        "scaling. Do not use it to choose between candidates when the input is small or "
        "tightly bounded; there, measure on representative data and expect the constants to "
        "decide. When input size varies across the whole range, do what the standard "
        "libraries do and combine the two."))

    # ---------------- 6 ----------------
    st.append(h2("6. Space complexity"))
    st.append(p(
        "Everything so far has concerned time, but memory is analysed the same way and with "
        "the same notation: space complexity expresses how the memory an algorithm requires "
        "grows with input size n. One distinction must be kept clear, between two different "
        "things people mean by \"the space it uses\"."))
    st.append(p(
        "<b>Total space</b> counts everything, including the input itself. Since any algorithm "
        "that must read all of its input occupies at least O(n) total space, this measure "
        "rarely distinguishes one algorithm from another and is not usually what is quoted. "
        "<b>Auxiliary space</b> counts only the extra memory the algorithm allocates beyond "
        "the input: temporary arrays, bookkeeping structures, and the recursion stack. This is "
        "the interesting figure, and it is what is meant when a textbook says an algorithm "
        "\"uses O(1) space\". An algorithm whose auxiliary space is O(1), or O(log n) for the "
        "recursion stack alone, is called <b>in-place</b>; one that needs auxiliary space "
        "proportional to the input is <b>out-of-place</b>."))
    st.append(data_table(
        ["Algorithm", "Time (average)", "Time (worst)", "Auxiliary space", "In-place?"],
        [
            ["Insertion sort", "O(n²)", "O(n²)", "O(1)", "yes"],
            ["Heapsort", "O(n log n)", "O(n log n)", "O(1)", "yes"],
            ["Quicksort", "O(n log n)", "O(n²)", "O(log n) stack, O(n) worst", "yes"],
            ["Mergesort", "O(n log n)", "O(n log n)", "O(n)", "no"],
            ["Timsort", "O(n log n)", "O(n log n)", "O(n)", "no"],
        ],
        col_widths=[w * 0.20, w * 0.15, w * 0.14, w * 0.31, w * 0.20],
    ))
    st.append(caption("Table 4. Time and auxiliary space for the sorting algorithms discussed "
                      "in this module."))
    st.append(p(
        "Two rows deserve comment. Mergesort is the canonical out-of-place sort: merging two "
        "sorted halves requires somewhere to put the result, so it needs a scratch buffer "
        "proportional to n. In exchange it offers an O(n log n) guarantee in the worst case, "
        "not merely on average, and it is stable. Quicksort is called in-place because it "
        "rearranges elements within the original array, but that is not free: each pending "
        "recursive call occupies a stack frame, so balanced partitions cost O(log n) "
        "auxiliary space and degenerate ones cost O(n). Implementations cap this by recursing "
        "into the smaller side first and looping on the larger. Forgetting that the recursion "
        "stack is auxiliary space is one of the commonest mistakes in this part of the "
        "module."))
    st.append(p(
        "Time and space are frequently exchangeable, and choosing between them is a design "
        "decision rather than a matter of correctness. Memoising a recursive function trades "
        "O(n) memory for an often dramatic reduction in time; counting sort buys linear time "
        "by allocating an array the size of the key range. The trade is not always available "
        "on favourable terms: on an embedded controller with sixty-four kilobytes of RAM, or "
        "when the dataset only just fits in memory, auxiliary space is the binding constraint "
        "and an out-of-place algorithm is not an option however good its time bound looks. "
        "Note also that the two are not fully independent, since a large auxiliary buffer "
        "costs time to allocate and to touch and evicts other data from cache. That is one "
        "more channel through which the constant factors of Section 5 make themselves felt."))

    # ---------------- Summary ----------------
    st.append(h2("Summary"))
    st.append(bullets([
        "Timing measurements describe an implementation on a machine; complexity analysis "
        "describes the method, which is why we count operations as a function of input "
        "size n.",
        "f(n) is O(g(n)) when f(n) ≤ c · g(n) for all n beyond some n<sub>0</sub>. "
        "It is an asymptotic upper bound on growth rate.",
        "Big-O describes how cost scales with input size, not how many seconds an algorithm "
        "takes. Constant factors and lower-order terms are dropped, so 3n² + 5n + 100 "
        "is O(n²).",
        "Best, average and worst case are separate results. Quicksort is O(n log n) on "
        "average and O(n²) in the worst case.",
        "Because the definition says nothing about inputs below n<sub>0</sub>, an "
        "asymptotically worse algorithm can be the faster choice on small inputs, which is "
        "why standard libraries fall back to insertion sort below about 10 to 30 elements.",
        "Auxiliary space excludes the input and includes the recursion stack; it is what "
        "\"in-place\" refers to.",
    ]))

    # ---------------- Exercises ----------------
    st.append(h2("Exercises"))
    st.append(p(
        "Not assessed, but recommended before the lab session. Solutions are discussed in "
        "Thursday's session rather than published."))
    st.append(bullets([
        "<b>1.</b> Using the definition directly, show that 7n + 2n log₂ n + 40 is "
        "O(n log n) by exhibiting a suitable c and n<sub>0</sub>.",
        "<b>2.</b> An algorithm performs T(n) = 6n² + 200n operations. For which values "
        "of n does the quadratic term exceed the linear term? Comment on what this implies "
        "about the range of n over which the label O(n²) is informative.",
        "<b>3.</b> Write down an input of length 8 that forces a quicksort implementation "
        "using the last element as pivot into its worst case, and count the comparisons. "
        "Propose two changes that avoid it, and state what each costs.",
        "<b>4.</b> A team replaces an O(n²) routine with an O(n log n) one and finds the "
        "program runs measurably slower in production. Give three explanations consistent "
        "with this handout, and describe an experiment that would distinguish between them.",
        "<b>5.</b> You must sort 40 million records on a machine whose free memory is barely "
        "larger than the records themselves. Using Table 4, argue for one algorithm over the "
        "others, and state which column decided it.",
    ]))

    return st


# --------------------------------------------------------------------------
# Build and verify
# --------------------------------------------------------------------------

REQUIRED_PHRASES = [
    "Big-O measures growth rate, not speed",
    "how the running time scales as the input size increases, not how many seconds",
    "3n² + 5n + 100 is O(n²)",
    "a fixed threshold of roughly 10 to 30 elements and finish that block with insertion sort",
    "insertion sort's lower overhead beats quicksort's asymptotically better complexity "
    "on small arrays",
    "O(n log n) on average but O(n²) in the worst case",
]


def build_pdf() -> Path:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT_PATH),
        pagesize=A4,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="Lecture 4: Algorithmic Complexity",
        author="COMP2 Data Structures and Algorithms",
        subject="Lecture handout: asymptotic notation, growth rates, best/average/worst case, "
                "space complexity",
        creator="scripts/make_sample_pdf.py",
    )
    story = build_story(doc.width)
    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages,
              canvasmaker=NumberedCanvas)
    return OUT_PATH


def verify(path: Path) -> int:
    header = path.open("rb").read(5)
    if header != b"%PDF-":
        print(f"FAIL: {path} does not start with %PDF-", file=sys.stderr)
        return 1

    size_kb = path.stat().st_size / 1024
    try:
        from pypdf import PdfReader
    except ImportError:
        print(f"OK (unverified): wrote {path} ({size_kb:.1f} KB). "
              "Install pypdf to check the text layer.")
        return 0

    reader = PdfReader(str(path))
    pages = len(reader.pages)
    raw = "\n".join(page.extract_text() or "" for page in reader.pages)
    flat = re.sub(r"\s+", " ", raw)

    print(f"Wrote {path}")
    print(f"  pages          : {pages}")
    print(f"  size           : {size_kb:.1f} KB")
    print(f"  extracted text : {len(raw):,} characters")

    missing = [ph for ph in REQUIRED_PHRASES if re.sub(r"\s+", " ", ph) not in flat]
    for ph in REQUIRED_PHRASES:
        mark = "MISSING" if ph in missing else "found  "
        print(f"  [{mark}] {ph[:72]}{'...' if len(ph) > 72 else ''}")

    if len(raw) < 8000:
        print("FAIL: text layer looks too short to be a real extraction.", file=sys.stderr)
        return 1
    if missing:
        print(f"FAIL: {len(missing)} required phrase(s) missing from the text layer.",
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(verify(build_pdf()))
