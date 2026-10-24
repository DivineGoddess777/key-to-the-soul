"""Original geometric artwork for the reference-led lunar identity study."""
from pathlib import Path
from math import cos, sin, radians

ROOT = Path(__file__).resolve().parents[1]
LOGOS = ROOT / 'logos'

def phase_ring(color, radius=127, size=11, angle=-90):
    pieces = []
    # Eight silhouettes: new, waxing crescent/quarter/gibbous, full, waning.
    forms = [
        '<circle r="11" fill="none" stroke-width="1.1"/>',
        '<path d="M0-11A11 11 0 0 1 0 11C10 6 10-6 0-11Z"/>',
        '<path d="M0-11A11 11 0 0 1 0 11Z"/>',
        '<path d="M0-11A11 11 0 0 1 0 11C-7 6-7-6 0-11Z"/>',
        '<circle r="11"/>',
        '<path d="M0-11A11 11 0 0 0 0 11C7 6 7-6 0-11Z"/>',
        '<path d="M0-11A11 11 0 0 0 0 11Z"/>',
        '<path d="M0-11A11 11 0 0 0 0 11C-10 6-10-6 0-11Z"/>',
    ]
    for index, form in enumerate(forms):
        a = radians(angle + index * 45)
        x, y = 160 + radius*cos(a), 160 + radius*sin(a)
        pieces.append(f'<g transform="translate({x:.3f} {y:.3f}) scale({size/11:.3f})">{form}</g>')
    return f'<g fill="{color}" stroke="{color}" color="{color}" stroke-width=".35">'+''.join(pieces)+'</g>'

def ticks(radius, length, count, color):
    lines = []
    for i in range(count):
        if i % (count//8) in [0, 1, count//8-1]:
            continue
        angle = radians(i * 360/count - 90)
        delta = length if i % 3 == 0 else length*.4
        x,y = 160 + radius*cos(angle), 160 + radius*sin(angle)
        x2,y2 = 160 + (radius+delta)*cos(angle),160 + (radius+delta)*sin(angle)
        lines.append(f'<path d="M{x:.2f} {y:.2f}L{x2:.2f} {y2:.2f}"/>')
    return f'<g stroke="{color}" stroke-width=".7" opacity=".65">'+''.join(lines)+'</g>'

def svg(title, color, art):
    art = art.replace('currentColor', color)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" fill="none" stroke="{color}" stroke-linecap="round" stroke-linejoin="round">
<title>{title} — Key to the Soul</title>
{art}
</svg>'''

gate_core = '''<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M160 101a57 57 0 1 1 0 114 57 57 0 1 1 0-114ZM149 151a17 17 0 1 1 22 0l8 35h-38Z"/>
<path d="M145 107c-19 9-31 28-31 49s12 40 31 49" stroke-width="1" opacity=".65"/>
<path d="M160 87V72m0 157v18m-12-8h24m-7 8v10h-10" stroke-width="1.5"/>
<path d="M93 160h-9m152 0h-9" stroke-width="1.3"/>
<path d="M136 84c7-5 15-8 24-8s17 3 24 8" stroke-width="1"/>
<circle cx="160" cy="65" r="2" fill="currentColor" stroke="none"/>'''
gate = phase_ring('#c9ad78') + ticks(145, 4, 96, '#c9ad78') + '''
<circle cx="160" cy="160" r="105" stroke-width=".65" opacity=".5"/>
<path d="M160 61a99 99 0 0 1 94 130M160 259a99 99 0 0 1-94-130" stroke-width="1.3"/>
<g color="#c9ad78">''' + gate_core + '</g>'

thread_core = '''<path d="M159 78c-62 22-68 90-17 112 31 14 61-8 53-34-8-27-48-27-51 0-5 42 61 47 68-1 8-55-53-64-53-77Z" stroke-width="2.3"/>
<path d="M159 83c-41 25-42 68-11 83 21 10 45-3 37-21" stroke-width=".8" opacity=".7"/>
<path d="M156 190c-22 21-37 47-14 59 22 12 44-12 31-27-9-11-24-5-23 6 0 8 10 10 14 5" stroke-width="2.3"/>
<path d="M159 91c-3 22 18 34 23 51" stroke-width=".8"/>
<path d="M143 253c-19 5-23 9-31 12m62-24 13 15-8 6 7 8" stroke-width="1.7"/>
<circle cx="159" cy="78" r="3" fill="currentColor" stroke="none"/>'''
thread = phase_ring('#d6a3b5',radius=130,size=9.5,angle=-90) + '''
<path d="M213 57c53 24 68 91 36 134-25 35-70 46-108 24-38-23-52-70-28-104 24-36 71-41 100-9 20 23 19 56-6 76" stroke-width=".85" opacity=".65"/>
<path d="M107 263c-53-24-68-91-36-134" stroke-width=".85" opacity=".65"/>
<path d="M128 50c21-7 43-6 63 1M270 135c5 25 2 47-8 68M193 270c-24 7-47 5-68-4M50 189c-6-25-4-46 5-66" stroke-width="1.2"/>
<g color="#d6a3b5">''' + thread_core + '''</g>
<g fill="#d6a3b5" stroke="none"><circle cx="118" cy="101" r="1.4"/><circle cx="223" cy="208" r="1.4"/><circle cx="89" cy="205" r="1"/></g>'''

ember_core = '''<path d="M161 78c17 31 43 52 41 80-2 28-26 45-46 42-26-4-44-25-40-50 3-18 15-31 25-47-3 23 4 37 11 42 16-20 15-42 9-67Z" stroke-width="2.1"/>
<path d="M162 118c6 24 24 34 20 54-3 15-17 23-29 16-15-8-15-21-8-34 0 12 4 17 8 19 8-17 13-34 9-55Z" fill="currentColor" stroke="none"/>
<path d="M160 203v44m-9-28h18m-9 16h21v-12m-21 24h12" stroke-width="2.2"/>
<path d="M119 112c-20 28-14 63 6 80m76-77c17 27 10 59-9 75" stroke-width=".75" opacity=".7"/>
<path d="M160 64v-9m-8 9h16" stroke-width="1.2"/>'''
ember = phase_ring('#e5c7a0',radius=128,size=10.5,angle=-90) + ticks(145,3,64,'#e5c7a0') + '''
<path d="M237 90c18 18 29 43 29 70s-11 52-29 70M83 230c-18-18-29-43-29-70s11-52 29-70" stroke-width="1.1"/>
<path d="M241 84c21 20 33 47 33 76m-195 76c-21-20-33-47-33-76" stroke-width=".65" opacity=".5"/>
<g color="#e5c7a0">''' + ember_core + '</g>'

designs = [('lunar-key.svg','The Eclipse Gate','#c9ad78',gate,gate_core), ('velvet-oracle.svg','The Unbroken Thread','#d6a3b5',thread,thread_core), ('sacred-flame.svg','The Ember Seal','#e5c7a0',ember,ember_core)]
for filename, title, color, art, core in designs:
    (LOGOS / filename).write_text(svg(title,color,art), encoding='utf-8')
    # A separate simplified glyph keeps the navigation mark legible at small sizes.
    compact = svg(title+' compact glyph', color, f'<g color="{color}">{core}</g>')
    compact = compact.replace('viewBox="0 0 320 320"', 'viewBox="95 55 130 220"')
    (LOGOS / filename.replace('.svg','-compact.svg')).write_text(compact, encoding='utf-8')
print('Created three lunar-cycle seals and three compact companion marks.')
