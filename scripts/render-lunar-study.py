"""Optional artwork contact sheet renderer (requires PyMuPDF and Pillow)."""
from pathlib import Path
import fitz
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
colors = ['#c9ad78', '#d6a3b5', '#e5c7a0']
names = ['THE ECLIPSE GATE', 'THE UNBROKEN THREAD', 'THE EMBER SEAL']
files = ['lunar-key.svg', 'velvet-oracle.svg', 'sacred-flame.svg']
board = Image.new('RGB', (1800, 900), '#100f0e')
draw = ImageDraw.Draw(board)
font = ImageFont.truetype('C:/Windows/Fonts/georgia.ttf', 43)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 15)
serif = ImageFont.truetype('C:/Windows/Fonts/georgia.ttf', 29)
for i, (file, name, color) in enumerate(zip(files, names, colors)):
    with fitz.open(root / 'logos' / file) as svg:
        with fitz.open('pdf', svg.convert_to_pdf()) as pdf:
            pix = pdf[0].get_pixmap(matrix=fitz.Matrix(1.65, 1.65), alpha=True)
    logo = Image.frombytes('RGBA', [pix.width, pix.height], pix.samples)
    x = 600 * i
    draw.rectangle((x+20,85,x+580,820), fill=['#181614','#251925','#211a16'][i], outline='#453a31', width=1)
    draw.text((x+50,115), f'0{i+1} / LUNAR CYCLE STUDY', font=small, fill=color)
    board.paste(logo, (x+(600-logo.width)//2,165), logo)
    draw.text((x+300,710), 'Key to the Soul', font=font, fill=color, anchor='mm')
    draw.text((x+300,767), name, font=small, fill=color, anchor='mm')
draw.text((900,37), 'HER REFERENCE, REIMAGINED', font=small, fill='#b0a79b', anchor='mm')
draw.text((900,862), 'Moon cycles. A private symbol. A return to yourself.', font=serif, fill='#eee6d8', anchor='mm')
board.save(root / 'images' / 'lunar-cycle-study.png')
print('Rendered artwork: images/lunar-cycle-study.png')
