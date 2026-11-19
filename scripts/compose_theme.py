"""Render the original Voyager theme from the score and CC0 orchestra samples.

Requires Python 3.10+, NumPy, and FFmpeg. Downloads only the named instrument
recordings from a pinned VSCO 2 Community Edition revision.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
from pathlib import Path
import re
import subprocess
from urllib.parse import quote
from urllib.request import urlretrieve

import numpy as np

RATE = 48000
TEMPO = 92
BEAT = 60 / TEMPO
ROOT = Path(__file__).resolve().parents[1]
REVISION = "440300901dfe9275fd84e0b7763af1f8443ae62e"
SAMPLES = {
    "harp": ("Strings/Harp", "KSHarp_D2_mf KSHarp_G3_mf KSHarp_D4_mf KSHarp_E5_mf KSHarp_D6_mf"),
    "bass": ("Strings/Solo Contrabass/SusVib", "BKCtbss_SusVib_D1_v1_rr1 BKCtbss_SusVib_A1_v1_rr1 BKCtbss_SusVib_E2_v1_rr1"),
    "cello": ("Strings/Cello Section/susvib", "susvib_D2_v1_1 susvib_A2_v1_1 susvib_C3_v1_1 susvib_G3_v1_1"),
    "bow": ("Strings/Cello Section/spic", "spic_D2_v2_RR1 spic_A2_v2_RR1 spic_C3_v2_RR1 spic_E3_v2_RR1 spic_G3_v2_RR1"),
    "viola": ("Strings/Viola Section/susvib", "ViolaEns_susvib_D3_v1_1 ViolaEns_susvib_A3_v1_1 ViolaEns_susvib_E4_v1_1"),
    "violin": ("Strings/Violin Section/susVib", "VlnEns_susVib_A3_v2 VlnEns_susVib_E4_v2 VlnEns_susVib_G4_v2 VlnEns_susVib_D5_v2"),
    "horn": ("Brass/F Horn/sus", "MOHorn_sus_F2_v2_1 MOHorn_sus_A2_v2_1 MOHorn_sus_C3_v3_1 MOHorn_sus_D4_v1_1 MOHorn_sus_F4_v1_1"),
    "trumpet": ("Brass/Trumpet/sus", "Sum_SHTrumpet_sus_A#3_v3_rr1 Sum_SHTrumpet_sus_D4_v3_rr1 Sum_SHTrumpet_sus_F4_v3_rr1 Sum_SHTrumpet_sus_A4_v3_rr1 Sum_SHTrumpet_sus_C5_v3_rr1"),
    "trombone": ("Brass/Tenor Trombone/sus", "tenortbn_sus_D2_v3_1 tenortbn_sus_F2_v3_1 tenortbn_sus_C3_v3_1"),
    "timpani": ("Percussion/Timpani", "Timpani1_Hit_v3_rr1_Sum Timpani3_Hit_v3_rr1_Sum Timpani5_Hit_v3_rr1_Sum"),
    "roll": ("Percussion/Timpani/Rolls", "Timpani1_Roll_v3_rr1_Sum"),
    "cymbal": ("Percussion", "cymbal-crash1_mf_rr1"),
}

# Harmonies give bass and four orchestral voicings, with progressively brighter inversions.
CHORDS = {
    "Dm": "D2 A2 D3 F3 A3 E4",
    "Bb": "Bb1 F2 Bb2 D3 F3 A3",
    "FA": "A1 F2 A2 C3 F3 G3",
    "F": "F2 C3 F3 A3 C4 G4",
    "C": "C2 G2 C3 E3 G3 D4",
    "Csus": "C2 G2 C3 F3 G3 D4",
    "Gm": "G1 D2 G2 Bb2 D3 A3",
    "DmF": "F2 A2 D3 F3 A3 E4",
    "A": "A1 E2 A2 C#3 E3 B3",
    "Asus": "A1 E2 A2 D3 E3 B3",
    "D": "D2 A2 D3 F#3 A3 E4",
}
HARMONY = (
    "Dm Bb FA Csus  Dm Bb F C  Gm DmF Bb A  "
    "Dm Bb F C  Gm Bb Csus A  DmF Gm Bb Asus  "
    "Dm Bb F C  Gm Bb FA A  Dm Bb FA D"
).split()

# Each bar contains (beat, pitch, held beats). The original rising fifth is
# recast by the horns and then answered by the upper strings in the recapitulation.
THEME = [
    [(0,"D4",1.4),(1.5,"A4",.46),(2,"C5",.86),(3,"D5",.92)],
    [(0,"F5",1.84),(2,"E5",.45),(2.5,"D5",1.35)],
    [(0,"C5",.91),(1,"A4",.65),(1.75,"C5",.63),(2.5,"F5",1.42)],
    [(0,"G5",1.48),(1.5,"E5",.45),(2,"D5",1.85)],
    [(0,"G4",1.42),(1.5,"Bb4",.47),(2,"D5",.92),(3,"G5",.94)],
    [(0,"A5",1.42),(1.5,"G5",.45),(2,"F5",.92),(3,"D5",.91)],
    [(0,"C5",.85),(1,"D5",.88),(2,"F5",1.88)],
    [(0,"E5",1.85),(2,"C#5",1.37),(3.5,"A4",.45)],
]
CLIMAX = [
    THEME[0],THEME[1],
    [(0,"A5",1.85),(2,"G5",.43),(2.5,"F5",1.45)],
    [(0,"G5",.91),(1,"E5",.9),(2,"D5",1.88)],
    THEME[4],THEME[5],
    [(0,"E5",.92),(1,"F5",.92),(2,"A5",1.84)],
    [(0,"G5",.92),(1,"E5",.90),(2,"C#5",1.85)],
]


def midi(note):
    match = re.fullmatch(r"([A-G])([#b]?)(-?\d)", note)
    name, accidental, octave = match.groups()
    return 12 * (int(octave) + 1) + "C D EF G A B".index(name) + {"":0, "#":1, "b":-1}[accidental]


def decode(filename):
    data = subprocess.check_output(["ffmpeg","-v","error","-i",str(filename),"-f","f32le","-ar",str(RATE),"-ac","1","-"])
    signal = np.frombuffer(data,dtype="<f4").copy()
    signal -= np.mean(signal)
    magnitude = np.max(np.abs(signal))
    start = int(np.flatnonzero(np.abs(signal)>magnitude*.018)[0])
    signal = signal[max(0,start-int(RATE*.015)):]
    # The preset gain below sets the instrument balance; keep attacks dynamic.
    return signal / max(.08, float(np.quantile(np.abs(signal),.975)))


def detect_root(signal, stated):
    """Check the library's written octave against the recording's fundamental."""
    span = signal[int(RATE*.26):int(RATE*.91)]
    if len(span)<RATE*.15: return stated
    size = 65536
    spectrum = abs(np.fft.rfft(span*np.hanning(len(span)),size))
    correlation = np.fft.irfft(spectrum**2,size)
    frequencies = 440 * 2**((stated+np.array([-12,0,12])-69)/12)
    periods = RATE/frequencies
    scores = []
    for period in periods:
        a,b = round(period*.967), round(period*1.033)
        scores.append(float(max(correlation[a:b+1])))
    # The exact octave should win unless the fundamental is very weak.
    return stated + [-12,0,12][int(np.argmax(np.array(scores)*[.97,1,.90]))]


def samples(cache):
    cache.mkdir(parents=True,exist_ok=True)
    banks = {}
    for instrument,(directory,names) in SAMPLES.items():
        banks[instrument]=[]
        for name in names.split():
            file=cache/(name+".wav")
            if not file.exists():
                remote=quote(directory+"/"+file.name)
                urlretrieve(f"https://raw.githubusercontent.com/sgossner/VSCO-2-CE/{REVISION}/{remote}",file)
            signal=decode(file)
            pitch=re.search(r"(?:_|Harp)([A-G][#b]?\d)(?:_|$)",name)
            root=detect_root(signal,midi(pitch[1])) if pitch else None
            banks[instrument].append((root,signal))
    return banks


def render(bank):
    rng=np.random.default_rng(781977)
    duration=len(HARMONY)*4*BEAT+3.2
    mix=np.zeros((round(duration*RATE),2),dtype=np.float32)

    @lru_cache(maxsize=100)
    def pitched(part,note,take=0):
        clips=bank[part]
        root,signal=(min(clips,key=lambda clip:abs(note-clip[0])) if clips[0][0] is not None else clips[take%len(clips)])
        rate=2**((note-root)/12) if root is not None else 1
        indexes=np.arange(0,len(signal)-1,rate)
        return np.interp(indexes,np.arange(len(signal)),signal).astype(np.float32)

    def add(signal, time, level, pan):
        begin=max(0,round(time*RATE))
        length=min(len(signal),len(mix)-begin)
        if length<=0:return
        angle=(pan+1)*np.pi/4
        mix[begin:begin+length,0]+=signal[:length]*level*np.cos(angle)
        mix[begin:begin+length,1]+=signal[:length]*level*np.sin(angle)

    def play(part,note,beat,hold,level,pan,take=0):
        note=midi(note) if isinstance(note,str) else note
        clip=pitched(part,note,take)
        percussion=part in {"timpani","cymbal","roll","harp","bow"}
        release=.46 if percussion else .24
        n=min(len(clip),round((hold*BEAT+release)*RATE))
        sample=clip[:n].copy()
        if len(sample)<128:return
        fade=min(n//2,round(RATE*release))
        sample[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)**1.5
        attack=min(len(sample)//4,round(RATE*(.008 if percussion else .046)))
        sample[:attack]*=np.linspace(0,1,attack,dtype=np.float32)
        if not percussion:
            sample*=np.linspace(.74,1.02,len(sample),dtype=np.float32)
        add(sample,beat*BEAT+rng.uniform(-.011,.013),level*rng.uniform(.91,1.08),pan)

    def atmosphere(root,bar,level):
        t=np.arange(round(4.35*BEAT*RATE))/RATE
        f=440*2**((root-69)/12)
        signal=np.sin(2*np.pi*f*t)*.65+np.sin(2*np.pi*f*2.002*t)*.18+np.sin(2*np.pi*f*3.005*t)*.07
        add(signal*np.sin(np.pi*t/t[-1])**1.15,bar*4*BEAT,level,0)

    def chime(note,beat,level):
        t=np.arange(round(2.25*RATE))/RATE
        f=440*2**((midi(note)-69)/12)
        signal=np.sin(2*np.pi*f*t)*np.exp(-t*2.6)+.25*np.sin(2*np.pi*f*2.009*t)*np.exp(-t*5.7)
        signal*=np.minimum(t*100,1)
        add(signal,beat*BEAT,level,.35)

    for bar,key in enumerate(HARMONY):
        t=bar*4
        bass,low,v1,v2,v3,v4=map(midi,CHORDS[key].split())
        climax=24<=bar<32
        motion=12<=bar<20 or climax
        ending=bar>=32
        level=.56 if bar<4 else .80 if bar<12 else .96 if bar<20 else .66 if bar<24 else 1.21 if climax else .64
        atmosphere(bass,bar,.032*level)
        play("bass",bass,t,3.95,.072*level,-.10)
        play("cello",low,t,3.91,.079*level,.22)
        for note,pan in [(v1,-.28),(v2,.16),(v3,-.40)]:
            play("viola",note,t+.08,3.84,.041*level,pan)
        play("violin",v4+12,t+.28,3.61,.029*level,-.31)
        if motion:
            notes=[bass+12,low,v1,low,v2,v1,low,v1]
            for i,note in enumerate(notes):
                play("bow",note,t+i*.5,.22,.107*level*(1.18 if i in (0,3,6) else .76),.29)
            for i in (0,2.5) if climax else (0,):
                play("timpani",0,t+i,1.1,.27*level,-.03,take=(bar+int(i))%3)
        else:
            notes=[v1+12,v3+12,v4+12,v2+12,v4+12]
            for i,beat in enumerate((0,.78,1.52,2.34,3.12)):
                if not ending or i<3: play("harp",notes[i],t+beat,1.27,.105*level*(1-.09*i),-.22)
        if bar in (0,3,11,20,22,34,35):chime("D6" if bar%2==0 else "A5",t+.4,.052*level)
        if bar in (12,16,24,28):
            play("cymbal",0,t,2.9,.16 if climax else .093,.35)
        if bar in (11,19,23,31):
            play("roll",0,t+1.12,2.83,.18 if bar==23 else .12,-.18)
        if 4<=bar<20 or climax:
            phrase=(CLIMAX if climax else THEME)[(bar-(24 if climax else 4))%8]
            for beat,note,hold in phrase:
                n=midi(note)
                if bar<12:
                    play("harp",n,t+beat,hold+.34,.15,-.15)
                    play("violin",n,t+beat+.024,hold,.067,-.35)
                else:
                    play("horn",n-12,t+beat,hold,.18 if climax else .145,-.24)
                    play("violin",n,t+beat+.01,hold,.119 if climax else .075,-.37)
                    if climax and (beat==0 or hold>1.2):
                        play("trumpet",n,t+beat+.04,hold,.090,.32)
            if climax:
                play("trombone",bass+12,t+.012,1.6,.15,.17)
                play("horn",v3,t+2,1.7,.076,.28)
        if 20<=bar<24:
            bridge=[("F5","E5"),("D5","Bb4"),("D5","F5"),("E5","C#5")]
            for i,n in enumerate(bridge[bar-20]):
                play("violin",n,t+i*2,1.8,.085,-.38)
        if ending:
            for beat,note,hold in [[(0,"D5",1.35),(1.5,"A4",.45),(2,"F4",1.8)],THEME[1],[(0,"C5",1.9),(2,"A4",1.8)],[(0,"D5",3.94)]][bar-32]:
                play("harp",note,t+beat,hold,.11,-.22)
                play("violin",note,t+beat+.05,hold,.065,-.35)

    # Cross-channel early reflections and a diffuse stereo decay.
    dry=mix.copy()
    for i in range(37):
        seconds=.032+(i/36)**1.7*2.8+rng.uniform(0,.028)
        offset=round(RATE*seconds)
        gain=.043*np.exp(-seconds*1.5)
        mix[offset:]+=dry[:-offset,::-1 if i%2 else 1]*gain
    fade=round(1.1*RATE)
    mix[-fade:]*=np.linspace(1,0,fade)[:,None]
    mix[:512]*=np.linspace(0,1,512)[:,None]
    return mix * (.85/np.max(np.abs(mix)))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache",type=Path,default=ROOT/"artifacts/theme-samples")
    parser.add_argument("--output",type=Path,default=ROOT/"public/audio/beyond-the-last-orbit.mp3")
    args=parser.parse_args()
    mix=render(samples(args.cache))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([
        "ffmpeg","-y","-v","error","-f","f32le","-ar",str(RATE),"-ac","2","-i","-",
        "-af","highpass=f=28,loudnorm=I=-16:TP=-1.5:LRA=14","-ar",str(RATE),"-b:a","160k",
        "-metadata","title=Beyond the Last Orbit","-metadata","album=Voyager — 49 Years Into the Unknown",
        str(args.output)
    ],input=mix.astype("<f4").tobytes(),check=True)
    print(f"Rendered {len(mix)/RATE:.2f}s to {args.output}")


if __name__=="__main__":
    main()
