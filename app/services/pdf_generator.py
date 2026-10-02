"""
Offline Cricket Scorecard PDF Generator using ReportLab.
Generates professional, printable A4 PDF scorecards directly from SQLite data.
Completely offline: uses standard core fonts and local assets only.
"""

import os
import io
import re
from datetime import datetime
from typing import Dict, Any, Tuple, Optional

from sqlalchemy.orm import Session
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, HRFlowable, Image as RLImage
)
from reportlab.pdfgen import canvas

from app.models.models import Match
from app.services.scoring_engine import get_full_scorecard


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and print total page numbers: 'Page X of Y'.
    Draws consistent header and footer decorations across all pages.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Footer
        footer_y = 12 * mm
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.75)
        self.line(14 * mm, footer_y + 4 * mm, A4[0] - 14 * mm, footer_y + 4 * mm)

        app_title = "Hostel Cricket Scoring System • Official Match Scorecard"
        self.drawString(14 * mm, footer_y, app_title)

        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(A4[0] - 14 * mm, footer_y, page_str)

        self.restoreState()


def sanitize_filename(name: str) -> str:
    """Sanitize string for safe filenames."""
    if not name:
        return "Team"
    clean = re.sub(r'[^a-zA-Z0-9_-]', '_', name.strip())
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean or "Team"


def resolve_local_image(url: Optional[str]) -> Optional[str]:
    """Resolve a URL or path to a valid local image file."""
    if not url:
        return None
    url_clean = url.split("?")[0].lstrip("/")
    candidates = [
        url_clean,
        os.path.join(".", url_clean),
        os.path.join("static", url_clean),
        os.path.join("app", url_clean)
    ]
    for c in candidates:
        if os.path.exists(c) and os.path.isfile(c):
            return c
    return None


