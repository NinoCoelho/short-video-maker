import path from "path";
import fs from "fs-extra";

import { type Music, MusicForVideo, MusicMood } from "../types/shorts";
import { Config } from "../config";

export class MusicManager {
  private static musicList: Music[] = [
    {
      file: "ModernWorship1.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship2.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship3.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship4.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship5.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship6.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship7.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship8.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship9.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    {
      file: "ModernWorship10.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    // {
    //   file: "Rise and Shine v1.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v3.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v4.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v5.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Shine v6.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Soar v1.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Rise and Soar v2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 1.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 3.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Inspirational 4.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "Pra Te Adorar.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    {
      file: "O Amor Escolheu Me Amar Cinematic.mp3",
      start: 0,
      end: 180,
      mood: 'inspirational',
    },
    // {
    //   file: "Tu Es Soberano Inspiring Instrumental.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "O Nome de Jesus Instrumental 2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "EPIC Nome Jesus 2.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    // {
    //   file: "EPIC Nome Jesus.mp3",
    //   start: 0,
    //   end: 180,
    //   mood: MusicMoodEnum.inspirational,
    // },
    {
      file: "Sly Sky - Telecasted.mp3",
      start: 0,
      end: 152,
      mood: 'melancholic',
    },
    {
      file: "No.2 Remembering Her - Esther Abrami.mp3",
      start: 2,
      end: 134,
      mood: 'melancholic',
    },
    {
      file: "Champion - Telecasted.mp3",
      start: 0,
      end: 142,
      mood: 'chill',
    },
    {
      file: "Oh Please - Telecasted.mp3",
      start: 0,
      end: 154,
      mood: 'chill',
    },
    {
      file: "Jetski - Telecasted.mp3",
      start: 0,
      end: 142,
      mood: 'uneasy',
    },
    {
      file: "Phantom - Density & Time.mp3",
      start: 0,
      end: 178,
      mood: 'uneasy',
    },
    {
      file: "On The Hunt - Andrew Langdon.mp3",
      start: 0,
      end: 95,
      mood: 'uneasy',
    },
    {
      file: "Name The Time And Place - Telecasted.mp3",
      start: 0,
      end: 142,
      mood: 'excited',
    },
    {
      file: "Delayed Baggage - Ryan Stasik.mp3",
      start: 3,
      end: 108,
      mood: 'euphoric',
    },
    {
      file: "Like It Loud - Dyalla.mp3",
      start: 4,
      end: 160,
      mood: 'euphoric',
    },
    {
      file: "Organic Guitar House - Dyalla.mp3",
      start: 2,
      end: 160,
      mood: 'euphoric',
    },
    {
      file: "Honey, I Dismembered The Kids - Ezra Lipp.mp3",
      start: 2,
      end: 144,
      mood: 'dark',
    },
    {
      file: "Night Hunt - Jimena Contreras.mp3",
      start: 0,
      end: 88,
      mood: 'dark',
    },
    {
      file: "Curse of the Witches - Jimena Contreras.mp3",
      start: 0,
      end: 102,
      mood: 'dark',
    },
    {
      file: "Restless Heart - Jimena Contreras.mp3",
      start: 0,
      end: 94,
      mood: 'sad',
    },
    {
      file: "Heartbeat Of The Wind - Asher Fulero.mp3",
      start: 0,
      end: 124,
      mood: 'sad',
    },
    {
      file: "Hopeless - Jimena Contreras.mp3",
      start: 0,
      end: 250,
      mood: 'sad',
    },
    {
      file: "Touch - Anno Domini Beats.mp3",
      start: 0,
      end: 165,
      mood: 'happy',
    },
    {
      file: "Cafecito por la Manana - Cumbia Deli.mp3",
      start: 0,
      end: 184,
      mood: 'happy',
    },
    {
      file: "Aurora on the Boulevard - National Sweetheart.mp3",
      start: 0,
      end: 130,
      mood: 'happy',
    },
    {
      file: "Buckle Up - Jeremy Korpas.mp3",
      start: 0,
      end: 128,
      mood: 'angry',
    },
    {
      file: "Twin Engines - Jeremy Korpas.mp3",
      start: 0,
      end: 120,
      mood: 'angry',
    },
    {
      file: "Hopeful - Nat Keefe.mp3",
      start: 0,
      end: 175,
      mood: 'hopeful',
    },
    {
      file: "Hopeful Freedom - Asher Fulero.mp3",
      start: 1,
      end: 172,
      mood: 'hopeful',
    },
    {
      file: "Crystaline - Quincas Moreira.mp3",
      start: 0,
      end: 140,
      mood: 'contemplative',
    },
    {
      file: "Final Soliloquy - Asher Fulero.mp3",
      start: 1,
      end: 178,
      mood: 'contemplative',
    },
    {
      file: "Seagull - Telecasted.mp3",
      start: 0,
      end: 123,
      mood: 'funny',
    },
    {
      file: "Banjo Doops - Joel Cummins.mp3",
      start: 0,
      end: 98,
      mood: 'funny',
    },
    {
      file: "Baby Animals Playing - Joel Cummins.mp3",
      start: 0,
      end: 124,
      mood: 'funny',
    },
    {
      file: "Sinister - Anno Domini Beats.mp3",
      start: 0,
      end: 215,
      mood: 'dark',
    },
    {
      file: "Traversing - Godmode.mp3",
      start: 0,
      end: 95,
      mood: 'dark',
    },
    {
      file: "WorshipRehearsal1.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    {
      file: "WorshipRehearsal2.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    {
      file: "WorshipRehearsal3.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    {
      file: "VemMeTocar.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    {
      file: "Vem Me Tocar.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    {
      file: "Vem Me Tocar v2.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    {
      file: "Pra Te Dizer v1.mp3",
      start: 0,
      end: 180,
      mood: 'worship',
    },
    
  ];

  constructor(private config: Config) {}
  public musicList(): MusicForVideo[] {
    return MusicManager.musicList.map((music: Music) => ({
      ...music,
      url: this.getMusicUrl(music.file),
    }));
  }

  /**
   * Get music URL using port-agnostic resolution
   */
  private getMusicUrl(filename: string): string {
    // Return just the relative path - will be resolved based on context
    // Note: Server serves music at /music/, not /api/music/
    return `/music/${encodeURIComponent(filename)}`;
  }
  private musicFileExist(music: Music): boolean {
    return fs.existsSync(path.join(this.config.musicDirPath, music.file));
  }
  public ensureMusicFilesExist(): void {
    for (const music of this.musicList()) {
      if (!this.musicFileExist(music)) {
        throw new Error(`Music file not found: ${music.file}`);
      }
    }
  }
}
