#!/bin/bash
# Fade a clip's outer border into its own backdrop, so anything the model let touch the frame
# edge (wing tips, light rays, coins) fades out instead of being cut off hard.
#   tools/feather.sh in.mp4 out.mp4 [ramp_px=56]
set -e
in=$1 out=$2 ramp=${3:-56}
IFS=x read w h < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$in")
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
bg=$(python3 "$(dirname "$0")/sprite_qa.py" edges "$in" 2>&1 | grep -o 'backdrop #[0-9a-f]*' | cut -c11-)
bg=${bg:-00ee02}
mask=$(mktemp -t mask).png
ffmpeg -v error -y -f lavfi -i "color=black:s=${w}x${h}" -vf "format=gray,geq=lum='255*min(1\,min(min(X\,W-1-X)\,min(Y\,H-1-Y))/$ramp)'" -frames:v 1 "$mask"
ffmpeg -v error -y -i "$in" -loop 1 -t "$d" -i "$mask" -f lavfi -t "$d" -i "color=0x${bg}:s=${w}x${h}:r=24" \
  -filter_complex "[1]format=gray[m];[0]format=rgba[v];[v][m]alphamerge[a];[2][a]overlay=shortest=1,format=yuv420p" -c:v libx264 -crf 12 -an "$out"
rm -f "$mask"
python3 "$(dirname "$0")/sprite_qa.py" edges "$out" | tail -1