def generate_scorecard_pdf(match_id: int, db: Session) -> Tuple[bytes, str]:
    """
    Generate a complete, professional scorecard PDF for the given match_id.
    Returns (pdf_bytes, suggested_filename).
    """
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        raise ValueError(f"Match #{match_id} not found in database")

    scorecard_data = get_full_scorecard(db, match_id)

    team1_name = match.team1.name if match.team1 else "Team1"
    team2_name = match.team2.name if match.team2 else "Team2"
    t1_clean = sanitize_filename(team1_name)
    t2_clean = sanitize_filename(team2_name)
    filename = f"{t1_clean}_vs_{t2_clean}_{match.id}_Scorecard.pdf"

    buffer = io.BytesIO()

    # Document setup: A4 with 14mm margins
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=18 * mm
    )

    content_width = A4[0] - (28 * mm)

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#0f172a"),
        alignment=0
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=13,
        textColor=colors.HexColor("#334155"),
        alignment=0
    )

    meta_style = ParagraphStyle(
        'DocMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#64748b")
    )

    badge_style = ParagraphStyle(
        'BadgeText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0369a1"),
        alignment=2
    )

    toss_style = ParagraphStyle(
        'TossText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#92400e")
    )

    result_style = ParagraphStyle(
        'ResultText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#065f46"),
        alignment=1
    )

    inn_title_style = ParagraphStyle(
        'InnTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor("#0f172a")
    )

    inn_score_style = ParagraphStyle(
        'InnScore',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11.5,
        leading=14,
        textColor=colors.HexColor("#0284c7"),
        alignment=2
    )

    section_heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=10.5,
        textColor=colors.HexColor("#475569")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1e293b")
    )

    table_header_right = ParagraphStyle(
        'TableHeaderRight',
        parent=table_header_style,
        alignment=2
    )

    cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0f172a")
    )

    cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=cell_style,
        fontName='Helvetica-Bold'
    )

    cell_muted = ParagraphStyle(
        'TableCellMuted',
        parent=cell_style,
        textColor=colors.HexColor("#64748b"),
        fontSize=7.5
    )

    cell_right = ParagraphStyle(
        'TableCellRight',
        parent=cell_style,
        alignment=2
    )

    cell_right_bold = ParagraphStyle(
        'TableCellRightBold',
        parent=cell_bold,
        alignment=2
    )

    cell_right_highlight = ParagraphStyle(
        'TableCellRightHighlight',
        parent=cell_bold,
        alignment=2,
        textColor=colors.HexColor("#0284c7")
    )

    dnb_style = ParagraphStyle(
        'DnbText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=colors.HexColor("#475569")
    )

    fow_style = ParagraphStyle(
        'FowText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#334155")
    )

    story = []

    # 1. HEADER SECTION
    tourney_name = match.tournament.name if match.tournament else "Hostel Cricket Tournament"
    match_num_str = f"Match #{match.id}"
    overs_str = f"{match.total_overs} Overs Match"
    date_str = match.scheduled_date.strftime("%d %b %Y, %I:%M %p") if match.scheduled_date else (match.created_at.strftime("%d %b %Y, %I:%M %p") if match.created_at else datetime.utcnow().strftime("%d %b %Y"))

    t1_logo_path = resolve_local_image(match.team1.logo_url if match.team1 else None)
    t2_logo_path = resolve_local_image(match.team2.logo_url if match.team2 else None)

    t1_img = RLImage(t1_logo_path, width=28, height=28) if t1_logo_path else None
    t2_img = RLImage(t2_logo_path, width=28, height=28) if t2_logo_path else None

    header_left_data = [
        Paragraph(f"{tourney_name.upper()}", title_style),
        Paragraph(f"{match_num_str} • {team1_name} vs {team2_name} ({overs_str})", subtitle_style),
        Paragraph(f"Date: {date_str} • Status: {match.status.upper()}", meta_style)
    ]

    badge_p = Paragraph("OFFICIAL SCORECARD", badge_style)

    row = []
    col_widths_final = []
    if t1_img:
        row.append(t1_img)
        col_widths_final.append(34)

    row.append(header_left_data)
    
    if t2_img:
        row.append(t2_img)

    row.append(badge_p)

    used_w = (34 if t1_img else 0) + (34 if t2_img else 0) + 120
    mid_w = content_width - used_w
    col_widths_final.append(mid_w)
    if t2_img:
        col_widths_final.append(34)
    col_widths_final.append(120)

    header_table = Table([row], colWidths=col_widths_final)
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (-1, 0), (-1, 0), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#0284c7"), spaceAfter=6))

    # 2. TOSS & RESULT BANNERS
    toss_winner_name = match.toss_winner.name if match.toss_winner else None
    toss_decision = match.toss_decision
    if toss_winner_name and toss_decision:
        toss_str = f"Toss: {toss_winner_name} won the toss and elected to {toss_decision.upper()}"
        toss_box = Table(
            [[Paragraph(toss_str, toss_style)]],
            colWidths=[content_width]
        )
        toss_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fef3c7")),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#fde68a")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(toss_box)
        story.append(Spacer(1, 4))

    if match.result_text:
        result_box = Table(
            [[Paragraph(f"Match Result: {match.result_text}", result_style)]],
            colWidths=[content_width]
        )
        result_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#ecfdf5")),
            ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor("#10b981")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(result_box)
        story.append(Spacer(1, 6))

    # 3. INNINGS SECTIONS
    innings_data_list = scorecard_data.get("innings", [])

    if not innings_data_list:
        no_inn_box = Table(
            [[Paragraph("Match has not started yet. No innings data recorded in the scorecard.", meta_style)]],
            colWidths=[content_width]
        )
        no_inn_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('PADDING', (0, 0), (-1, -1), 12),
        ]))
        story.append(no_inn_box)
    else:
        for inn in innings_data_list:
            inn_elements = []

            inn_num_str = "1st Innings" if inn.get("innings_number") == 1 else "2nd Innings"
            batting_team = inn.get("batting_team_name", "Batting Team")
            tot_runs = inn.get("total_runs", 0)
            tot_wkts = inn.get("total_wickets", 0)
            overs_bowled = inn.get("overs", "0.0")
            rr = inn.get("run_rate", "0.00")

            inn_hdr_table = Table(
                [[
                    Paragraph(f"{batting_team} <font color='#64748b' size=8.5>({inn_num_str})</font>", inn_title_style),
                    Paragraph(f"{tot_runs}/{tot_wkts} <font color='#475569' size=8.5>({overs_bowled} Ov, RR: {rr})</font>", inn_score_style)
                ]],
                colWidths=[content_width * 0.55, content_width * 0.45]
            )
            inn_hdr_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LINEBELOW', (0, 0), (-1, -1), 1.5, colors.HexColor("#0284c7")),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))
            inn_elements.append(inn_hdr_table)
            inn_elements.append(Spacer(1, 3))

            # BATTING TABLE
            inn_elements.append(Paragraph("BATTING", section_heading_style))
            inn_elements.append(Spacer(1, 2))

            bat_headers = [
                Paragraph("Batter", table_header_style),
                Paragraph("Dismissal", table_header_style),
                Paragraph("R", table_header_right),
                Paragraph("B", table_header_right),
                Paragraph("4s", table_header_right),
                Paragraph("6s", table_header_right),
                Paragraph("SR", table_header_right),
            ]

            bat_col_widths = [
                content_width * 0.28,
                content_width * 0.32,
                content_width * 0.08,
                content_width * 0.08,
                content_width * 0.08,
                content_width * 0.08,
                content_width * 0.08,
            ]

            bat_rows = [bat_headers]
            for b in inn.get("batting", []):
                bat_rows.append([
                    Paragraph(b.get("name", ""), cell_bold),
                    Paragraph(b.get("dismissal", "not out"), cell_muted),
                    Paragraph(str(b.get("runs", 0)), cell_right_bold),
                    Paragraph(str(b.get("balls", 0)), cell_right),
                    Paragraph(str(b.get("fours", 0)), cell_right),
                    Paragraph(str(b.get("sixes", 0)), cell_right),
                    Paragraph(f"{b.get('strike_rate', 0.0):.1f}", cell_right),
                ])

            bat_table = Table(bat_rows, colWidths=bat_col_widths)
            bat_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor("#94a3b8")),
                ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 2.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ]))
            inn_elements.append(bat_table)
            inn_elements.append(Spacer(1, 3))

            # Did Not Bat
            dnb_list = inn.get("did_not_bat", [])
            if dnb_list:
                dnb_text = f"<b>Did not bat:</b> {', '.join(dnb_list)}"
                inn_elements.append(Paragraph(dnb_text, dnb_style))
                inn_elements.append(Spacer(1, 3))

            # Extras & Total Summary Box
            ext = inn.get("extras", {})
            ext_tot = ext.get("total", 0)
            ext_b = ext.get("byes", 0)
            ext_lb = ext.get("legbyes", 0)
            ext_w = ext.get("wides", 0)
            ext_nb = ext.get("noballs", 0)

            extras_left = Paragraph(f"<b>Extras:</b> {ext_tot} (b {ext_b}, lb {ext_lb}, w {ext_w}, nb {ext_nb})", cell_style)
            total_right = Paragraph(f"<b>Total:</b> {tot_runs}/{tot_wkts} ({overs_bowled} Overs)", cell_right_bold)

            extras_table = Table(
                [[extras_left, total_right]],
                colWidths=[content_width * 0.6, content_width * 0.4]
            )
            extras_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor("#cbd5e1")),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 2.5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ]))
            inn_elements.append(extras_table)
            inn_elements.append(Spacer(1, 3))

            # Fall of Wickets
            fow_list = inn.get("fall_of_wickets", [])
            if fow_list:
                inn_elements.append(Paragraph("FALL OF WICKETS", section_heading_style))
                inn_elements.append(Spacer(1, 1.5))
                fow_parts = [f"<b>{f['runs']}/{f['wicket_num']}</b> ({f['player_name']}, {f['over']} ov)" for f in fow_list]
                inn_elements.append(Paragraph(" • ".join(fow_parts), fow_style))
                inn_elements.append(Spacer(1, 3))

            # BOWLING TABLE
            bowling_list = inn.get("bowling", [])
            if bowling_list:
                inn_elements.append(Paragraph("BOWLING", section_heading_style))
                inn_elements.append(Spacer(1, 1.5))

                bowl_headers = [
                    Paragraph("Bowler", table_header_style),
                    Paragraph("O", table_header_right),
                    Paragraph("M", table_header_right),
                    Paragraph("R", table_header_right),
                    Paragraph("W", table_header_right),
                    Paragraph("ECON", table_header_right),
                ]

                bowl_col_widths = [
                    content_width * 0.45,
                    content_width * 0.11,
                    content_width * 0.11,
                    content_width * 0.11,
                    content_width * 0.11,
                    content_width * 0.11,
                ]

                bowl_rows = [bowl_headers]
                for bow in bowling_list:
                    bowl_rows.append([
                        Paragraph(bow.get("name", ""), cell_bold),
                        Paragraph(str(bow.get("overs", "0.0")), cell_right),
                        Paragraph(str(bow.get("maidens", 0)), cell_right),
                        Paragraph(str(bow.get("runs", 0)), cell_right),
                        Paragraph(str(bow.get("wickets", 0)), cell_right_highlight),
                        Paragraph(f"{bow.get('economy', 0.0):.2f}", cell_right),
                    ])

                bowl_table = Table(bowl_rows, colWidths=bowl_col_widths)
                bowl_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ('LINEBELOW', (0, 0), (-1, 0), 1.5, colors.HexColor("#94a3b8")),
                    ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('TOPPADDING', (0, 0), (-1, -1), 2.5),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
                    ('LEFTPADDING', (0, 0), (-1, -1), 4),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                ]))
                inn_elements.append(bowl_table)

            inn_elements.append(Spacer(1, 8))
            story.extend(inn_elements)

    # Build Document with NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return pdf_bytes, filename
