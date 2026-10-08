#!/bin/bash
# Re-encode the game's .opal files from the QA'd clips in assets/clips.
# One file per size class: every frame layer in a file is as big as its largest clip.
set -e
cd "$(dirname "$0")/.."
C=assets/clips
r() { # name clip -> "<clip> --key auto --rect name=0,0,w,h@0-(n12-2)" (drops the pinned duplicate last frame)
  local n w h fps=${3:-12}
  n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of default=nw=1:nk=1 $C/$2.mp4 | head -1 | tr -dc 0-9)
  w=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 $C/$2.mp4 | head -1 | tr -dc 0-9)
  h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 $C/$2.mp4 | head -1 | tr -dc 0-9)
  echo "$C/$2.mp4 --key auto --rect $1=0,0,$w,$h@0-$(( n * fps / 24 - 2 ))"
}
O=media; mkdir -p $O
e() { ./tools/opal encode "$@" | grep -v '^assets'; }
e -o $O/brazier.opal --crf 24 --fps 12 --scale 0.45 $(r brazier brazier_f)
e -o $O/props.opal   --crf 24 --fps 12 --scale 0.45 $(r chest chest_f) $(r orb orb)
e -o $O/logo.opal    --crf 23 --fps 12 --scale 0.38 $(r logo logo_f)
e -o $O/board.opal   --crf 22 --fps 8  --scale 0.75 $(r frame frame_f 8)
e -o $O/crew.opal    --crf 24 --fps 12 --scale 0.4 $(r vex vex) $(r morra morra) $(r brakka brakka) $(r nib nib)
e -o $O/symbols.opal --crf 24 --fps 12 --scale 0.34 $(r ruby ruby) $(r sapphire sapphire) $(r amethyst amethyst) $(r topaz topaz) $(r wild egg) $(r key key_f) $(r coin coin)
e -o $O/winframe.opal --crf 24 --fps 12 --scale 0.35 $(r winframe winframe)
e -o $O/pillar.opal  --crf 24 --fps 12 --scale 0.4 $(r pillar pillar)
e -o $O/dragon.opal  --crf 23 --fps 12 --scale 0.6 $(r idle d_idle)
e -o $O/breath.opal  --crf 24 --fps 12 --scale 0.4 --once breath $(r breath d_breath_f)
e -o $O/fx.opal      --crf 24 --fps 12 --scale 0.4 --once shatter --once coinburst --once magic --once smoke \
  $(r shatter shatter) $(r coinburst coinburst_f) $(r magic magic) $(r smoke smoke)
e -o $O/eruption.opal --crf 24 --fps 12 --scale 0.7 --once eruption $(r eruption eruption_f)
e -o $O/seal.opal    --crf 23 --fps 12 --scale 0.5 $(r seal seal_f)
