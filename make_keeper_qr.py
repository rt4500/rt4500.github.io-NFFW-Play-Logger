#!/usr/bin/env python3
"""Generate a printable PDF with one QR code per keeper link.
Usage:  pip install qrcode reportlab pillow
        python3 make_keeper_qr.py https://YOU.github.io/REPO f1-KEY f2-KEY hub-KEY
Labels are derived from key prefixes (f1/f2/hub)."""
import sys, io, qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table
from reportlab.lib.styles import getSampleStyleSheet

if len(sys.argv) < 3:
    sys.exit(__doc__)
base = sys.argv[1].rstrip('/')
keys = sys.argv[2:]
LABELS = {'f1': 'FIELD 1', 'f2': 'FIELD 2', 'hub': 'HUB / SPARE'}
ss = getSampleStyleSheet()
story = [Paragraph('<b>Flag Stats — Keeper Links</b>', ss['Title']),
         Paragraph('Scan ONCE on the matching device, then Add to Home Screen. '
                   'The key stays on the device; treat this sheet like a key.', ss['Normal']),
         Spacer(1, 8*mm)]
for k in keys:
    url = f'{base}/#k={k}'
    label = next((v for p, v in LABELS.items() if k.startswith(p)), k)
    img = qrcode.make(url); buf = io.BytesIO(); img.save(buf, 'PNG'); buf.seek(0)
    story += [Table([[Image(buf, 60*mm, 60*mm),
                      Paragraph(f'<b>{label}</b><br/><font size=8>{url}</font>', ss['Normal'])]],
                    colWidths=[70*mm, 100*mm]), Spacer(1, 10*mm)]
SimpleDocTemplate('keeper-links.pdf', pagesize=A4).build(story)
print('keeper-links.pdf written')
