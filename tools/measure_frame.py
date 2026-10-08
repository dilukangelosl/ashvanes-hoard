"""Measure the board frame clip's opening (green hole) as fractions of its video cell.
   python3 tools/measure_frame.py assets/clips/frame_f.mp4"""
import subprocess, sys
fn = sys.argv[1]
w, h = [int(v) for v in subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', fn], capture_output=True, text=True).stdout.strip().split(',')]
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', fn, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
green = lambda x, y: (lambda i: raw[i + 1] > 150 and raw[i] < 140 and raw[i + 2] < 140)((y * w + x) * 3)
# horizontal extent through the middle; vertical extent away from the centre (the crest hangs into the opening there)
cy = int(h * 0.55)
x0 = x1 = w // 2
while green(x0 - 1, cy): x0 -= 1
while green(x1 + 1, cy): x1 += 1
tops, bots = [], []
for fx in (0.3, 0.38, 0.62, 0.7):
    cx, y0, y1 = int(w * fx), cy, cy
    while green(cx, y0 - 1): y0 -= 1
    while green(cx, y1 + 1): y1 += 1
    tops.append(y0); bots.append(y1)
y0, y1 = min(tops), max(bots)
print(f'{w}x{h} HOLE = {{ x: {x0 / w:.4f}, y: {y0 / h:.4f}, w: {(x1 - x0 + 1) / w:.4f}, h: {(y1 - y0 + 1) / h:.4f} }}  cell ratio {(x1 - x0 + 1) / 6 / ((y1 - y0 + 1) / 5):.3f}')
